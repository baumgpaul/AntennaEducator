"""
FDTD Yee grid builder and setup validation.

Core functions:
- build_yee_grid(geometry) → allocates 3-D material arrays
- apply_structure(grid, structure) → paints material into cells
- apply_source(grid, source) → maps source to cell indices
- apply_boundary(grid, boundaries) → configures face boundary conditions
- validate_setup(geometry, config) → checks CFL, domain, warnings/errors
"""

import math

import numpy as np

from backend.common.models.fdtd import (
    DomainBoundaries,
    FdtdConfig,
    FdtdGeometry,
    FdtdMaterial,
    FdtdSource,
    FdtdStructure,
    MATERIAL_LIBRARY,
    compute_courant_limit,
)


# ---------------------------------------------------------------------------
# Grid building
# ---------------------------------------------------------------------------
def build_yee_grid(geometry: FdtdGeometry) -> dict:
    """Allocate a 3-D Yee grid with material property arrays.

    Returns a dict containing:
        nx, ny, nz: int — grid cell counts
        dx, dy, dz: float — cell sizes [m]
        epsilon_r: ndarray (nx, ny, nz) — relative permittivity
        mu_r: ndarray (nx, ny, nz) — relative permeability
        sigma: ndarray (nx, ny, nz) — electric conductivity [S/m]
    """
    nx, ny, nz = geometry.grid_dimensions
    dx, dy, dz = geometry.cell_size

    grid = {
        "nx": nx,
        "ny": ny,
        "nz": nz,
        "dx": dx,
        "dy": dy,
        "dz": dz,
        # Initialise to vacuum
        "epsilon_r": np.ones((nx, ny, nz), dtype=np.float64),
        "mu_r": np.ones((nx, ny, nz), dtype=np.float64),
        "sigma": np.zeros((nx, ny, nz), dtype=np.float64),
    }
    return grid


# ---------------------------------------------------------------------------
# Structure application helpers
# ---------------------------------------------------------------------------
def _resolve_material(structure: FdtdStructure) -> FdtdMaterial:
    """Look up or return the material for a structure."""
    if structure.material == "custom":
        if structure.custom_material is None:
            raise ValueError(
                f"Structure '{structure.name}': material='custom' requires custom_material"
            )
        return structure.custom_material

    if structure.material not in MATERIAL_LIBRARY:
        raise ValueError(
            f"Unknown material '{structure.material}' for structure '{structure.name}'. "
            f"Available: {sorted(MATERIAL_LIBRARY.keys())}"
        )
    return MATERIAL_LIBRARY[structure.material]


def _cell_range(center: float, half_extent: float, cell_size: float, n_cells: int):
    """Compute inclusive [i_min, i_max) cell index range for an axis."""
    lo = center - half_extent
    hi = center + half_extent
    i_min = max(0, int(math.floor(lo / cell_size)))
    i_max = min(n_cells, int(math.ceil(hi / cell_size)))
    return i_min, i_max


def _apply_box(grid: dict, structure: FdtdStructure, mat: FdtdMaterial) -> None:
    """Fill axis-aligned box cells."""
    dims = structure.dimensions
    lx = dims.get("lx", 0)
    ly = dims.get("ly", 0)
    lz = dims.get("lz", 0)

    xi, xf = _cell_range(structure.position[0], lx / 2, grid["dx"], grid["nx"])
    yi, yf = _cell_range(structure.position[1], ly / 2, grid["dy"], grid["ny"])
    zi, zf = _cell_range(structure.position[2], lz / 2, grid["dz"], grid["nz"])

    grid["epsilon_r"][xi:xf, yi:yf, zi:zf] = mat.epsilon_r
    grid["mu_r"][xi:xf, yi:yf, zi:zf] = mat.mu_r
    grid["sigma"][xi:xf, yi:yf, zi:zf] = mat.sigma


