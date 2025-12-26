"""Pydantic models for Solver service API."""

from pydantic import BaseModel, Field, field_validator
from typing import List, Optional
import numpy as np


class SolverConfiguration(BaseModel):
    """Solver configuration parameters."""
    
    gauss_order: int = Field(6, description="Gauss quadrature order (2, 4, 6, 8, 10)")
    include_skin_effect: bool = Field(True, description="Include frequency-dependent skin effect")
    resistivity: float = Field(1.68e-8, description="Material resistivity [Ω·m] (copper default)")
    permeability: float = Field(1.0, description="Relative permeability μ_r")
    
    @field_validator('gauss_order')
    @classmethod
    def validate_gauss_order(cls, v):
        if v not in [2, 4, 6, 8, 10]:
            raise ValueError("gauss_order must be one of: 2, 4, 6, 8, 10")
        return v
    
    @field_validator('resistivity')
    @classmethod
    def validate_resistivity(cls, v):
        if v <= 0:
            raise ValueError("resistivity must be positive")
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "gauss_order": 6,
                "include_skin_effect": True,
                "resistivity": 1.68e-8,
                "permeability": 1.0
            }
        }


class VoltageSourceInput(BaseModel):
    """Voltage source specification."""
    
    node_start: int = Field(..., description="Starting node index (1-based)")
    node_end: int = Field(..., description="Ending node index (0=ground)")
    value: complex = Field(..., description="Voltage [V]")
    # Support both old impedance field and new R/L/C_inv fields for backward compatibility
    impedance: Optional[float] = Field(None, description="Source impedance [Ω] (deprecated, use R/L/C_inv)")
    R: float = Field(0.0, description="Resistance [Ω]")
    L: float = Field(0.0, description="Inductance [H]")
    C_inv: float = Field(0.0, description="Inverse capacitance [1/F]")
    
    class Config:
        json_schema_extra = {
            "example": {
                "node_start": 1,
                "node_end": 0,
                "value": 1.0,
                "R": 50.0,
                "L": 0.0,
                "C_inv": 0.0
            }
        }


class CurrentSourceInput(BaseModel):
    """Current source specification."""
    
    node: int = Field(..., description="Node index (1-based, negative for appended)")
    value: complex = Field(..., description="Current [A]")
    
    class Config:
        json_schema_extra = {
            "example": {
                "node": 1,
                "value": 0.001
            }
        }


class LoadInput(BaseModel):
    """Load impedance specification."""
    
    node_start: int = Field(..., description="Starting node index (1-based)")
    node_end: int = Field(..., description="Ending node index")
    # Support both old impedance field and new R/L/C_inv fields for backward compatibility
    impedance: Optional[complex] = Field(None, description="Load impedance [Ω] (deprecated, use R/L/C_inv)")
    R: float = Field(0.0, description="Resistance [Ω]")
    L: float = Field(0.0, description="Inductance [H]")
    C_inv: float = Field(0.0, description="Inverse capacitance [1/F]")
    
    class Config:
        json_schema_extra = {
            "example": {
                "node_start": 5,
                "node_end": 0,
                "R": 50.0,
                "L": 0.0,
                "C_inv": 0.0
            }
        }


class SingleFrequencyRequest(BaseModel):
    """Request for single frequency solution."""
    
    # Geometry
    nodes: List[List[float]] = Field(..., description="Node coordinates [[x,y,z], ...] [m]")
    edges: List[List[int]] = Field(..., description="Edge connectivity [[n1,n2], ...]")
    radii: List[float] = Field(..., description="Wire radii [m]")
    
    # Excitation
    frequency: float = Field(..., description="Frequency [Hz]", gt=0)
    voltage_sources: List[VoltageSourceInput] = Field(default_factory=list)
    current_sources: List[CurrentSourceInput] = Field(default_factory=list)
    loads: List[LoadInput] = Field(default_factory=list)
    
    # Configuration
    config: Optional[SolverConfiguration] = None
    
    @field_validator('frequency')
    @classmethod
    def validate_frequency(cls, v):
        if v <= 0:
            raise ValueError("frequency must be positive")
        if v > 100e9:
            raise ValueError("frequency too high (max 100 GHz)")
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "nodes": [[0, 0, 0], [0, 0, 0.5]],
                "edges": [[0, 1]],
                "radii": [0.001],
                "frequency": 100e6,
                "voltage_sources": [{
                    "node_start": 1,
                    "node_end": 0,
                    "value": 1.0,
                    "impedance": 50.0
                }]
            }
        }


