"""FastAPI application for the FDTD Postprocessor service.

Endpoints for field extraction, SAR computation, Poynting vector,
radiation patterns, and RCS from FDTD solver output.
"""

import logging

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .far_field import compute_rcs_2d, near_to_far_field_2d
from .field_extraction import (
    compute_poynting_vector_1d,
    compute_poynting_vector_2d_tm,
    compute_sar,
    extract_field_snapshot,
    extract_frequency_field,
)
from .schemas import (
    FieldSnapshotRequest,
    FieldSnapshotResponse,
    FrequencyFieldRequest,
    FrequencyFieldResponse,
    PoyntingRequest,
    PoyntingResponse,
    RadiationPatternRequest,
    RadiationPatternResponse,
    RcsRequest,
    RcsResponse,
    SarRequest,
    SarResponse,
    SParamRequest,
    SParamResponse,
)

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="FDTD Postprocessor Service",
    description="Field extraction, SAR, Poynting vector, radiation pattern, and RCS computation",
    version=settings.version,
    docs_url=f"{settings.api_prefix}/fdtd/postprocessor/docs",
    redoc_url=f"{settings.api_prefix}/fdtd/postprocessor/redoc",
    openapi_url=f"{settings.api_prefix}/fdtd/postprocessor/openapi.json",
)

# CORS — skip in Lambda (Function URLs handle CORS)
import os

if not os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=settings.cors_credentials,
        allow_methods=settings.cors_methods,
        allow_headers=settings.cors_headers,
    )

logger.info(
    "FDTD Postprocessor service v%s starting (debug=%s)",
    settings.version,
    settings.debug,
)


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "healthy", "service": settings.service_name, "version": settings.version}


# ---------------------------------------------------------------------------
# Field extraction
# ---------------------------------------------------------------------------
@app.post(
    "/api/fdtd/fields/extract",
    response_model=FieldSnapshotResponse,
)
async def extract_fields(request: FieldSnapshotRequest):
    """Extract field snapshot with spatial coordinates."""
    try:
        field_data = np.array(request.field_data)
        result = extract_field_snapshot(field_data, request.dx, request.dy)
        return FieldSnapshotResponse(
            field_component=request.field_component,
            **result,
        )
    except Exception as e:
        logger.exception("Field extraction failed")
        raise HTTPException(status_code=400, detail=str(e))


