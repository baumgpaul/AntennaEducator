"""
Request / response schemas for the FDTD Postprocessor service.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Field extraction
# ---------------------------------------------------------------------------
class FieldSnapshotRequest(BaseModel):
    """Extract a field snapshot at a specific time step from solver output."""

    field_component: Literal["Ex", "Ey", "Ez", "Hx", "Hy", "Hz"] = Field(
        description="Field component to extract",
    )
    field_data: list = Field(
        description="2-D or 1-D array of field values (from solver output)",
    )
    dx: float = Field(description="Cell size in x [m]")
    dy: float = Field(default=0.0, description="Cell size in y [m] (0 for 1-D)")


class FieldSnapshotResponse(BaseModel):
    """Extracted field snapshot with spatial coordinates."""

    field_component: str
    values: list = Field(description="Field values (1-D list or 2-D nested list)")
    x_coords: list[float] = Field(description="x-axis coordinates [m]")
    y_coords: list[float] = Field(
        default_factory=list,
        description="y-axis coordinates [m] (empty for 1-D)",
    )
    min_value: float
    max_value: float


class FrequencyFieldRequest(BaseModel):
    """Extract frequency-domain field from DFT results."""

    frequency_hz: float = Field(description="Target frequency [Hz]")
    dft_real: list = Field(description="Real part of DFT field data")
    dft_imag: list = Field(description="Imaginary part of DFT field data")
    dx: float = Field(description="Cell size in x [m]")
    dy: float = Field(default=0.0, description="Cell size in y [m]")


class FrequencyFieldResponse(BaseModel):
    """Frequency-domain field magnitude and phase."""

    frequency_hz: float
    magnitude: list = Field(description="Field magnitude")
    phase_deg: list = Field(description="Field phase [degrees]")
    x_coords: list[float]
    y_coords: list[float] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# SAR computation
# ---------------------------------------------------------------------------
class SarRequest(BaseModel):
    """Compute Specific Absorption Rate from E-field and material properties."""

    e_field_magnitude: list = Field(
        description="E-field magnitude data (1-D or 2-D array)",
    )
    sigma: list = Field(
        description="Conductivity map [S/m] (same shape as e_field_magnitude)",
    )
    density: list = Field(
        description="Mass density map [kg/m³] (same shape as e_field_magnitude)",
    )
    dx: float = Field(description="Cell size in x [m]")
    dy: float = Field(default=0.0, description="Cell size in y [m]")


class SarResponse(BaseModel):
    """SAR computation result."""

    sar: list = Field(description="SAR values [W/kg]")
    peak_sar: float = Field(description="Peak SAR value [W/kg]")
    average_sar: float = Field(description="Volume-averaged SAR [W/kg]")
    x_coords: list[float]
    y_coords: list[float] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Poynting vector (energy flow)
# ---------------------------------------------------------------------------
class PoyntingRequest(BaseModel):
    """Compute Poynting vector from E and H fields."""

    e_fields: dict = Field(
        description="E-field components, e.g. {'Ez': [[...]]} for TM mode",
    )
    h_fields: dict = Field(
        description="H-field components, e.g. {'Hx': [[...]], 'Hy': [[...]]}",
    )
    dx: float = Field(description="Cell size in x [m]")
    dy: float = Field(default=0.0, description="Cell size in y [m]")


class PoyntingResponse(BaseModel):
    """Poynting vector result."""

    sx: list = Field(default_factory=list, description="x-component of Poynting vector")
    sy: list = Field(default_factory=list, description="y-component of Poynting vector")
    sz: list = Field(default_factory=list, description="z-component of Poynting vector")
    magnitude: list = Field(description="Poynting vector magnitude [W/m²]")
    total_power: float = Field(description="Integrated total power [W]")


# ---------------------------------------------------------------------------
# Far-field / radiation pattern
# ---------------------------------------------------------------------------
class RadiationPatternRequest(BaseModel):
    """Compute 2-D far-field radiation pattern from near-field data."""

    e_field: list = Field(description="Near-field E data on a closed surface (2-D array)")
    h_field_x: list = Field(description="Near-field Hx data on a closed surface (2-D array)")
    h_field_y: list = Field(description="Near-field Hy data on a closed surface (2-D array)")
    frequency_hz: float = Field(description="Frequency [Hz]")
    dx: float = Field(description="Cell size in x [m]")
    dy: float = Field(description="Cell size in y [m]")
    num_angles: int = Field(default=360, description="Number of angular samples")


class RadiationPatternResponse(BaseModel):
    """Far-field radiation pattern result."""

    angles_deg: list[float] = Field(description="Observation angles [degrees]")
    pattern_db: list[float] = Field(description="Normalized pattern [dB]")
    pattern_linear: list[float] = Field(description="Normalized pattern (linear)")
    max_directivity_db: float = Field(description="Maximum directivity [dBi]")
    beam_width_deg: Optional[float] = Field(
        default=None,
        description="Half-power beamwidth [degrees]",
    )


# ---------------------------------------------------------------------------
# RCS (Radar Cross Section)
# ---------------------------------------------------------------------------
class RcsRequest(BaseModel):
    """Compute 2-D radar cross section from scattered field data."""

    scattered_e: list = Field(description="Scattered E-field on near-field contour (1-D array)")
    scattered_h: list = Field(
        description="Scattered H-field tangential components on contour (1-D array)",
    )
    incident_e0: float = Field(description="Incident E-field amplitude [V/m]")
    frequency_hz: float = Field(description="Frequency [Hz]")
    contour_radius: float = Field(description="Near-field contour radius [m]")
    num_angles: int = Field(default=360, description="Number of angular samples")


class RcsResponse(BaseModel):
    """RCS computation result."""

    angles_deg: list[float]
    rcs_2d: list[float] = Field(description="2-D RCS [m] (not m²)")
    rcs_db: list[float] = Field(description="2-D RCS [dB·m]")
    max_rcs: float
    max_rcs_angle_deg: float