class FrequencySweepRequest(BaseModel):
    """Request for frequency sweep solution."""
    
    # Geometry
    nodes: List[List[float]] = Field(..., description="Node coordinates [[x,y,z], ...] [m]")
    edges: List[List[int]] = Field(..., description="Edge connectivity [[n1,n2], ...]")
    radii: List[float] = Field(..., description="Wire radii [m]")
    
    # Excitation
    frequencies: List[float] = Field(..., description="Frequencies [Hz]")
    voltage_sources: List[VoltageSourceInput] = Field(default_factory=list)
    current_sources: List[CurrentSourceInput] = Field(default_factory=list)
    loads: List[LoadInput] = Field(default_factory=list)
    
    # Configuration
    config: Optional[SolverConfiguration] = None
    reference_impedance: float = Field(50.0, description="Reference Z0 for VSWR [Ω]")
    
    @field_validator('frequencies')
    @classmethod
    def validate_frequencies(cls, v):
        if len(v) == 0:
            raise ValueError("frequencies list cannot be empty")
        if len(v) > 1000:
            raise ValueError("too many frequency points (max 1000)")
        if any(f <= 0 for f in v):
            raise ValueError("all frequencies must be positive")
        return v
    
    class Config:
        json_schema_extra = {
            "example": {
                "nodes": [[0, 0, 0], [0, 0, 0.5]],
                "edges": [[0, 1]],
                "radii": [0.001],
                "frequencies": [90e6, 100e6, 110e6],
                "voltage_sources": [{
                    "node_start": 1,
                    "node_end": 0,
                    "value": 1.0,
                    "impedance": 50.0
                }],
                "reference_impedance": 50.0
            }
        }


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
    
    class Config:
        json_schema_extra = {
            "example": {
                "frequency": 100e6,
                "omega": 6.283e8,
                "branch_currents": [0.001+0j, 0.002+0j],
                "node_voltages": [0j, 0.05+0j],
                "appended_voltages": [],
                "input_impedance": 75-10j,
                "input_current": 0.013+0j,
                "reflection_coefficient": 0.2-0.05j,
                "return_loss": 13.5,
                "input_power": 0.010,
                "reflected_power": 0.0004,
                "accepted_power": 0.0096,
                "power_dissipated": 0.007,
                "solve_time": 0.015
            }
        }


class SweepResultResponse(BaseModel):
    """Response for frequency sweep."""
    
    # Input parameters
    frequencies: List[float] = Field(..., description="Frequencies [Hz]")
    reference_impedance: float = Field(..., description="Reference Z0 [Ω]")
    
    # Per-frequency solutions
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
    
    class Config:
        json_schema_extra = {
            "example": {
                "frequencies": [90e6, 100e6, 110e6],
                "reference_impedance": 50.0,
                "frequency_solutions": [],
                "impedance_magnitude": [75.0, 76.0, 77.0],
                "impedance_phase": [-30, -5, 20],
                "return_loss": [10.5, 15.2, 12.8],
                "vswr": [2.5, 1.5, 2.0],
                "mismatch_loss": [1.2, 0.4, 0.8],
                "n_nodes": 2,
                "n_edges": 1,
                "n_branches": 2,
                "total_solve_time": 0.045
            }
        }


class ErrorResponse(BaseModel):
    """Error response."""
    
    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Error message")
    details: Optional[dict] = Field(None, description="Additional error details")
    
    class Config:
        json_schema_extra = {
            "example": {
                "error": "ValidationError",
                "message": "Invalid frequency range",
                "details": {"frequency": -100}
            }
        }


# ========== Multi-Antenna Solver Models ==========