@app.post(
    "/api/fdtd/fields/frequency",
    response_model=FrequencyFieldResponse,
)
async def extract_frequency_fields(request: FrequencyFieldRequest):
    """Extract frequency-domain field magnitude and phase from DFT data."""
    try:
        dft_real = np.array(request.dft_real)
        dft_imag = np.array(request.dft_imag)
        result = extract_frequency_field(dft_real, dft_imag, request.dx, request.dy)
        return FrequencyFieldResponse(
            frequency_hz=request.frequency_hz,
            **result,
        )
    except Exception as e:
        logger.exception("Frequency field extraction failed")
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
# SAR
# ---------------------------------------------------------------------------
@app.post("/api/fdtd/sar", response_model=SarResponse)
async def compute_sar_endpoint(request: SarRequest):
    """Compute Specific Absorption Rate: SAR = σ|E|² / (2ρ)."""
    try:
        e_mag = np.array(request.e_field_magnitude)
        sigma = np.array(request.sigma)
        density = np.array(request.density)

        if e_mag.shape != sigma.shape or e_mag.shape != density.shape:
            raise ValueError(
                f"Shape mismatch: e_field={e_mag.shape}, sigma={sigma.shape}, "
                f"density={density.shape}"
            )

        result = compute_sar(e_mag, sigma, density)

        sar_array = result["sar"]
        if sar_array.ndim == 1:
            nx = sar_array.shape[0]
            x_coords = [i * request.dx for i in range(nx)]
            y_coords = []
        else:
            nx, ny = sar_array.shape
            x_coords = [i * request.dx for i in range(nx)]
            y_coords = [j * request.dy for j in range(ny)]

        return SarResponse(
            sar=sar_array.tolist(),
            peak_sar=result["peak_sar"],
            average_sar=result["average_sar"],
            x_coords=x_coords,
            y_coords=y_coords,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("SAR computation failed")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Poynting vector / energy
# ---------------------------------------------------------------------------
@app.post("/api/fdtd/energy", response_model=PoyntingResponse)
async def compute_energy(request: PoyntingRequest):
    """Compute Poynting vector S = E × H and energy density."""
    try:
        e_fields = request.e_fields
        h_fields = request.h_fields

        # Determine dimensionality from field shapes
        if "Ez" in e_fields and "Hx" in h_fields and "Hy" in h_fields:
            ez = np.array(e_fields["Ez"])
            hx = np.array(h_fields["Hx"])
            hy = np.array(h_fields["Hy"])

            if ez.ndim == 1:
                # 1-D case
                hy_1d = np.array(h_fields.get("Hy", h_fields.get("Hx", [])))
                result = compute_poynting_vector_1d(ez, hy_1d)
                return PoyntingResponse(
                    sx=result["sx"].tolist(),
                    sy=[],
                    sz=[],
                    magnitude=result["magnitude"].tolist(),
                    total_power=result["total_power"],
                )
            else:
                # 2-D TM mode
                result = compute_poynting_vector_2d_tm(ez, hx, hy)
                return PoyntingResponse(
                    sx=result["sx"].tolist(),
                    sy=result["sy"].tolist(),
                    sz=[],
                    magnitude=result["magnitude"].tolist(),
                    total_power=result["total_power"],
                )
        elif "Ez" in e_fields and "Hy" in h_fields:
            # 1-D only Ez and Hy
            ez = np.array(e_fields["Ez"])
            hy = np.array(h_fields["Hy"])
            result = compute_poynting_vector_1d(ez, hy)
            return PoyntingResponse(
                sx=result["sx"].tolist(),
                sy=[],
                sz=[],
                magnitude=result["magnitude"].tolist(),
                total_power=result["total_power"],
            )
        else:
            raise ValueError(
                "Unsupported field combination. Need at least Ez+Hy (1-D) " "or Ez+Hx+Hy (2-D TM)."
            )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Poynting vector computation failed")
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Radiation pattern
# ---------------------------------------------------------------------------
@app.post(
    "/api/fdtd/pattern/radiation",
    response_model=RadiationPatternResponse,
)
async def compute_radiation_pattern(request: RadiationPatternRequest):
    """Compute 2-D far-field radiation pattern from near-field data."""
    try:
        ez = np.array(request.e_field, dtype=complex)
        hx = np.array(request.h_field_x, dtype=complex)
        hy = np.array(request.h_field_y, dtype=complex)

        result = near_to_far_field_2d(
            ez_surface=ez,
            hx_surface=hx,
            hy_surface=hy,
            dx=request.dx,
            dy=request.dy,
            frequency_hz=request.frequency_hz,
            num_angles=request.num_angles,
        )

        return RadiationPatternResponse(
            angles_deg=result["angles_deg"],
            pattern_db=result["pattern_db"],
            pattern_linear=result["pattern_linear"],
            max_directivity_db=result["max_directivity_db"],
            beam_width_deg=result["beam_width_deg"],
        )
    except Exception as e:
        logger.exception("Radiation pattern computation failed")
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
# RCS
# ---------------------------------------------------------------------------
@app.post("/api/fdtd/rcs", response_model=RcsResponse)
async def compute_rcs(request: RcsRequest):
    """Compute 2-D bistatic radar cross section."""
    try:
        scattered_e = np.array(request.scattered_e, dtype=complex)
        scattered_h = np.array(request.scattered_h, dtype=complex)

        result = compute_rcs_2d(
            scattered_e=scattered_e,
            scattered_h=scattered_h,
            incident_e0=request.incident_e0,
            frequency_hz=request.frequency_hz,
            contour_radius=request.contour_radius,
            num_angles=request.num_angles,
        )

        return RcsResponse(**result)
    except Exception as e:
        logger.exception("RCS computation failed")
        raise HTTPException(status_code=400, detail=str(e))


# ---------------------------------------------------------------------------
# S-parameters
# ---------------------------------------------------------------------------
@app.post("/api/fdtd/sparams", response_model=SParamResponse)
async def compute_sparams(request: SParamRequest):
    """Compute S₁₁ from time-domain incident / reflected probe signals."""
    try:
        frequencies = np.linspace(
            request.freq_start_hz, request.freq_stop_hz, request.num_freqs
        ).tolist()

        from backend.solver_fdtd.postprocess import s_parameter_from_probes

        result = s_parameter_from_probes(
            incident_values=request.incident_values,
            reflected_values=request.reflected_values,
            times=request.times,
            frequencies=frequencies,
        )
        return SParamResponse(**result)
    except Exception as e:
        logger.exception("S-parameter computation failed")
        raise HTTPException(status_code=400, detail=str(e))
