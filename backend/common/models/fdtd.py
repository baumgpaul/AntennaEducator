"""
FDTD domain models.

Pydantic v2 models for the FDTD electromagnetic solver: materials,
structures, sources, boundary conditions, probes, geometry, and
solver configuration.
"""

import math
from typing import Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend.common.constants import C_0


# ---------------------------------------------------------------------------
# Material
# ---------------------------------------------------------------------------
class FdtdMaterial(BaseModel):
    """Electromagnetic material properties for FDTD simulation."""

    model_config = ConfigDict(frozen=False)

    name: str = Field(description="Human-readable material name")
    epsilon_r: float = Field(
        default=1.0,
        ge=1.0,
        description="Relative permittivity (must be >= 1.0 for non-dispersive)",
    )
    mu_r: float = Field(
        default=1.0,
        ge=1.0,
        description="Relative permeability (must be >= 1.0 for non-dispersive)",
    )
    sigma: float = Field(
        default=0.0,
        ge=0.0,
        description="Electric conductivity [S/m]",
    )
    color: str = Field(
        default="#808080",
        description="Visualization color (hex)",
    )


# ---------------------------------------------------------------------------
# Material Library
# ---------------------------------------------------------------------------
MATERIAL_LIBRARY: dict[str, FdtdMaterial] = {
    # Free space
    "vacuum": FdtdMaterial(name="vacuum", epsilon_r=1.0, mu_r=1.0, sigma=0.0, color="#FFFFFF"),
    "air": FdtdMaterial(name="air", epsilon_r=1.0006, mu_r=1.0, sigma=0.0, color="#E8F4FD"),
    # Metals
    "copper": FdtdMaterial(name="copper", epsilon_r=1.0, sigma=5.96e7, color="#B87333"),
    "aluminum": FdtdMaterial(name="aluminum", epsilon_r=1.0, sigma=3.5e7, color="#A8A9AD"),
    "silver": FdtdMaterial(name="silver", epsilon_r=1.0, sigma=6.3e7, color="#C0C0C0"),
    "gold": FdtdMaterial(name="gold", epsilon_r=1.0, sigma=4.1e7, color="#FFD700"),
    "pec": FdtdMaterial(name="pec", epsilon_r=1.0, sigma=1e12, color="#333333"),
    # PCB substrates
    "fr4": FdtdMaterial(name="fr4", epsilon_r=4.4, sigma=0.02, color="#2E7D32"),
    "rogers_4003c": FdtdMaterial(
        name="rogers_4003c", epsilon_r=3.55, sigma=0.0027, color="#1B5E20",
    ),
    # Common dielectrics
    "glass": FdtdMaterial(name="glass", epsilon_r=4.0, sigma=1e-12, color="#ADD8E6"),
    "teflon": FdtdMaterial(name="teflon", epsilon_r=2.1, sigma=1e-16, color="#F5F5DC"),
    "water": FdtdMaterial(name="water", epsilon_r=80.0, sigma=0.01, color="#4169E1"),
    # Soil types (for GPR demos)
    "dry_soil": FdtdMaterial(name="dry_soil", epsilon_r=4.0, sigma=0.001, color="#8B7355"),
    "wet_soil": FdtdMaterial(name="wet_soil", epsilon_r=25.0, sigma=0.05, color="#5C4033"),
    # Biological tissues (for SAR demos, approximate values at ~900 MHz)
    "skin": FdtdMaterial(name="skin", epsilon_r=41.0, sigma=0.87, color="#FFDAB9"),
    "bone": FdtdMaterial(name="bone", epsilon_r=12.5, sigma=0.14, color="#FFFDD0"),
    "brain": FdtdMaterial(name="brain", epsilon_r=43.5, sigma=0.77, color="#FFB6C1"),
    "muscle": FdtdMaterial(name="muscle", epsilon_r=55.0, sigma=0.94, color="#CD5C5C"),
    "fat": FdtdMaterial(name="fat", epsilon_r=5.5, sigma=0.05, color="#FFF8DC"),
}


# ---------------------------------------------------------------------------
# Structure
# ---------------------------------------------------------------------------
class FdtdStructure(BaseModel):
    """Geometric structure placed in the FDTD computational domain."""

    id: str = Field(default_factory=lambda: str(uuid4()), description="Unique identifier")
    name: str = Field(description="Human-readable name")
    type: Literal["box", "cylinder", "sphere", "substrate", "trace"] = Field(
        description="Geometry primitive type",
    )
    position: tuple[float, float, float] = Field(description="Center position [m]")
    dimensions: dict = Field(description="Type-specific dimension parameters")
    material: str = Field(description="Material name (from library or 'custom')")
    custom_material: Optional[FdtdMaterial] = Field(
        default=None,
        description="Custom material definition (used when material='custom')",
    )


# ---------------------------------------------------------------------------
# Source
# ---------------------------------------------------------------------------
class FdtdSource(BaseModel):
    """Excitation source for FDTD simulation."""

    id: str = Field(default_factory=lambda: str(uuid4()), description="Unique identifier")
    name: str = Field(description="Human-readable name")
    type: Literal[
        "gaussian_pulse", "sinusoidal", "modulated_gaussian", "plane_wave", "waveguide_port"
    ] = Field(description="Source type")
    position: tuple[float, float, float] = Field(description="Source position [m]")
    parameters: dict = Field(description="Type-specific parameters (frequency, bandwidth, etc.)")
    polarization: Literal["x", "y", "z"] = Field(
        default="z",
        description="Field polarization axis",
    )


