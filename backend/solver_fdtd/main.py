"""FastAPI application for the FDTD Solver service.

Provides 1-D, 2-D, and 3-D FDTD electromagnetic simulation endpoints.
Port: 8005
"""

import logging
from datetime import datetime, timezone

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.common.models.fdtd import FdtdConfig, FdtdGeometry, compute_courant_limit
from backend.fdtd_preprocessor.builders import (
    apply_source,
    apply_structure,
    build_yee_grid,
)

from .config import settings
from .engine_1d import run_fdtd_1d
from .engine_2d import run_fdtd_2d
from .engine_3d import run_fdtd_3d
from .probes import LineProbe, PlaneProbe, PointProbe
from .schemas import FdtdSolveRequest, FdtdSolveResponse, FdtdSolverConfigResponse

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Antenna Simulator — FDTD Solver",
    description="Finite-Difference Time-Domain electromagnetic solver (1-D + 2-D + 3-D)",
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


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/health")
async def health_check():
    return JSONResponse(
        status_code=200,
        content={
            "status": "healthy",
            "service": settings.service_name,
            "version": settings.version,
            "solver_type": "fdtd",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


# ---------------------------------------------------------------------------
# Solver config
# ---------------------------------------------------------------------------
@app.get(f"{settings.api_prefix}/fdtd/solve/config", response_model=FdtdSolverConfigResponse)
async def get_solver_config():
    """Return solver capabilities and limits."""
    gpu = False
    try:
        import cupy  # type: ignore[import-untyped]  # noqa: F401

        gpu = True
    except ImportError:
        pass

    return FdtdSolverConfigResponse(
        max_time_steps=settings.max_time_steps,
        timeout_seconds=settings.timeout_seconds,
        gpu_available=gpu,
    )


# ---------------------------------------------------------------------------
# Solve
# ---------------------------------------------------------------------------
@app.post(f"{settings.api_prefix}/fdtd/solve", response_model=FdtdSolveResponse)
async def solve(request: FdtdSolveRequest):
    """Run an FDTD simulation (1-D, 2-D, or 3-D)."""
    # --- Validation ---
    if request.config.num_time_steps > settings.max_time_steps:
        raise HTTPException(
            status_code=400,
            detail=f"num_time_steps ({request.config.num_time_steps}) exceeds "
                   f"limit ({settings.max_time_steps})",
        )

    if not request.sources:
        raise HTTPException(status_code=400, detail="At least one source is required")

    dx, dy, dz = request.cell_size
    if dx <= 0:
        raise HTTPException(status_code=400, detail="cell_size dx must be positive")

    # Build geometry for preprocessor
    geometry = FdtdGeometry(
        domain_size=request.domain_size,
        cell_size=request.cell_size,
        structures=request.structures,
        sources=request.sources,
        boundaries=request.boundaries,
        probes=request.probes,
    )
    nx, ny, nz = geometry.grid_dimensions

    if request.dimensionality == "2d" and (nx < 3 or ny < 3):
        raise HTTPException(
            status_code=400,
            detail=f"2-D grid too small ({nx}×{ny}). Each dimension needs "
                   f"at least 3 cells. Reduce cell_size or increase domain_size.",
        )

    if request.dimensionality == "3d":
        if nx < 3 or ny < 3 or nz < 3:
            raise HTTPException(
                status_code=400,
                detail=f"3-D grid too small ({nx}\u00d7{ny}\u00d7{nz}). "
                       f"Each dimension needs at least 3 cells.",
            )
        # Memory estimate: 6 field arrays + ~4 coefficient arrays
        mem_bytes = 10 * nx * ny * nz * 8  # float64
        max_mem = 1_500_000_000  # ~1.5 GB safety limit for Lambda
        if mem_bytes > max_mem:
            raise HTTPException(
                status_code=400,
                detail=f"3-D grid {nx}\u00d7{ny}\u00d7{nz} requires ~{mem_bytes // 1_000_000} MB. "
                       f"Maximum is ~{max_mem // 1_000_000} MB. Reduce grid size.",
            )

    try:
        if request.dimensionality == "1d":
            result = _solve_1d(request, geometry, nx, dx)
        elif request.dimensionality == "2d":
            result = _solve_2d(request, geometry, nx, ny, dx, dy)
        else:
            result = _solve_3d(request, geometry, nx, ny, nz, dx, dy, dz)
    except Exception as e:
        logger.exception("FDTD solve failed")
        raise HTTPException(status_code=500, detail=str(e))

    return FdtdSolveResponse(
        dimensionality=request.dimensionality,
        mode=result.get("mode", "tm"),
        total_time_steps=result["total_time_steps"],
        dt=result["dt"],
        solve_time_s=result["solve_time_s"],
        fields_final=result.get("fields_final", {}),
        probe_data=result.get("probe_data", []),
        dft_results=result.get("dft_results", {}),
    )


# ---------------------------------------------------------------------------
# Internal: 1-D solve
# ---------------------------------------------------------------------------
def _solve_1d(request: FdtdSolveRequest, geometry: FdtdGeometry, nx: int, dx: float) -> dict:
    grid = build_yee_grid(geometry)

    # Apply structures (1-D: use first axis slice)
    for s in request.structures:
        apply_structure(grid, s)
    epsilon_r_1d = grid["epsilon_r"][:, 0, 0]
    mu_r_1d = grid["mu_r"][:, 0, 0]
    sigma_1d = grid["sigma"][:, 0, 0]

    # Map sources to 1-D grid indices
    sources = []
    for src in request.sources:
        placed = apply_source(grid, src)
        sources.append({
            "index": placed["cell_indices"][0],
            "type": placed["type"],
            "parameters": placed["parameters"],
            "soft": True,
        })

    # Build probes
    probes = _build_probes_1d(request, grid)

    # Boundary type (use x_min, assume symmetric)
    bc = request.boundaries.x_min.type

    result = run_fdtd_1d(
        nx=nx,
        dx=dx,
        config=request.config,
        sources=sources,
        boundary_type=bc,
        epsilon_r=epsilon_r_1d,
        mu_r=mu_r_1d,
        sigma=sigma_1d,
        probes=probes,
    )
    # Wrap 1-D fields in the same structure
    result["fields_final"] = {
        "Ez": result.pop("Ez_final"),
        "Hy": result.pop("Hy_final"),
    }
    result["mode"] = "1d"
    return result


# ---------------------------------------------------------------------------
# Internal: 2-D solve
# ---------------------------------------------------------------------------
def _solve_2d(request: FdtdSolveRequest, geometry: FdtdGeometry,
              nx: int, ny: int, dx: float, dy: float) -> dict:
    grid = build_yee_grid(geometry)

    for s in request.structures:
        apply_structure(grid, s)
    epsilon_r_2d = grid["epsilon_r"][:, :, 0]
    mu_r_2d = grid["mu_r"][:, :, 0]
    sigma_2d = grid["sigma"][:, :, 0]

    sources = []
    for src in request.sources:
        placed = apply_source(grid, src)
        sources.append({
            "ix": placed["cell_indices"][0],
            "iy": placed["cell_indices"][1],
            "type": placed["type"],
            "parameters": placed["parameters"],
            "soft": True,
        })

    probes = _build_probes_2d(request, grid)
    bc = request.boundaries.x_min.type

    return run_fdtd_2d(
        nx=nx,
        ny=ny,
        dx=dx,
        dy=dy,
        config=request.config,
        sources=sources,
        boundary_type=bc,
        epsilon_r=epsilon_r_2d,
        mu_r=mu_r_2d,
        sigma=sigma_2d,
        probes=probes,
        mode=request.mode,
    )


# ---------------------------------------------------------------------------
# Probe builders
# ---------------------------------------------------------------------------
def _build_probes_1d(request: FdtdSolveRequest, grid: dict) -> list:
    probes = []
    dx = grid["dx"]
    nx = grid["nx"]
    for p in request.probes:
        ix = min(max(round(p.position[0] / dx), 0), nx - 1)
        if p.type == "point":
            probes.append(PointProbe(name=p.name, ix=ix, field_component=p.fields[0]))
        elif p.type == "line":
            probes.append(LineProbe(name=p.name, field_component=p.fields[0]))
    return probes


def _build_probes_2d(request: FdtdSolveRequest, grid: dict) -> list:
    probes = []
    dx, dy = grid["dx"], grid["dy"]
    nx, ny = grid["nx"], grid["ny"]
    for p in request.probes:
        ix = min(max(round(p.position[0] / dx), 0), nx - 1)
        iy = min(max(round(p.position[1] / dy), 0), ny - 1)
        if p.type == "point":
            probes.append(PointProbe(
                name=p.name, ix=ix, iy=iy, field_component=p.fields[0],
            ))
        elif p.type == "line":
            probes.append(LineProbe(name=p.name, index=iy, field_component=p.fields[0]))
        elif p.type == "plane":
            probes.append(PlaneProbe(name=p.name, field_component=p.fields[0]))
    return probes


# ---------------------------------------------------------------------------
# Internal: 3-D solve
# ---------------------------------------------------------------------------
def _solve_3d(
    request: FdtdSolveRequest,
    geometry: FdtdGeometry,
    nx: int, ny: int, nz: int,
    dx: float, dy: float, dz: float,
) -> dict:
    grid = build_yee_grid(geometry)

    for s in request.structures:
        apply_structure(grid, s)
    epsilon_r_3d = grid["epsilon_r"]
    mu_r_3d = grid["mu_r"]
    sigma_3d = grid["sigma"]

    sources = []
    for src in request.sources:
        placed = apply_source(grid, src)
        sources.append({
            "ix": placed["cell_indices"][0],
            "iy": placed["cell_indices"][1],
            "iz": placed["cell_indices"][2],
            "type": placed["type"],
            "parameters": placed["parameters"],
            "soft": True,
        })

    probes = _build_probes_3d(request, grid)
    bc = request.boundaries.x_min.type

    result = run_fdtd_3d(
        nx=nx,
        ny=ny,
        nz=nz,
        dx=dx,
        dy=dy,
        dz=dz,
        config=request.config,
        sources=sources,
        boundary_type=bc,
        epsilon_r=epsilon_r_3d,
        mu_r=mu_r_3d,
        sigma=sigma_3d,
        probes=probes,
    )
    result["mode"] = "3d"
    return result


def _build_probes_3d(request: FdtdSolveRequest, grid: dict) -> list:
    probes = []
    dx, dy, dz = grid["dx"], grid["dy"], grid["dz"]
    nx, ny, nz = grid["nx"], grid["ny"], grid["nz"]
    for p in request.probes:
        ix = min(max(round(p.position[0] / dx), 0), nx - 1)
        iy = min(max(round(p.position[1] / dy), 0), ny - 1)
        iz = min(max(round(p.position[2] / dz), 0), nz - 1)
        if p.type == "point":
            probes.append(PointProbe(
                name=p.name, ix=ix, iy=iy, iz=iz,
                field_component=p.fields[0],
            ))
        elif p.type == "plane":
            probes.append(PlaneProbe(
                name=p.name,
                field_component=p.fields[0],
                slice_axis="z",
                slice_index=nz // 2,  # Default: mid-plane
            ))
    return probes


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8005)
