"""Pydantic models for Solver service API."""

import math
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


class SolverConfiguration(BaseModel):
    """Solver configuration parameters."""

    gauss_order: int = Field(6, description="Gauss quadrature order (2, 4, 6, 8, 10)")
    include_skin_effect: bool = Field(True, description="Include frequency-dependent skin effect")
    resistivity: float = Field(1.68e-8, description="Material resistivity [Ω·m] (copper default)")
    permeability: float = Field(1.0, description="Relative permeability μ_r")

    @field_validator("gauss_order")
    @classmethod
    def validate_gauss_order(cls, v):
        if v not in [2, 4, 6, 8, 10]:
            raise ValueError("gauss_order must be one of: 2, 4, 6, 8, 10")
        return v

    @field_validator("resistivity")
    @classmethod
    def validate_resistivity(cls, v):
        if v <= 0:
            raise ValueError("resistivity must be positive")
        return v


class VoltageSourceInput(BaseModel):
    """Voltage source specification."""

    node_start: int = Field(..., description="Starting node index (1-based)")
    node_end: int = Field(..., description="Ending node index (0=ground)")
    value: complex = Field(..., description="Voltage [V]")
    R: float = Field(0.0, description="Resistance [Ω]")
    L: float = Field(0.0, description="Inductance [H]")
    C_inv: float = Field(0.0, description="Inverse capacitance [1/F]")


class CurrentSourceInput(BaseModel):
    """Current source specification."""

    node: int = Field(..., description="Node index (1-based, negative for appended)")
    value: complex = Field(..., description="Current [A]")
    node_end: Optional[int] = Field(
        None, description="Return node for two-terminal current source (closed loop feed)"
    )


class LoadInput(BaseModel):
    """Load impedance specification."""

    node_start: int = Field(..., description="Starting node index (1-based)")
    node_end: int = Field(..., description="Ending node index")
    R: float = Field(0.0, description="Resistance [Ω]")
    L: float = Field(0.0, description="Inductance [H]")
    C_inv: float = Field(0.0, description="Inverse capacitance [1/F]")


class SingleFrequencyRequest(BaseModel):
    """Request for single frequency solution."""

    nodes: List[List[float]] = Field(
        ..., max_length=5000, description="Node coordinates [[x,y,z], ...] [m]"
    )
    edges: List[List[int]] = Field(
        ..., max_length=10000, description="Edge connectivity [[n1,n2], ...]"
    )
    radii: List[float] = Field(..., description="Wire radii [m]")
    frequency: float = Field(..., description="Frequency [Hz]", gt=0)
    voltage_sources: List[VoltageSourceInput] = Field(default_factory=list)
    current_sources: List[CurrentSourceInput] = Field(default_factory=list)
    loads: List[LoadInput] = Field(default_factory=list)
    config: Optional[SolverConfiguration] = None

    @field_validator("frequency")
    @classmethod
    def validate_frequency(cls, v):
        if not math.isfinite(v):
            raise ValueError("frequency must be finite (not NaN or Inf)")
        if v > 100e9:
            raise ValueError("frequency too high (max 100 GHz)")
        return v


class FrequencySweepRequest(BaseModel):
    """Request for frequency sweep solution."""

    nodes: List[List[float]] = Field(
        ..., max_length=5000, description="Node coordinates [[x,y,z], ...] [m]"
    )
    edges: List[List[int]] = Field(
        ..., max_length=10000, description="Edge connectivity [[n1,n2], ...]"
    )
    radii: List[float] = Field(..., description="Wire radii [m]")
    frequencies: List[float] = Field(..., description="Frequencies [Hz]")
    voltage_sources: List[VoltageSourceInput] = Field(default_factory=list)
    current_sources: List[CurrentSourceInput] = Field(default_factory=list)
    loads: List[LoadInput] = Field(default_factory=list)
    config: Optional[SolverConfiguration] = None
    reference_impedance: float = Field(50.0, description="Reference Z0 for VSWR [Ω]")

    @field_validator("frequencies")
    @classmethod
    def validate_frequencies(cls, v):
        if len(v) == 0:
            raise ValueError("frequencies list cannot be empty")
        if len(v) > 1000:
            raise ValueError("too many frequency points (max 1000)")
        if any(not math.isfinite(f) for f in v):
            raise ValueError("all frequencies must be finite (not NaN or Inf)")
        if any(f <= 0 for f in v):
            raise ValueError("all frequencies must be positive")
        return v


