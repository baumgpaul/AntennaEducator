"""FastAPI application for the FDTD Preprocessor service.

Endpoints:
- GET  /health                — service health check
- POST /api/fdtd/mesh         — generate Yee grid from geometry
- POST /api/fdtd/validate     — validate FDTD setup
- GET  /api/fdtd/demos        — list available demo examples
- GET  /api/fdtd/demos/{slug} — get a specific demo with presets
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

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
from backend.common.models.fdtd import MATERIAL_LIBRARY

logger = logging.getLogger(__name__)

DEMOS_DIR = Path(__file__).parent / "demos"

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


@app.get("/api/fdtd/materials")
async def list_materials():
    """Return the built-in material library."""
    return {
        "materials": {
            key: mat.model_dump() for key, mat in MATERIAL_LIBRARY.items()
        }
    }


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


# ---------------------------------------------------------------------------
# Demo examples
# ---------------------------------------------------------------------------

def _load_demo(slug: str) -> dict:
    """Load a demo JSON file by slug (filename without extension)."""
    path = DEMOS_DIR / f"{slug}.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail=f"Demo '{slug}' not found")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/fdtd/demos")
async def list_demos():
    """List available FDTD demo examples."""
    demos = []
    if DEMOS_DIR.is_dir():
        for path in sorted(DEMOS_DIR.glob("*.json")):
            try:
                with open(path, encoding="utf-8") as f:
                    data = json.load(f)
                demos.append({
                    "slug": path.stem,
                    "name": data.get("name", path.stem),
                    "description": data.get("description", ""),
                    "presets": list(data.get("presets", {}).keys()),
                })
            except (json.JSONDecodeError, KeyError):
                logger.warning("Skipping invalid demo file: %s", path.name)
    return {"demos": demos}


@app.get("/api/fdtd/demos/{slug}")
async def get_demo(slug: str, preset: str = "small"):
    """Get a specific demo example with the requested preset.

    Query params:
        preset — "small" (default) or "large"
    """
    data = _load_demo(slug)
    presets = data.get("presets", {})
    if preset not in presets:
        available = list(presets.keys())
        raise HTTPException(
            status_code=400,
            detail=f"Preset '{preset}' not available. Choose from: {available}",
        )
    return {
        "slug": slug,
        "name": data["name"],
        "description": data["description"],
        "preset": preset,
        **presets[preset],
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8004)
