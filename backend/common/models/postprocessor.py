"""
Postprocessor-related data models.
"""

from typing import Optional, Literal, List
from pydantic import BaseModel, Field
from uuid import UUID, uuid4
from datetime import datetime
from enum import Enum


class PostprocessorResultType(str, Enum):
    """Postprocessor result type enumeration."""
    IMPEDANCE = "impedance"
    FIELD = "field"
    DIRECTIVITY = "directivity"
    POWER = "power"


class PostprocessorResult(BaseModel):
    """
    Base postprocessor result metadata.
    """
    id: UUID = Field(default_factory=uuid4)
    job_id: UUID = Field(description="Parent solver job ID")
    type: PostprocessorResultType = Field(
        description="Type of postprocessor result"
    )
    parameters: dict = Field(
        description="Request parameters used to generate this result"
    )
    storage_location: Optional[str] = Field(
        default=None,
        description="Storage location for large result data"
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {
            UUID: str,
            datetime: lambda v: v.isoformat()
        }


class ImpedanceResult(BaseModel):
    """
    Input impedance calculation result.
    """
    frequencies: List[float] = Field(
        description="Frequency points [Hz]"
    )
    impedance_real: List[float] = Field(
        description="Real part of impedance (resistance) [Ohm]"
    )
    impedance_imag: List[float] = Field(
        description="Imaginary part of impedance (reactance) [Ohm]"
    )
    vswr: List[float] = Field(
        description="Voltage Standing Wave Ratio"
    )
    return_loss_db: List[float] = Field(
        description="Return loss in dB"
    )
    reference_impedance: float = Field(
        default=50.0,
        description="Reference impedance for VSWR/return loss [Ohm]"
    )


class FieldRequest(BaseModel):
    """
    Request for field calculation.
    """
    observation_points: List[List[float]] = Field(
        description="List of 3D observation points [P x 3]"
    )
    field_type: Literal["electric", "magnetic", "both"] = Field(
        default="both",
        description="Type of field to calculate"
    )
    frequency_index: Optional[int] = Field(
        default=None,
        description="Frequency index for multi-frequency results (None = all)"
    )


class FieldResult(BaseModel):
    """
    Electric and magnetic field calculation result.
    """
    observation_points: List[List[float]] = Field(
        description="3D observation points [P x 3]"
    )
    frequency: float = Field(
        description="Frequency at which fields were computed [Hz]"
    )
    # Fields stored as separate real/imaginary components
    E_real: Optional[List[List[float]]] = Field(
        default=None,
        description="Electric field real part [P x 3] [V/m]"
    )
    E_imag: Optional[List[List[float]]] = Field(
        default=None,
        description="Electric field imaginary part [P x 3] [V/m]"
    )
    H_real: Optional[List[List[float]]] = Field(
        default=None,
        description="Magnetic field real part [P x 3] [A/m]"
    )
    H_imag: Optional[List[List[float]]] = Field(
        default=None,
        description="Magnetic field imaginary part [P x 3] [A/m]"
    )
    E_magnitude: Optional[List[float]] = Field(
        default=None,
        description="Electric field magnitude [P] [V/m]"
    )
    H_magnitude: Optional[List[float]] = Field(
        default=None,
        description="Magnetic field magnitude [P] [A/m]"
    )


class DirectivityRequest(BaseModel):
    """
    Request for directivity calculation.
    """
    frequency_index: int = Field(
        default=0,
        description="Frequency index for multi-frequency results",
        ge=0
    )
    theta_points: int = Field(
        default=37,
        description="Number of theta points (elevation)",
        ge=2,
        le=181
    )
    phi_points: int = Field(
        default=73,
        description="Number of phi points (azimuth)",
        ge=2,
        le=361
    )


class DirectivityResult(BaseModel):
    """
    Directivity and radiation pattern result.
    """
    frequency: float = Field(
        description="Frequency at which directivity was computed [Hz]"
    )
    theta: List[float] = Field(
        description="Theta angles in radians [0, π]"
    )
    phi: List[float] = Field(
        description="Phi angles in radians [0, 2π]"
    )
    directivity_linear: List[List[float]] = Field(
        description="Directivity in linear scale [theta x phi]"
    )
    directivity_dbi: List[List[float]] = Field(
        description="Directivity in dBi [theta x phi]"
    )
    max_directivity_dbi: float = Field(
        description="Maximum directivity [dBi]"
    )
    max_direction_theta: float = Field(
        description="Theta angle of maximum directivity [radians]"
    )
    max_direction_phi: float = Field(
        description="Phi angle of maximum directivity [radians]"
    )
    total_radiated_power: float = Field(
        description="Total radiated power [W]"
    )


class PowerRequest(BaseModel):
    """
    Request for power density calculation.
    """
    observation_points: List[List[float]] = Field(
        description="List of 3D observation points [P x 3]"
    )
    frequency_index: int = Field(
        default=0,
        description="Frequency index for multi-frequency results",
        ge=0
    )


class PowerResult(BaseModel):
    """
    Power density calculation result.
    """
    observation_points: List[List[float]] = Field(
        description="3D observation points [P x 3]"
    )
    frequency: float = Field(
        description="Frequency at which power was computed [Hz]"
    )
    power_density: List[float] = Field(
        description="Power density at each point [W/m²]"
    )
    poynting_vector_real: List[List[float]] = Field(
        description="Real part of Poynting vector [P x 3] [W/m²]"
    )
    poynting_vector_imag: List[List[float]] = Field(
        description="Imaginary part of Poynting vector [P x 3] [W/m²]"
    )


class ImpedanceRequest(BaseModel):
    """
    Request for impedance calculation.
    """
    port_edge_id: Optional[int] = Field(
        default=None,
        description="Edge ID of the port (None = use first source)"
    )
    reference_impedance: float = Field(
        default=50.0,
        description="Reference impedance for VSWR/return loss [Ohm]",
        gt=0
    )


class PostprocessorJobCreate(BaseModel):
    """Schema for creating a postprocessor job."""
    job_id: UUID = Field(description="Solver job ID to process")
    type: PostprocessorResultType
    parameters: dict = Field(
        description="Type-specific parameters"
    )