class FrequencyPointResponse(BaseModel):
    """Solution at a single frequency point."""

    frequency: float = Field(..., description="Frequency [Hz]")
    omega: float = Field(..., description="Angular frequency [rad/s]")

    # Currents and voltages
    branch_currents: List[complex] = Field(..., description="Branch currents [A]")
    node_voltages: List[complex] = Field(..., description="Node voltages [V]")
    appended_voltages: List[complex] = Field(..., description="Appended node voltages [V]")

    # Port characteristics
    input_impedance: complex = Field(..., description="Input impedance [Ω]")
    input_current: complex = Field(..., description="Input current [A]")
    reflection_coefficient: complex = Field(..., description="Reflection coefficient Γ")
    return_loss: float = Field(..., description="Return loss |S11| [dB]")

    # Power quantities
    input_power: float = Field(..., description="Total input power [W]")
    reflected_power: float = Field(..., description="Reflected power [W]")
    accepted_power: float = Field(..., description="Accepted power [W]")
    power_dissipated: float = Field(..., description="Dissipated power [W]")

    # Timing
    solve_time: float = Field(..., description="Solution time [s]")


class SweepResultResponse(BaseModel):
    """Response for frequency sweep."""

    frequencies: List[float] = Field(..., description="Frequencies [Hz]")
    reference_impedance: float = Field(..., description="Reference Z0 [Ω]")
    frequency_solutions: List[FrequencyPointResponse]

    # Derived parameters
    impedance_magnitude: List[float] = Field(..., description="|Z| [Ω]")
    impedance_phase: List[float] = Field(..., description="∠Z [deg]")
    return_loss: List[float] = Field(..., description="Return loss [dB]")
    vswr: List[float] = Field(..., description="Voltage Standing Wave Ratio")
    mismatch_loss: List[float] = Field(..., description="Mismatch loss [dB]")

    # Metadata
    n_nodes: int = Field(..., description="Number of nodes")
    n_edges: int = Field(..., description="Number of edges")
    n_branches: int = Field(..., description="Total branches")
    total_solve_time: float = Field(..., description="Total computation time [s]")


class ErrorResponse(BaseModel):
    """Error response."""

    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Error message")
    details: Optional[dict] = Field(None, description="Additional error details")


# ========== Multi-Antenna Solver Models ==========


class AntennaInput(BaseModel):
    """Single antenna input for multi-antenna solver.

    All indices are 1-based (PEEC convention).
    Node 0 = ground, negative indices = appended nodes.
    """

    antenna_id: str = Field(..., description="Unique identifier for this antenna")
    nodes: List[List[float]] = Field(
        ..., max_length=5000, description="Node coordinates [[x,y,z], ...]"
    )
    edges: List[List[int]] = Field(
        ..., max_length=10000, description="Edge connectivity [[start, end], ...], 1-based"
    )
    radii: List[float] = Field(..., description="Wire radius for each edge [m]")
    voltage_sources: List[VoltageSourceInput] = Field(default_factory=list)
    current_sources: List[CurrentSourceInput] = Field(default_factory=list)
    loads: List[LoadInput] = Field(default_factory=list)


class MultiAntennaRequest(BaseModel):
    """Request for solving multiple antennas at a single frequency."""

    frequency: float = Field(..., gt=0, description="Frequency [Hz]")
    antennas: List[AntennaInput] = Field(..., min_length=1, description="List of antennas to solve")
    config: SolverConfiguration = Field(default_factory=SolverConfiguration)


class AntennaSolution(BaseModel):
    """Solution for a single antenna from multi-antenna solve."""

    antenna_id: str = Field(..., description="Identifier matching the request")
    branch_currents: List[complex] = Field(..., description="Edge currents [A]")
    voltage_source_currents: List[complex] = Field(
        default_factory=list, description="Voltage source currents [A]"
    )
    load_currents: List[complex] = Field(default_factory=list, description="Load currents [A]")
    node_voltages: List[complex] = Field(..., description="Node potentials [V]")
    appended_voltages: List[complex] = Field(
        default_factory=list, description="Appended node potentials [V]"
    )
    input_impedance: Optional[complex] = Field(None, description="Input impedance Z = V/I [Ω]")


class MultiAntennaSolutionResponse(BaseModel):
    """Response from multi-antenna solver."""

    frequency: float = Field(..., description="Frequency [Hz]")
    converged: bool = Field(..., description="Whether solver converged")
    antenna_solutions: List[AntennaSolution] = Field(..., description="Solutions for each antenna")
    n_total_nodes: int = Field(..., description="Total nodes in combined system")
    n_total_edges: int = Field(..., description="Total edges in combined system")
    solve_time: float = Field(..., description="Computation time [s]")
