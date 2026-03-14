"""
Request / response schemas for the FDTD Solver service.
"""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from backend.common.models.fdtd import (
    DomainBoundaries,
    FdtdConfig,
    FdtdProbe,
    FdtdSource,
    FdtdStructure,
)


# ---------------------------------------------------------------------------
# Solve request
# ---------------------------------------------------------------------------
class FdtdSolveRequest(BaseModel):
    """Full FDTD solve request.

    The caller supplies domain geometry + materials + sources + config.
    The solver builds the grid, runs the simulation, and returns results.
    """

    model_config = ConfigDict(json_schema_extra={
        "example": {
            "dimensionality": "1d",
            "domain_size": [1.0, 0.0, 0.0],
            "cell_size": [0.001, 0.001, 0.001],
            "structures": [],
            "sources": [],
            "boundaries": {},
            "probes": [],
            "config": {"num_time_steps": 500, "courant_number": 0.99},
        }
    })

    dimensionality: Literal["1d", "2d", "3d"] = Field(
        description="Simulation dimensionality",
    )
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
    config: FdtdConfig = Field(default_factory=FdtdConfig)
    mode: Literal["tm", "te"] = Field(
        default="tm",
        description="2-D polarisation mode (ignored for 1-D)",
    )


# ---------------------------------------------------------------------------
# Solve response
# ---------------------------------------------------------------------------
class ProbeResult(BaseModel):
    """Time-domain probe data."""

    name: str
    field_component: str
    position: dict = Field(default_factory=dict)
    times: list[float] = Field(default_factory=list)
    values: list[float] = Field(
        default_factory=list,
        description="For point probes — scalar values over time",
    )
    snapshots: Optional[list] = Field(
        default=None,
        description="For line/plane probes — spatial data over time",
    )


class ComplexValue(BaseModel):
    real: float
    imag: float


class DftFieldResult(BaseModel):
    """Frequency-domain field at a single DFT frequency."""

    frequency_hz: float
    real: list = Field(description="Real part of field (1-D or 2-D list)")
    imag: list = Field(description="Imaginary part of field")


class FdtdSolveResponse(BaseModel):
    """Response from the FDTD solver."""

    dimensionality: str
    mode: str = "tm"
    total_time_steps: int
    dt: float = Field(description="Time step used [s]")
    solve_time_s: float = Field(description="Wall-clock solve time [s]")

    fields_final: dict = Field(
        default_factory=dict,
        description="Final field arrays, keyed by component name",
    )
    probe_data: list[ProbeResult] = Field(default_factory=list)
    dft_results: dict = Field(
        default_factory=dict,
        description="DFT results keyed by frequency",
    )


# ---------------------------------------------------------------------------
# Config endpoint response
# ---------------------------------------------------------------------------
class FdtdSolverConfigResponse(BaseModel):
    """Solver capabilities and limits."""

    max_time_steps: int
    timeout_seconds: int
    supported_dimensions: list[str] = ["1d", "2d", "3d"]
    supported_modes: list[str] = ["tm", "te"]
    supported_boundary_types: list[str] = ["mur_abc", "pec", "pmc"]
    supported_source_types: list[str] = [
        "gaussian_pulse",
        "sinusoidal",
        "modulated_gaussian",
    ]
    gpu_available: bool = False
