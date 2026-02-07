"""Pydantic models for Postprocessor service."""

from typing import Dict, List, Optional, Union

from pydantic import BaseModel, Field


class FieldRequest(BaseModel):
    """Request for field computation."""

    frequencies: List[float] = Field(..., description="Frequencies [Hz]")
    branch_currents: List[List[Union[complex, str, Dict[str, float]]]] = Field(
        ..., description="Branch currents [A] per frequency"
    )
    nodes: List[List[float]] = Field(..., description="Node coordinates [[x,y,z], ...]")
    edges: List[List[int]] = Field(..., description="Edge connectivity [[n1,n2], ...]")
    radii: List[float] = Field(..., description="Wire radii [m]")
    observation_points: List[List[float]] = Field(
        ..., description="Points to evaluate field [[x,y,z], ...]"
    )


class FarFieldRequest(BaseModel):
    """Request for far-field radiation pattern."""

    frequencies: List[float] = Field(..., description="Frequencies [Hz]")
    branch_currents: List[List[Union[complex, str, Dict[str, float]]]] = Field(
        ..., description="Branch currents [A] per frequency"
    )
    nodes: List[List[float]] = Field(..., description="Node coordinates")
    edges: List[List[int]] = Field(..., description="Edge connectivity")
    radii: List[float] = Field(..., description="Wire radii [m]")
    theta_points: int = Field(181, description="Number of theta samples (0 to 180 deg)")
    phi_points: int = Field(360, description="Number of phi samples (0 to 360 deg)")


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
