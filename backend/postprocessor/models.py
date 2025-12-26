"""Pydantic models for Postprocessor service."""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Union
import numpy as np


class FieldRequest(BaseModel):
    """Request for field computation."""
    
    # Solver results
    frequencies: List[float] = Field(..., description="Frequencies [Hz]")
    branch_currents: List[List[complex]] = Field(..., description="Branch currents [A] for each frequency")
    
    # Geometry (from preprocessor)
    nodes: List[List[float]] = Field(..., description="Node coordinates [[x,y,z], ...]")
    edges: List[List[int]] = Field(..., description="Edge connectivity [[n1,n2], ...]")
    radii: List[float] = Field(..., description="Wire radii [m]")
    
    # Observation points
    observation_points: List[List[float]] = Field(..., description="Points to evaluate field [[x,y,z], ...]")
    
    class Config:
        json_schema_extra = {
            "example": {
                "frequencies": [100e6],
                "branch_currents": [[[0.001+0j, 0.002+0j]]],
                "nodes": [[0, 0, 0], [0, 0, 0.5]],
                "edges": [[0, 1]],
                "radii": [0.001],
                "observation_points": [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
            }
        }


class FarFieldRequest(BaseModel):
    """Request for far-field radiation pattern."""
    
    # Solver results
    frequencies: List[float] = Field(..., description="Frequencies [Hz]")
    # Allow complex numbers as strings, dicts, or actual complex
    branch_currents: List[List[Union[complex, str, Dict[str, float]]]] = Field(..., description="Branch currents [A]")
    
    # Geometry
    nodes: List[List[float]] = Field(..., description="Node coordinates")
    edges: List[List[int]] = Field(..., description="Edge connectivity")
    radii: List[float] = Field(..., description="Wire radii [m]")
    
    # Angular sampling
    theta_points: int = Field(181, description="Number of theta samples (0° to 180°)")
    phi_points: int = Field(360, description="Number of phi samples (0° to 360°)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "frequencies": [100e6],
                "branch_currents": [[[0.001+0j, 0.002+0j]]],
                "nodes": [[0, 0, 0], [0, 0, 0.5]],
                "edges": [[0, 1]],
                "radii": [0.001],
                "theta_points": 181,
                "phi_points": 360
            }
        }


class RadiationPatternResponse(BaseModel):
    """Response with radiation pattern data."""
    
    frequency: float = Field(..., description="Frequency [Hz]")
    
    # Angular grids
    theta_angles: List[float] = Field(..., description="Theta angles [rad]")
    phi_angles: List[float] = Field(..., description="Phi angles [rad]")
    
    # Field magnitudes (2D arrays flattened)
    E_theta_mag: List[float] = Field(..., description="|E_theta| [V/m]")
    E_phi_mag: List[float] = Field(..., description="|E_phi| [V/m]")
    E_total_mag: List[float] = Field(..., description="|E_total| [V/m]")
    
    # Pattern in dB (normalized to max)
    pattern_db: List[float] = Field(..., description="Normalized pattern [dB]")
    
    # Antenna parameters
    directivity: float = Field(..., description="Directivity [dBi]")
    gain: float = Field(..., description="Gain [dBi]")
    efficiency: float = Field(..., description="Radiation efficiency")
    beamwidth_theta: Optional[float] = Field(None, description="3dB beamwidth in theta [deg]")
    beamwidth_phi: Optional[float] = Field(None, description="3dB beamwidth in phi [deg]")
    max_direction: List[float] = Field(..., description="[theta, phi] of maximum [deg]")


class AntennaParametersRequest(BaseModel):
    """Request for antenna parameter extraction."""
    
    # Solver results
    frequencies: List[float] = Field(..., description="Frequencies [Hz]")
    input_impedances: List[complex] = Field(..., description="Input impedance [Ω]")
    input_currents: List[complex] = Field(..., description="Input current [A]")
    power_dissipated: List[float] = Field(..., description="Dissipated power [W]")
    
    # Optional radiation pattern data
    directivity: Optional[List[float]] = Field(None, description="Directivity [dBi]")
    
    # Reference impedance for VSWR
    reference_impedance: float = Field(50.0, description="Reference Z0 [Ω]")
    vswr_threshold: float = Field(2.0, description="VSWR threshold for bandwidth")
    
    class Config:
        json_schema_extra = {
            "example": {
                "frequencies": [90e6, 100e6, 110e6],
                "input_impedances": [50+20j, 75-5j, 60+15j],
                "input_currents": [0.02+0j, 0.013+0j, 0.017+0j],
                "power_dissipated": [0.01, 0.007, 0.009],
                "reference_impedance": 50.0,
                "vswr_threshold": 2.0
            }
        }


class AntennaParametersResponse(BaseModel):
    """Response with antenna parameters."""
    
    # Impedance characteristics
    input_impedance: List[complex] = Field(..., description="Z_in [Ω]")
    resistance: List[float] = Field(..., description="Real(Z_in) [Ω]")
    reactance: List[float] = Field(..., description="Imag(Z_in) [Ω]")
    
    # Matching characteristics
    vswr: List[float] = Field(..., description="Voltage Standing Wave Ratio")
    return_loss: List[float] = Field(..., description="Return loss [dB]")
    reflection_coefficient: List[complex] = Field(..., description="Γ = (Z-Z0)/(Z+Z0)")
    
    # Bandwidth
    resonant_frequency: Optional[float] = Field(None, description="Frequency where X=0 [Hz]")
    bandwidth_lower: Optional[float] = Field(None, description="Lower bandwidth edge [Hz]")
    bandwidth_upper: Optional[float] = Field(None, description="Upper bandwidth edge [Hz]")
    fractional_bandwidth: Optional[float] = Field(None, description="BW/f0 [%]")
    
    # Efficiency and power
    radiation_efficiency: Optional[List[float]] = Field(None, description="η_rad")
    radiated_power: Optional[List[float]] = Field(None, description="P_rad [W]")
    
    # Directivity and gain
    directivity: Optional[List[float]] = Field(None, description="D [dBi]")
    gain: Optional[List[float]] = Field(None, description="G [dBi]")


class ExportRequest(BaseModel):
    """Request for data export."""
    
    format: str = Field(..., description="Export format: json, csv, vtk, hdf5")
    data: Dict[str, Any] = Field(..., description="Data to export")
    filename: Optional[str] = Field(None, description="Output filename")
    
    class Config:
        json_schema_extra = {
            "example": {
                "format": "csv",
                "data": {
                    "frequencies": [100e6, 200e6],
                    "impedance": [50+0j, 75-10j]
                },
                "filename": "antenna_results.csv"
            }
        }
