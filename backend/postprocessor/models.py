"""Pydantic models for Postprocessor service."""

from typing import Dict, List, Optional, Union

from pydantic import BaseModel, Field, field_serializer


class FieldRequest(BaseModel):
    """Request for field computation."""

    frequencies: List[float] = Field(..., max_length=1000, description="Frequencies [Hz]")
    branch_currents: List[List[Union[complex, str, Dict[str, float]]]] = Field(
        ..., description="Branch currents [A] per frequency"
    )
    nodes: List[List[float]] = Field(
        ..., max_length=5000, description="Node coordinates [[x,y,z], ...]"
    )
    edges: List[List[int]] = Field(
        ..., max_length=10000, description="Edge connectivity [[n1,n2], ...]"
    )
    radii: List[float] = Field(..., description="Wire radii [m]")
    observation_points: List[List[float]] = Field(
        ..., max_length=40000, description="Points to evaluate field [[x,y,z], ...]"
    )


class FarFieldRequest(BaseModel):
    """Request for far-field radiation pattern."""

    frequencies: List[float] = Field(..., max_length=1000, description="Frequencies [Hz]")
    branch_currents: List[List[Union[complex, str, Dict[str, float]]]] = Field(
        ..., description="Branch currents [A] per frequency"
    )
    nodes: List[List[float]] = Field(..., max_length=5000, description="Node coordinates")
    edges: List[List[int]] = Field(..., max_length=10000, description="Edge connectivity")
    radii: List[float] = Field(..., description="Wire radii [m]")
    theta_points: int = Field(
        181, ge=2, le=721, description="Number of theta samples (0 to 180 deg)"
    )
    phi_points: int = Field(360, ge=2, le=721, description="Number of phi samples (0 to 360 deg)")


class RadiationPatternResponse(BaseModel):
    """Response with radiation pattern data."""

    frequency: float = Field(..., description="Frequency [Hz]")
    theta_angles: List[float] = Field(..., description="Theta angles [rad]")
    phi_angles: List[float] = Field(..., description="Phi angles [rad]")
    E_theta_mag: List[float] = Field(..., description="|E_theta| [V/m]")
    E_phi_mag: List[float] = Field(..., description="|E_phi| [V/m]")
    E_total_mag: List[float] = Field(..., description="|E_total| [V/m]")
    pattern_db: List[float] = Field(..., description="Normalized pattern [dB]")
    directivity: float = Field(..., description="Directivity [dBi]")
    gain: float = Field(..., description="Gain [dBi]")
    efficiency: float = Field(..., description="Radiation efficiency")
    beamwidth_theta: Optional[float] = Field(None, description="3dB beamwidth in theta [deg]")
    beamwidth_phi: Optional[float] = Field(None, description="3dB beamwidth in phi [deg]")
    max_direction: List[float] = Field(..., description="[theta, phi] of maximum [deg]")


# ============================================================================
# Port Quantities Models
# ============================================================================


class PortDefinition(BaseModel):
    """Definition of a measurement port between two nodes."""

    port_id: str = Field(..., description="Unique port identifier")
    node_start: int = Field(..., description="Starting node index (1-based)")
    node_end: int = Field(0, description="Ending node index (0 = ground)")
    z0: float = Field(50.0, description="Reference impedance [Ω]", gt=0)


class PortQuantitiesRequest(BaseModel):
    """Request for port quantity computation."""

    frequency: float = Field(..., description="Frequency [Hz]", gt=0)
    antenna_id: str = Field(..., description="Antenna identifier")
    node_voltages: List[Union[complex, str, Dict[str, float]]] = Field(
        ..., description="Node voltages [V] from solver"
    )
    branch_currents: List[Union[complex, str, Dict[str, float]]] = Field(
        ..., description="Branch currents [A] from solver"
    )
    appended_voltages: List[Union[complex, str, Dict[str, float]]] = Field(
        default_factory=list, description="Appended node voltages [V]"
    )
    voltage_source_currents: List[Union[complex, str, Dict[str, float]]] = Field(
        default_factory=list, description="Voltage source currents [A]"
    )
    edges: List[List[int]] = Field(..., description="Mesh edges [[start, end], ...] (1-based)")
    ports: List[PortDefinition] = Field(..., min_length=1, description="Port definitions")


class PortResult(BaseModel):
    """Computed quantities for a single port."""

    port_id: str = Field(..., description="Port identifier")
    z_in: complex = Field(..., description="Input impedance [Ω]")
    gamma: complex = Field(..., description="Reflection coefficient Γ")
    s11_db: float = Field(..., description="Return loss |S11| [dB]")
    vswr: float = Field(..., description="VSWR")
    voltage: complex = Field(..., description="Port voltage [V]")
    current: complex = Field(..., description="Port current [A]")
    power_in: float = Field(..., description="Input power [W]")

    @field_serializer("z_in", "gamma", "voltage", "current")
    @classmethod
    def serialize_complex(cls, v: complex) -> dict:
        return {"real": float(v.real), "imag": float(v.imag)}


class PortQuantitiesResponse(BaseModel):
    """Response with computed port quantities."""

    antenna_id: str = Field(..., description="Antenna identifier")
    frequency: float = Field(..., description="Frequency [Hz]")
    port_results: List[PortResult] = Field(..., description="Results per port")