def _apply_sphere(grid: dict, structure: FdtdStructure, mat: FdtdMaterial) -> None:
    """Fill cells inside a sphere."""
    radius = structure.dimensions.get("radius", 0)
    cx, cy, cz = structure.position
    nx, ny, nz = grid["nx"], grid["ny"], grid["nz"]
    dx, dy, dz = grid["dx"], grid["dy"], grid["dz"]

    # Bounding box of the sphere for efficiency
    xi, xf = _cell_range(cx, radius, dx, nx)
    yi, yf = _cell_range(cy, radius, dy, ny)
    zi, zf = _cell_range(cz, radius, dz, nz)

    for i in range(xi, xf):
        for j in range(yi, yf):
            for k in range(zi, zf):
                px = (i + 0.5) * dx
                py = (j + 0.5) * dy
                pz = (k + 0.5) * dz
                dist2 = (px - cx) ** 2 + (py - cy) ** 2 + (pz - cz) ** 2
                if dist2 <= radius**2:
                    grid["epsilon_r"][i, j, k] = mat.epsilon_r
                    grid["mu_r"][i, j, k] = mat.mu_r
                    grid["sigma"][i, j, k] = mat.sigma


def _apply_cylinder(grid: dict, structure: FdtdStructure, mat: FdtdMaterial) -> None:
    """Fill cells inside a cylinder aligned to a principal axis."""
    dims = structure.dimensions
    radius = dims.get("radius", 0)
    height = dims.get("height", 0)
    axis = dims.get("axis", "z")
    cx, cy, cz = structure.position
    nx, ny, nz = grid["nx"], grid["ny"], grid["nz"]
    dx, dy, dz = grid["dx"], grid["dy"], grid["dz"]

    if axis == "z":
        xi, xf = _cell_range(cx, radius, dx, nx)
        yi, yf = _cell_range(cy, radius, dy, ny)
        zi, zf = _cell_range(cz, height / 2, dz, nz)
        for i in range(xi, xf):
            for j in range(yi, yf):
                px = (i + 0.5) * dx
                py = (j + 0.5) * dy
                if (px - cx) ** 2 + (py - cy) ** 2 <= radius**2:
                    grid["epsilon_r"][i, j, zi:zf] = mat.epsilon_r
                    grid["mu_r"][i, j, zi:zf] = mat.mu_r
                    grid["sigma"][i, j, zi:zf] = mat.sigma
    elif axis == "y":
        xi, xf = _cell_range(cx, radius, dx, nx)
        yi, yf = _cell_range(cy, height / 2, dy, ny)
        zi, zf = _cell_range(cz, radius, dz, nz)
        for i in range(xi, xf):
            for k in range(zi, zf):
                px = (i + 0.5) * dx
                pz = (k + 0.5) * dz
                if (px - cx) ** 2 + (pz - cz) ** 2 <= radius**2:
                    grid["epsilon_r"][i, yi:yf, k] = mat.epsilon_r
                    grid["mu_r"][i, yi:yf, k] = mat.mu_r
                    grid["sigma"][i, yi:yf, k] = mat.sigma
    elif axis == "x":
        xi, xf = _cell_range(cx, height / 2, dx, nx)
        yi, yf = _cell_range(cy, radius, dy, ny)
        zi, zf = _cell_range(cz, radius, dz, nz)
        for j in range(yi, yf):
            for k in range(zi, zf):
                py = (j + 0.5) * dy
                pz = (k + 0.5) * dz
                if (py - cy) ** 2 + (pz - cz) ** 2 <= radius**2:
                    grid["epsilon_r"][xi:xf, j, k] = mat.epsilon_r
                    grid["mu_r"][xi:xf, j, k] = mat.mu_r
                    grid["sigma"][xi:xf, j, k] = mat.sigma


_SHAPE_HANDLERS = {
    "box": _apply_box,
    "substrate": _apply_box,  # substrate is a box alias
    "trace": _apply_box,  # trace is a thin box
    "sphere": _apply_sphere,
    "cylinder": _apply_cylinder,
}


def apply_structure(grid: dict, structure: FdtdStructure) -> None:
    """Paint a structure's material into the grid cells.

    Supported types: box, substrate, trace, sphere, cylinder.
    Uses painter's algorithm — later calls overwrite earlier ones.
    """
    mat = _resolve_material(structure)
    handler = _SHAPE_HANDLERS.get(structure.type)
    if handler is None:
        raise ValueError(f"Unsupported structure type: {structure.type}")
    handler(grid, structure, mat)


