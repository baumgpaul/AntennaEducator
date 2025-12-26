"""FastAPI application for the Postprocessor service."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime

from .config import settings
from .models import (
    FieldRequest,
    FarFieldRequest,
    RadiationPatternResponse,
    AntennaParametersRequest
)

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


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "postprocessor",
        "version": settings.version,
        "timestamp": datetime.utcnow().isoformat()
    }


@app.get(f"{settings.api_prefix}/status")
async def get_status():
    """Get service status and configuration."""
    return {
        "service": settings.service_name,
        "version": settings.version,
        "debug": settings.debug,
        "api_prefix": settings.api_prefix,
        "field_defaults": {
            "theta_points": settings.default_theta_points,
            "phi_points": settings.default_phi_points,
            "far_field_factor": settings.far_field_distance_factor
        },
        "timestamp": datetime.utcnow().isoformat()
    }


@app.post(
    f"{settings.api_prefix}/fields/near",
    response_model=dict,
    summary="Compute near-field at observation points"
)
async def compute_near_field(request: FieldRequest):
    """
    Compute electric and magnetic fields at specified observation points.
    
    This endpoint will compute:
    - Electric field (E-field) vectors
    - Magnetic field (H-field) vectors
    - Field magnitudes and directions
    """
    try:
        # TODO: Implement actual near-field computation
        # For now, return a placeholder response
        return {
            "status": "success",
            "message": "Near-field computation endpoint - implementation pending",
            "frequencies": request.frequencies,
            "num_observation_points": len(request.observation_points),
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Near-field computation failed: {str(e)}")


@app.post(
    f"{settings.api_prefix}/fields/far",
    response_model=dict,
    summary="Compute far-field radiation pattern"
)
async def compute_far_field(request: FarFieldRequest):
    """
    Compute far-field radiation pattern over angular grid.
    
    This endpoint computes:
    - 3D radiation pattern
    - Directivity and gain
    - Beamwidths
    - Maximum radiation direction
    """
    try:
        # TODO: Implement actual far-field computation
        # For now, return a placeholder response
        return {
            "status": "success",
            "message": "Far-field computation endpoint - implementation pending",
            "frequencies": request.frequencies,
            "angular_resolution": {
                "theta_points": request.theta_points,
                "phi_points": request.phi_points
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Far-field computation failed: {str(e)}")


@app.post(
    f"{settings.api_prefix}/parameters",
    response_model=dict,
    summary="Extract antenna parameters"
)
async def extract_antenna_parameters(request: AntennaParametersRequest):
    """
    Extract antenna parameters from simulation results.
    
    Computes:
    - VSWR (Voltage Standing Wave Ratio)
    - Return loss
    - Reflection coefficient
    - Bandwidth estimates
    - Radiation efficiency
    """
    try:
        # TODO: Implement actual parameter extraction
        # For now, return a placeholder response
        return {
            "status": "success",
            "message": "Antenna parameter extraction endpoint - implementation pending",
            "frequencies": request.frequencies,
            "num_frequencies": len(request.frequencies),
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parameter extraction failed: {str(e)}")


@app.get(f"{settings.api_prefix}/info")
async def get_info():
    """Get information about available postprocessing capabilities."""
    return {
        "service": "postprocessor",
        "version": settings.version,
        "capabilities": {
            "near_field": {
                "description": "Compute E and H fields at observation points",
                "endpoint": f"{settings.api_prefix}/fields/near"
            },
            "far_field": {
                "description": "Compute radiation patterns and directivity",
                "endpoint": f"{settings.api_prefix}/fields/far"
            },
            "antenna_parameters": {
                "description": "Extract VSWR, return loss, efficiency",
                "endpoint": f"{settings.api_prefix}/parameters"
            }
        },
        "default_settings": {
            "theta_resolution": f"{settings.default_theta_points} points (0° to 180°)",
            "phi_resolution": f"{settings.default_phi_points} points (0° to 360°)",
            "far_field_criterion": f"{settings.far_field_distance_factor}λ"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
