"""FastAPI application for the Postprocessor service."""

import base64
import logging
import time
from datetime import datetime, timezone

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import Response

from .config import settings
from .field import compute_directivity_from_pattern, compute_far_field
from .field import compute_near_field as compute_near_field_impl
from .models import FarFieldRequest, FieldRequest, RadiationPatternResponse

# Configure logging level from settings
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Initialize FastAPI application
app = FastAPI(
    title="PEEC Antenna Simulator - Postprocessor Service",
    description="Field computation and antenna parameter extraction service",
    version=settings.version,
    docs_url=f"{settings.api_prefix}/docs",
    redoc_url=f"{settings.api_prefix}/redoc",
    openapi_url=f"{settings.api_prefix}/openapi.json",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.cors_credentials,
    allow_methods=settings.cors_methods,
    allow_headers=settings.cors_headers,
)

# Compress responses to stay within Lambda 6 MB payload limit.
# GZip middleware is added after CORS so it wraps outermost —
# the body is compressed while CORS headers remain unaffected.
app.add_middleware(GZipMiddleware, minimum_size=1000)

logger.info(
    "Postprocessor service v%s starting (debug=%s, log_level=%s, log_timing=%s)",
    settings.version,
    settings.debug,
    settings.log_level,
    settings.log_timing,
)


def _parse_branch_currents(raw_currents: list) -> np.ndarray:
    """Parse branch_currents from various serialisation formats into a complex ndarray.

    Accepts per-frequency lists where each element can be:
      - a Python complex number
      - a string like ``"1+2j"``
      - a dict ``{"real": 1, "imag": 2}``
      - a [real, imag] list/tuple pair

    Returns:
        2-D complex ndarray of shape ``(n_frequencies, n_branches)``.
    """
    parsed: list[list[complex]] = []
    for freq_currents in raw_currents:
        currents: list[complex] = []
        for c in freq_currents:
            if isinstance(c, (list, tuple)) and len(c) == 2:
                currents.append(complex(c[0], c[1]))
            elif isinstance(c, str):
                currents.append(complex(c.replace(" ", "").replace("i", "j")))
            elif isinstance(c, dict) and "real" in c and "imag" in c:
                currents.append(complex(c["real"], c["imag"]))
            else:
                currents.append(complex(c))
        parsed.append(currents)

    arr = np.array(parsed, dtype=complex)
    if arr.ndim == 1:
        arr = arr.reshape(1, -1)
    return arr


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "postprocessor",
        "version": settings.version,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def _estimate_computation_time(n_points: int, n_edges: int, n_freq: int) -> dict:
    """Estimate computation time for near-field calculation.

    The vectorized implementation processes all observation points × 19-point
    stencil × all edges in a single batched NumPy call per frequency.
    The bottleneck is the batch vector-potential evaluation.
    """
    stencil_points = 19  # finite-difference stencil size
    total_evaluations = n_points * stencil_points * n_edges * n_freq
    # Rough estimate: ~0.5μs per evaluation on Lambda (2048 MB) with vectorized code
    est_seconds = total_evaluations * 5e-7
    return {
        "n_points": n_points,
        "n_edges": n_edges,
        "n_freq": n_freq,
        "stencil_size": stencil_points,
        "total_evaluations": total_evaluations,
        "estimated_seconds": round(est_seconds, 1),
    }