# ---------------------------------------------------------------------------
# Boundary Conditions
# ---------------------------------------------------------------------------
class BoundaryCondition(BaseModel):
    """Boundary condition for one face of the computational domain."""

    type: Literal["mur_abc", "pec", "pmc", "periodic"] = Field(
        default="mur_abc",
        description="Boundary condition type",
    )


class DomainBoundaries(BaseModel):
    """Boundary conditions for all 6 faces of the domain."""

    x_min: BoundaryCondition = Field(default_factory=BoundaryCondition)
    x_max: BoundaryCondition = Field(default_factory=BoundaryCondition)
    y_min: BoundaryCondition = Field(default_factory=BoundaryCondition)
    y_max: BoundaryCondition = Field(default_factory=BoundaryCondition)
    z_min: BoundaryCondition = Field(default_factory=BoundaryCondition)
    z_max: BoundaryCondition = Field(default_factory=BoundaryCondition)


# ---------------------------------------------------------------------------
# Probe
# ---------------------------------------------------------------------------
class FdtdProbe(BaseModel):
    """Field observation point, line, or plane."""

    id: str = Field(default_factory=lambda: str(uuid4()), description="Unique identifier")
    name: str = Field(description="Human-readable name")
    type: Literal["point", "line", "plane"] = Field(description="Probe geometry type")
    position: tuple[float, float, float] = Field(description="Probe position [m]")
    direction: Optional[tuple[float, float, float]] = Field(
        default=None, description="Direction vector (for line probes)",
    )
    extent: Optional[tuple[float, float]] = Field(
        default=None, description="Spatial extent (for plane probes)",
    )
    fields: list[Literal["Ex", "Ey", "Ez", "Hx", "Hy", "Hz"]] = Field(
        default=["Ez"],
        description="Field components to record",
    )


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------
class FdtdGeometry(BaseModel):
    """Complete FDTD simulation domain definition."""

    domain_size: tuple[float, float, float] = Field(
        description="Physical domain size (Lx, Ly, Lz) [m]",
    )
    cell_size: tuple[float, float, float] = Field(
        description="Yee cell size (dx, dy, dz) [m]",
    )
    structures: list[FdtdStructure] = Field(default_factory=list)
    sources: list[FdtdSource] = Field(default_factory=list)
    boundaries: DomainBoundaries = Field(default_factory=DomainBoundaries)
    probes: list[FdtdProbe] = Field(default_factory=list)

    @field_validator("domain_size")
    @classmethod
    def domain_size_positive(cls, v: tuple[float, float, float]) -> tuple[float, float, float]:
        if any(d <= 0 for d in v):
            raise ValueError("All domain_size dimensions must be positive")
        return v

    @field_validator("cell_size")
    @classmethod
    def cell_size_positive(cls, v: tuple[float, float, float]) -> tuple[float, float, float]:
        if any(d <= 0 for d in v):
            raise ValueError("All cell_size dimensions must be positive")
        return v

    @property
    def grid_dimensions(self) -> tuple[int, int, int]:
        """Compute grid cell counts (nx, ny, nz) from domain and cell size."""
        nx = round(self.domain_size[0] / self.cell_size[0])
        ny = round(self.domain_size[1] / self.cell_size[1])
        nz = round(self.domain_size[2] / self.cell_size[2])
        return (nx, ny, nz)


# ---------------------------------------------------------------------------
# Solver Config
# ---------------------------------------------------------------------------
class FdtdConfig(BaseModel):
    """FDTD solver configuration."""

    num_time_steps: int = Field(default=1000, gt=0, description="Total number of time steps")
    courant_number: float = Field(
        default=0.99,
        gt=0.0,
        le=1.0,
        description="Fraction of CFL stability limit (0 < cn <= 1)",
    )
    output_every_n_steps: int = Field(
        default=10, gt=0, description="Field snapshot output interval",
    )
    dft_frequencies: list[float] = Field(
        default_factory=list,
        description="Frequencies for on-the-fly DFT [Hz]",
    )
    auto_shutoff_threshold: float = Field(
        default=1e-6,
        gt=0,
        description="Stop simulation when field energy drops below this fraction",
    )


# ---------------------------------------------------------------------------
# CFL Stability Computation
# ---------------------------------------------------------------------------
def compute_courant_limit(
    dx: float,
    dy: float | None = None,
    dz: float | None = None,
    c: float = C_0,
) -> float:
    """Compute the maximum stable time step (CFL condition).

    1D: dt_max = dx / c
    2D: dt_max = 1 / (c * sqrt(1/dx² + 1/dy²))
    3D: dt_max = 1 / (c * sqrt(1/dx² + 1/dy² + 1/dz²))

    Args:
        dx: Cell size in x [m].
        dy: Cell size in y [m] (omit for 1D).
        dz: Cell size in z [m] (omit for 1D/2D).
        c: Wave speed [m/s]. Defaults to speed of light in vacuum.

    Returns:
        Maximum stable time step [s].
    """
    inv_sq_sum = 1.0 / dx**2
    if dy is not None:
        inv_sq_sum += 1.0 / dy**2
    if dz is not None:
        inv_sq_sum += 1.0 / dz**2
    return 1.0 / (c * math.sqrt(inv_sq_sum))