# ---------------------------------------------------------------------------
# Source placement
# ---------------------------------------------------------------------------
def apply_source(grid: dict, source: FdtdSource) -> dict:
    """Map a source to the nearest grid cell and return placement info.

    Returns:
        dict with cell_indices, polarization, type, parameters.

    Raises:
        ValueError if the source position is outside the domain.
    """
    nx, ny, nz = grid["nx"], grid["ny"], grid["nz"]
    dx, dy, dz = grid["dx"], grid["dy"], grid["dz"]
    sx, sy, sz = source.position

    # Domain extents: [0, nx*dx] etc.
    domain_x = nx * dx
    domain_y = ny * dy
    domain_z = nz * dz

    if sx < 0 or sx > domain_x or sy < 0 or sy > domain_y or sz < 0 or sz > domain_z:
        raise ValueError(
            f"Source '{source.name}' at ({sx}, {sy}, {sz}) is outside "
            f"the domain (0..{domain_x}, 0..{domain_y}, 0..{domain_z})"
        )

    # Map to nearest cell (round, clamp to valid range)
    ix = min(max(round(sx / dx), 0), nx - 1)
    iy = min(max(round(sy / dy), 0), ny - 1)
    iz = min(max(round(sz / dz), 0), nz - 1)

    return {
        "cell_indices": (ix, iy, iz),
        "polarization": source.polarization,
        "type": source.type,
        "parameters": source.parameters,
    }


# ---------------------------------------------------------------------------
# Boundary application
# ---------------------------------------------------------------------------
def apply_boundary(grid: dict, boundaries: DomainBoundaries) -> dict:
    """Process boundary conditions and return per-face info.

    Returns a dict keyed by face name with boundary type and metadata.
    """
    info: dict = {}
    for face in ("x_min", "x_max", "y_min", "y_max", "z_min", "z_max"):
        bc = getattr(boundaries, face)
        info[face] = {"type": bc.type}
    return info


# ---------------------------------------------------------------------------
# Setup validation
# ---------------------------------------------------------------------------
_LARGE_GRID_THRESHOLD = 1_000_000


def validate_setup(geometry: FdtdGeometry, config: FdtdConfig) -> dict:
    """Validate an FDTD setup and return diagnostics.

    Returns dict with: warnings, errors, nx, ny, nz, dt, total_cells.
    """
    warnings: list[str] = []
    errors: list[str] = []

    nx, ny, nz = geometry.grid_dimensions
    dx, dy, dz = geometry.cell_size
    total_cells = nx * ny * nz

    # CFL time step
    dt_max = compute_courant_limit(dx, dy, dz)
    dt = config.courant_number * dt_max

    # --- Warnings ---
    if not geometry.sources:
        warnings.append("No sources defined — simulation will have no excitation.")

    if total_cells > _LARGE_GRID_THRESHOLD:
        warnings.append(
            f"Large grid: {total_cells:,} cells ({nx}x{ny}x{nz}). "
            "Consider coarser cell size for faster runs."
        )

    # Check structures extending outside domain
    for s in geometry.structures:
        _check_structure_bounds(s, geometry, warnings)

    return {
        "warnings": warnings,
        "errors": errors,
        "nx": nx,
        "ny": ny,
        "nz": nz,
        "dt": dt,
        "total_cells": total_cells,
    }


def _check_structure_bounds(
    structure: FdtdStructure,
    geometry: FdtdGeometry,
    warnings: list[str],
) -> None:
    """Append a warning if any part of a structure extends outside the domain."""
    lx = structure.dimensions.get("lx", 0)
    ly = structure.dimensions.get("ly", 0)
    lz = structure.dimensions.get("lz", 0)
    radius = structure.dimensions.get("radius", 0)

    cx, cy, cz = structure.position
    dx_dom, dy_dom, dz_dom = geometry.domain_size

    # Compute AABB per type
    if structure.type in ("box", "substrate", "trace"):
        half = (lx / 2, ly / 2, lz / 2)
    elif structure.type == "sphere":
        half = (radius, radius, radius)
    elif structure.type == "cylinder":
        height = structure.dimensions.get("height", 0)
        axis = structure.dimensions.get("axis", "z")
        if axis == "z":
            half = (radius, radius, height / 2)
        elif axis == "y":
            half = (radius, height / 2, radius)
        else:
            half = (height / 2, radius, radius)
    else:
        return

    if (
        cx - half[0] < 0
        or cx + half[0] > dx_dom
        or cy - half[1] < 0
        or cy + half[1] > dy_dom
        or cz - half[2] < 0
        or cz + half[2] > dz_dom
    ):
        warnings.append(
            f"Structure '{structure.name}' extends outside the computational domain."
        )