class AntennaInput(BaseModel):
    """
    Single antenna input for multi-antenna solver.
    All indices are 1-based (FORTRAN/MATLAB convention).
    Nodes use positive indices for physical nodes, negative for appended (ground/reference).
    """
    
    antenna_id: str = Field(..., description="Unique identifier for this antenna")
    
    # Geometry - 1-based indexing
    nodes: List[List[float]] = Field(..., description="Node coordinates [[x,y,z], ...], 1-based")
    edges: List[List[int]] = Field(..., description="Edge connectivity [[start, end], ...], 1-based node indices")
    radii: List[float] = Field(..., description="Wire radius for each edge [m]")
    
    # Sources and loads - 1-based indexing
    voltage_sources: List[VoltageSourceInput] = Field(default_factory=list, description="Voltage sources")
    current_sources: List[CurrentSourceInput] = Field(default_factory=list, description="Current sources")
    loads: List[LoadInput] = Field(default_factory=list, description="Lumped loads")
    
    class Config:
        json_schema_extra = {
            "example": {
                "antenna_id": "dipole_1",
                "nodes": [[0, 0, 0], [0, 0, 0.25], [0, 0, 0.26], [0, 0, 0.5]],
                "edges": [[1, 2], [3, 4]],
                "radii": [0.001, 0.001],
                "voltage_sources": [{"node_start": 2, "node_end": 3, "value": 1.0}],
                "current_sources": [],
                "loads": []
            }
        }


class MultiAntennaRequest(BaseModel):
    """
    Request for solving multiple antennas at a single frequency.
    Antennas are combined into a unified system, solved together,
    then solution is distributed back to individual antennas.
    """
    
    frequency: float = Field(..., gt=0, description="Frequency [Hz]")
    antennas: List[AntennaInput] = Field(..., min_length=1, description="List of antennas to solve")
    config: SolverConfiguration = Field(default_factory=SolverConfiguration, description="Solver configuration")
    
    class Config:
        json_schema_extra = {
            "example": {
                "frequency": 100e6,
                "antennas": [
                    {
                        "antenna_id": "dipole_1",
                        "nodes": [[0, 0, 0], [0, 0, 0.5]],
                        "edges": [[1, 2]],
                        "radii": [0.001],
                        "voltage_sources": [{"node_start": 1, "node_end": 2, "value": 1.0}],
                        "current_sources": [],
                        "loads": []
                    }
                ],
                "config": {
                    "gauss_order": 2,
                    "skin_effect": True,
                    "resistivity": 1.68e-8
                }
            }
        }


class AntennaSolution(BaseModel):
    """
    Solution for a single antenna from multi-antenna solve.
    Contains current and voltage data specific to this antenna.
    """
    
    antenna_id: str = Field(..., description="Identifier matching the request")
    
    # Branch currents
    branch_currents: List[complex] = Field(..., description="Edge currents [A]")
    voltage_source_currents: List[complex] = Field(default_factory=list, description="Voltage source currents [A]")
    load_currents: List[complex] = Field(default_factory=list, description="Load currents [A]")
    
    # Node voltages
    node_voltages: List[complex] = Field(..., description="Node potentials [V]")
    appended_voltages: List[complex] = Field(default_factory=list, description="Appended node potentials [V]")
    
    # Input impedance (computed from first voltage source)
    input_impedance: Optional[complex] = Field(None, description="Input impedance Z = V/I [Ω]")
    
    class Config:
        json_schema_extra = {
            "example": {
                "antenna_id": "dipole_1",
                "branch_currents": [0.012 + 0.003j, 0.011 + 0.002j],
                "voltage_source_currents": [0.012 + 0.003j],
                "load_currents": [],
                "node_voltages": [0.5 + 0.1j, 0.0 + 0.0j, 0.5 - 0.1j],
                "appended_voltages": [0.0 + 0.0j],
                "input_impedance": 75.0 - 30.0j
            }
        }


class MultiAntennaSolutionResponse(BaseModel):
    """
    Response from multi-antenna solver containing individual antenna solutions.
    """
    
    frequency: float = Field(..., description="Frequency [Hz]")
    converged: bool = Field(..., description="Whether solver converged")
    
    antenna_solutions: List[AntennaSolution] = Field(..., description="Solutions for each antenna")
    
    # Metadata
    n_total_nodes: int = Field(..., description="Total nodes in combined system")
    n_total_edges: int = Field(..., description="Total edges in combined system")
    solve_time: float = Field(..., description="Computation time [s]")
    
    class Config:
        json_schema_extra = {
            "example": {
                "frequency": 100e6,
                "converged": True,
                "antenna_solutions": [
                    {
                        "antenna_id": "dipole_1",
                        "branch_currents": [0.012 + 0.003j],
                        "voltage_source_currents": [0.012 + 0.003j],
                        "load_currents": [],
                        "node_voltages": [0.5 + 0.1j, 0.0 + 0.0j],
                        "appended_voltages": [],
                        "input_impedance": 75.0 - 30.0j
                    }
                ],
                "n_total_nodes": 2,
                "n_total_edges": 1,
                "solve_time": 0.012
            }
        }
