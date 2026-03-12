"""FastAPI application for the FDTD Preprocessor service.

Endpoints:
- GET  /health           — service health check
- POST /api/fdtd/mesh    — generate Yee grid from geometry
- POST /api/fdtd/validate — validate FDTD setup
"""

from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .builders import (
    apply_boundary,
    apply_source,
    apply_structure,
    build_yee_grid,
    validate_setup,
)
from .config import settings
from .schemas import (
    FdtdMeshRequest,
    FdtdMeshResponse,
    FdtdValidationRequest,
    FdtdValidationResponse,
)

app = FastAPI(
    title="Antenna Simulator — FDTD Preprocessor",
    description="Yee grid generation and FDTD setup validation",
    version=settings.version,
    docs_url=f"{settings.api_prefix}/docs",
    redoc_url=f"{settings.api_prefix}/redoc",
    openapi_url=f"{settings.api_prefix}/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.cors_credentials,
    allow_methods=settings.cors_methods,
    allow_headers=settings.cors_headers,
)


@app.get("/health")
async def health_check():
    return JSONResponse(
        status_code=200,
        content={
            "status": "healthy",
            "service": settings.service_name,
            "version": settings.version,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


@app.post("/api/fdtd/mesh", response_model=FdtdMeshResponse)
async def generate_mesh(request: FdtdMeshRequest):
    """Build a Yee grid from the geometry definition."""
    try:
        geometry = request.geometry
        grid = build_yee_grid(geometry)

        # Apply structures (painter's algorithm)
        for structure in geometry.structures:
            apply_structure(grid, structure)

        # Apply sources → collect placement info
        source_info = []
        for source in geometry.sources:
            info = apply_source(grid, source)
            source_info.append(info)

        # Apply boundaries
        bc_info = apply_boundary(grid, geometry.boundaries)

        return FdtdMeshResponse(
            nx=grid["nx"],
            ny=grid["ny"],
            nz=grid["nz"],
            dx=grid["dx"],
            dy=grid["dy"],
            dz=grid["dz"],
            total_cells=grid["nx"] * grid["ny"] * grid["nz"],
            structures_applied=len(geometry.structures),
            sources=source_info,
            boundaries=bc_info,
            message="Grid generated successfully",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.post("/api/fdtd/validate", response_model=FdtdValidationResponse)
async def validate(request: FdtdValidationRequest):
    """Validate an FDTD simulation setup."""
    try:
        result = validate_setup(request.geometry, request.config)
        return FdtdValidationResponse(
            valid=len(result["errors"]) == 0,
            warnings=result["warnings"],
            errors=result["errors"],
            nx=result["nx"],
            ny=result["ny"],
            nz=result["nz"],
            dt=result["dt"],
            total_cells=result["total_cells"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8004)
