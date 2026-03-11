"""Shared result models for all solver techniques.

Every solver microservice (PEEC, FEM, FDTD, MoM) returns results
conforming to these schemas so the postprocessor and frontend can
consume them uniformly.
"""

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class SolverType(str, Enum):
    """Supported solver techniques."""

    PEEC = "peec"
    FEM = "fem"
    FDTD = "fdtd"
    MOM = "mom"


class PortResult(BaseModel):
    """Result at a single port (feed point)."""

    port_id: str = Field(..., description="Port identifier")
    input_impedance: complex = Field(..., description="Input impedance Z [Ω]")
    input_current: complex = Field(..., description="Input current [A]")
    reflection_coefficient: complex = Field(..., description="Reflection coefficient Γ")
    return_loss: float = Field(..., description="Return loss |S11| [dB]")
    input_power: float = Field(..., description="Total input power [W]")
    reflected_power: float = Field(..., description="Reflected power [W]")
    accepted_power: float = Field(..., description="Accepted power [W]")


class FrequencyPointResult(BaseModel):
    """Unified result at a single frequency point.

    Solver-specific data (e.g. branch currents for PEEC, field
    coefficients for FEM) lives in `solver_data`.
    """

    frequency: float = Field(..., description="Frequency [Hz]")
    omega: float = Field(..., description="Angular frequency [rad/s]")
    ports: List[PortResult] = Field(default_factory=list, description="Per-port results")
    power_dissipated: float = Field(0.0, description="Ohmic loss [W]")
    solve_time: float = Field(0.0, description="Wall-clock time for this point [s]")

    # Solver-specific payload — opaque to postprocessor / frontend
    solver_data: Optional[dict] = Field(
        None,
        description="Solver-specific data (branch_currents for PEEC, field coeffs for FEM, ...)",
    )


class SweepResultEnvelope(BaseModel):
    """Shared envelope for frequency sweep results."""

    solver_type: SolverType = Field(..., description="Which solver produced these results")
    frequencies: List[float] = Field(..., description="Frequencies [Hz]")
    reference_impedance: float = Field(50.0, description="Reference Z₀ [Ω]")
    frequency_results: List[FrequencyPointResult] = Field(..., description="Per-frequency data")

    # Derived broadband metrics (computed from per-frequency port results)
    impedance_magnitude: List[float] = Field(default_factory=list)
    impedance_phase: List[float] = Field(default_factory=list)
    return_loss: List[float] = Field(default_factory=list)
    vswr: List[float] = Field(default_factory=list)

    # Metadata
    n_unknowns: int = Field(
        0, description="Size of the linear system (edges for PEEC, DOFs for FEM)"
    )
    total_solve_time: float = Field(0.0, description="Total computation time [s]")
