"""FastAPI application for the Postprocessor service."""

import base64
import logging
from datetime import datetime, timezone

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from .config import settings
from .field import compute_directivity_from_pattern, compute_far_field
from .field import compute_near_field as compute_near_field_impl
from .models import FarFieldRequest, FieldRequest, RadiationPatternResponse

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


@app.post(
    f"{settings.api_prefix}/fields/near",
    response_model=dict,
    summary="Compute near-field at observation points",
)
async def compute_near_field(request: FieldRequest):
    """Compute electric and magnetic fields at specified observation points."""
    try:
        frequencies = np.array(request.frequencies)
        nodes = np.array(request.nodes)
        edges = np.array(request.edges)
        observation_points = np.array(request.observation_points)
        branch_currents = _parse_branch_currents(request.branch_currents)

        E_field, H_field = compute_near_field_impl(
            frequencies=frequencies,
            branch_currents=branch_currents,
            nodes=nodes,
            edges=edges,
            observation_points=observation_points,
        )

        # Extract first frequency results (n_points x 3, complex)
        E_vectors = E_field[0]
        H_vectors = H_field[0]

        E_magnitudes = np.linalg.norm(E_vectors, axis=1).tolist()
        H_magnitudes = np.linalg.norm(H_vectors, axis=1).tolist()

        E_field_json = []
        H_field_json = []
        for i in range(len(observation_points)):
            E_field_json.append(
                {
                    "x": {"real": float(E_vectors[i, 0].real), "imag": float(E_vectors[i, 0].imag)},
                    "y": {"real": float(E_vectors[i, 1].real), "imag": float(E_vectors[i, 1].imag)},
                    "z": {"real": float(E_vectors[i, 2].real), "imag": float(E_vectors[i, 2].imag)},
                    "magnitude": float(E_magnitudes[i]),
                }
            )
            H_field_json.append(
                {
                    "x": {"real": float(H_vectors[i, 0].real), "imag": float(H_vectors[i, 0].imag)},
                    "y": {"real": float(H_vectors[i, 1].real), "imag": float(H_vectors[i, 1].imag)},
                    "z": {"real": float(H_vectors[i, 2].real), "imag": float(H_vectors[i, 2].imag)},
                    "magnitude": float(H_magnitudes[i]),
                }
            )

        return {
            "status": "success",
            "frequency": float(frequencies[0]),
            "num_points": len(observation_points),
            "E_field": E_field_json,
            "H_field": H_field_json,
            "E_magnitudes": E_magnitudes,
            "H_magnitudes": H_magnitudes,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        logger.exception("Near-field computation error")
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
            radii=np.array(request.radii),
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