@app.post(
    f"{settings.api_prefix}/fields/near",
    response_model=dict,
    summary="Compute near-field at observation points",
)
async def compute_near_field(request: FieldRequest):
    """Compute electric and magnetic fields at specified observation points."""
    t_start = time.perf_counter()
    try:
        n_points = len(request.observation_points)
        n_edges = len(request.edges)
        n_nodes = len(request.nodes)
        n_freq = len(request.frequencies)
        n_branches = len(request.branch_currents[0]) if request.branch_currents else 0

        logger.info(
            "=== Near-field request received ==="
            " | frequencies=%d (%.2f MHz)"
            " | observation_points=%d"
            " | edges=%d, nodes=%d, branches=%d",
            n_freq,
            request.frequencies[0] / 1e6 if request.frequencies else 0,
            n_points,
            n_edges,
            n_nodes,
            n_branches,
        )

        estimate = _estimate_computation_time(n_points, n_edges, n_freq)
        logger.info(
            "Computation estimate: %d total evals, ~%.1f s",
            estimate["total_evaluations"],
            estimate["estimated_seconds"],
        )

        if n_points > settings.max_observation_points:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Too many observation points: {n_points}. "
                    f"Maximum allowed is {settings.max_observation_points}. "
                    f"Reduce sampling resolution."
                ),
            )

        t_parse = time.perf_counter()
        frequencies = np.array(request.frequencies)
        nodes = np.array(request.nodes)
        edges = np.array(request.edges)
        observation_points = np.array(request.observation_points)
        branch_currents = _parse_branch_currents(request.branch_currents)
        logger.info("Request parsed in %.3f s", time.perf_counter() - t_parse)

        logger.debug(
            "Array shapes: frequencies=%s, nodes=%s, edges=%s, obs_points=%s, currents=%s",
            frequencies.shape,
            nodes.shape,
            edges.shape,
            observation_points.shape,
            branch_currents.shape,
        )

        t_compute = time.perf_counter()
        E_field, H_field = compute_near_field_impl(
            frequencies=frequencies,
            branch_currents=branch_currents,
            nodes=nodes,
            edges=edges,
            observation_points=observation_points,
        )
        compute_duration = time.perf_counter() - t_compute
        logger.info("Near-field computation completed in %.2f s", compute_duration)

        # Extract first frequency results (n_points x 3, complex)
        E_vectors = E_field[0]
        H_vectors = H_field[0]

        E_magnitudes = np.linalg.norm(E_vectors, axis=1).tolist()
        H_magnitudes = np.linalg.norm(H_vectors, axis=1).tolist()

        # Log field statistics
        E_mag_arr = np.array(E_magnitudes)
        H_mag_arr = np.array(H_magnitudes)
        logger.info(
            "Field stats: |E| min=%.4e max=%.4e mean=%.4e | |H| min=%.4e max=%.4e mean=%.4e",
            E_mag_arr.min(),
            E_mag_arr.max(),
            E_mag_arr.mean(),
            H_mag_arr.min(),
            H_mag_arr.max(),
            H_mag_arr.mean(),
        )

        total_duration = time.perf_counter() - t_start
        logger.info("=== Near-field request completed in %.2f s ===", total_duration)

        # Compact flat-array format: 5-10× smaller than per-point dicts.
        # Each array is [x0, y0, z0, x1, y1, z1, ...] of length n_points * 3.
        # Frontend reconstructs complex vector objects from these arrays.
        return {
            "status": "success",
            "format": "flat",
            "frequency": float(frequencies[0]),
            "num_points": len(observation_points),
            "E_real": E_vectors.real.flatten().tolist(),
            "E_imag": E_vectors.imag.flatten().tolist(),
            "H_real": H_vectors.real.flatten().tolist(),
            "H_imag": H_vectors.imag.flatten().tolist(),
            "E_magnitudes": E_magnitudes,
            "H_magnitudes": H_magnitudes,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "_debug": {
                "compute_seconds": round(compute_duration, 3),
                "total_seconds": round(total_duration, 3),
                "estimate": estimate,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        total_duration = time.perf_counter() - t_start
        logger.exception("Near-field computation error after %.2f s: %s", total_duration, str(e))
        raise HTTPException(status_code=500, detail=f"Near-field computation failed: {str(e)}")


@app.post(
    f"{settings.api_prefix}/fields/far",
    response_model=RadiationPatternResponse,
    summary="Compute far-field radiation pattern",
)
async def compute_far_field_endpoint(request: FarFieldRequest):
    """Compute far-field radiation pattern over angular grid."""
    try:
        frequencies = np.array(request.frequencies)
        nodes = np.array(request.nodes)
        edges = np.array(request.edges)
        branch_currents = _parse_branch_currents(request.branch_currents)

        theta_angles = np.linspace(0, np.pi, request.theta_points)
        phi_angles = np.linspace(0, 2 * np.pi, request.phi_points)

        E_field, H_field = compute_far_field(
            frequencies=frequencies,
            branch_currents=branch_currents,
            nodes=nodes,
            edges=edges,
            theta_angles=theta_angles,
            phi_angles=phi_angles,
        )

        # Extract first frequency results
        E_theta = E_field[0, :, :, 0]
        E_phi = E_field[0, :, :, 1]

        directivity_linear, directivity_dBi, U_pattern, max_indices = (
            compute_directivity_from_pattern(E_theta, E_phi, theta_angles, phi_angles)
        )

        E_theta_mag = np.abs(E_theta).flatten().tolist()
        E_phi_mag = np.abs(E_phi).flatten().tolist()
        E_total_mag = np.sqrt(np.abs(E_theta) ** 2 + np.abs(E_phi) ** 2).flatten().tolist()

        U_max = np.max(U_pattern)
        pattern_db_array = 10 * np.log10(U_pattern / U_max)
        pattern_db_array = np.nan_to_num(pattern_db_array, nan=-100.0, posinf=0.0, neginf=-100.0)
        pattern_db = pattern_db_array.flatten().tolist()

        max_theta_idx, max_phi_idx = max_indices
        max_theta_deg = np.rad2deg(theta_angles[max_theta_idx])
        max_phi_deg = np.rad2deg(phi_angles[max_phi_idx])

        return RadiationPatternResponse(
            frequency=float(frequencies[0]),
            theta_angles=theta_angles.tolist(),
            phi_angles=phi_angles.tolist(),
            E_theta_mag=E_theta_mag,
            E_phi_mag=E_phi_mag,
            E_total_mag=E_total_mag,
            pattern_db=pattern_db,
            directivity=float(directivity_dBi),
            gain=float(directivity_dBi),  # Assume 100% efficiency for now
            efficiency=1.0,
            beamwidth_theta=None,
            beamwidth_phi=None,
            max_direction=[float(max_theta_deg), float(max_phi_deg)],
        )
    except Exception as e:
        logger.exception("Far-field computation error")
        raise HTTPException(status_code=500, detail=f"Far-field computation failed: {str(e)}")


@app.post(
    f"{settings.api_prefix}/export/vtu",
    response_class=Response,
    summary="Export field data to VTU format for ParaView",
)
async def export_to_vtu(request: FieldRequest):
    """Export electromagnetic field data to VTU (VTK Unstructured Grid) format."""
    try:
        frequency_hz = request.frequencies[0] if request.frequencies else 0
        observation_points = np.array(request.observation_points)
        branch_currents = _parse_branch_currents(request.branch_currents)

        E_vectors, H_vectors = compute_near_field_impl(
            frequencies=np.array(request.frequencies),
            branch_currents=branch_currents,
            nodes=np.array(request.nodes),
            edges=np.array(request.edges),
            observation_points=observation_points,
        )

        E_field = E_vectors[0, :, :]
        H_field = H_vectors[0, :, :]
        E_magnitude = np.linalg.norm(E_field, axis=1)
        H_magnitude = np.linalg.norm(H_field, axis=1)

        vtu_xml = _generate_vtu_xml(
            points=observation_points,
            E_field=E_field,
            H_field=H_field,
            E_magnitude=E_magnitude,
            H_magnitude=H_magnitude,
            frequency=frequency_hz,
        )

        return Response(
            content=vtu_xml,
            media_type="application/xml",
            headers={
                "Content-Disposition": f"attachment; filename=field_data_{frequency_hz / 1e6:.2f}MHz.vtu"
            },
        )
    except Exception as e:
        logger.exception("VTU export error")
        raise HTTPException(status_code=500, detail=f"VTU export failed: {str(e)}")


def _generate_vtu_xml(
    points: np.ndarray,
    E_field: np.ndarray,
    H_field: np.ndarray,
    E_magnitude: np.ndarray,
    H_magnitude: np.ndarray,
    frequency: float,
) -> str:
    """Generate VTU XML string for ParaView visualisation."""
    num_points = len(points)

    def to_base64_float32(arr):
        return base64.b64encode(arr.astype(np.float32).tobytes()).decode("ascii")

    points_b64 = to_base64_float32(points.flatten())
    E_mag_b64 = to_base64_float32(E_magnitude)
    H_mag_b64 = to_base64_float32(H_magnitude)
    E_real_b64 = to_base64_float32(E_field.real.flatten())
    E_imag_b64 = to_base64_float32(E_field.imag.flatten())
    H_real_b64 = to_base64_float32(H_field.real.flatten())
    H_imag_b64 = to_base64_float32(H_field.imag.flatten())

    freq_str = " ".join([f"{frequency / 1e6:.6f}"] * num_points)

    return f"""<?xml version="1.0"?>
<VTKFile type="UnstructuredGrid" version="1.0" byte_order="LittleEndian" header_type="UInt64">
  <UnstructuredGrid>
    <Piece NumberOfPoints="{num_points}" NumberOfCells="0">
      <PointData>
        <DataArray type="Float32" Name="E_Magnitude" format="binary">
          {E_mag_b64}
        </DataArray>
        <DataArray type="Float32" Name="H_Magnitude" format="binary">
          {H_mag_b64}
        </DataArray>
        <DataArray type="Float32" Name="E_Field_Real" NumberOfComponents="3" format="binary">
          {E_real_b64}
        </DataArray>
        <DataArray type="Float32" Name="E_Field_Imag" NumberOfComponents="3" format="binary">
          {E_imag_b64}
        </DataArray>
        <DataArray type="Float32" Name="H_Field_Real" NumberOfComponents="3" format="binary">
          {H_real_b64}
        </DataArray>
        <DataArray type="Float32" Name="H_Field_Imag" NumberOfComponents="3" format="binary">
          {H_imag_b64}
        </DataArray>
        <DataArray type="Float32" Name="Frequency_MHz" format="ascii">
          {freq_str}
        </DataArray>
      </PointData>
      <Points>
        <DataArray type="Float32" Name="Points" NumberOfComponents="3" format="binary">
          {points_b64}
        </DataArray>
      </Points>
      <Cells>
        <DataArray type="Int64" Name="connectivity" format="ascii">
        </DataArray>
        <DataArray type="Int64" Name="offsets" format="ascii">
        </DataArray>
        <DataArray type="UInt8" Name="types" format="ascii">
        </DataArray>
      </Cells>
    </Piece>
  </UnstructuredGrid>
</VTKFile>
"""


@app.get(f"{settings.api_prefix}/debug/config")
async def debug_config():
    """Return current configuration for debugging (no secrets)."""
    import sys

    return {
        "service": "postprocessor",
        "version": settings.version,
        "python_version": sys.version,
        "debug": settings.debug,
        "log_level": settings.log_level,
        "log_timing": settings.log_timing,
        "max_observation_points": settings.max_observation_points,
        "default_theta_points": settings.default_theta_points,
        "default_phi_points": settings.default_phi_points,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post(f"{settings.api_prefix}/debug/estimate")
async def estimate_computation(request: FieldRequest):
    """Estimate computation time without actually computing.

    Useful for pre-flight checks before committing to a long computation.
    """
    n_points = len(request.observation_points)
    n_edges = len(request.edges)
    n_freq = len(request.frequencies)
    estimate = _estimate_computation_time(n_points, n_edges, n_freq)
    lambda_timeout = 300  # current Lambda config
    return {
        **estimate,
        "lambda_timeout_seconds": lambda_timeout,
        "will_likely_timeout": estimate["estimated_seconds"] > lambda_timeout * 0.8,
        "recommendation": (
            f"Reduce observation points from {n_points} to "
            f"~{max(1, int(n_points * lambda_timeout * 0.7 / max(estimate['estimated_seconds'], 1)))} "
            "for safe execution within Lambda timeout."
            if estimate["estimated_seconds"] > lambda_timeout * 0.8
            else "Computation should complete within Lambda timeout."
        ),
    }


@app.get(f"{settings.api_prefix}/info")
async def get_info():
    """Get information about available postprocessing capabilities."""
    return {
        "service": "postprocessor",
        "version": settings.version,
        "capabilities": {
            "near_field": {
                "description": "Compute E and H fields at observation points",
                "endpoint": f"{settings.api_prefix}/fields/near",
            },
            "far_field": {
                "description": "Compute radiation patterns and directivity",
                "endpoint": f"{settings.api_prefix}/fields/far",
            },
            "vtu_export": {
                "description": "Export field data to VTU format for ParaView",
                "endpoint": f"{settings.api_prefix}/export/vtu",
            },
        },
        "default_settings": {
            "theta_resolution": f"{settings.default_theta_points} points (0 to 180 deg)",
            "phi_resolution": f"{settings.default_phi_points} points (0 to 360 deg)",
            "far_field_criterion": f"{settings.far_field_distance_factor} lambda",
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8003)
