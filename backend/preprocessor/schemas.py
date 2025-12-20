"""Request and response models for the Preprocessor API."""

from typing import Optional, Tuple
from pydantic import BaseModel, Field


class ComplexNumber(BaseModel):
    """Complex number representation."""
    real: float = Field(description="Real part")
    imag: float = Field(default=0.0, description="Imaginary part")


class SourceRequest(BaseModel):
    """Source excitation configuration."""
    type: str = Field(description="Source type: 'voltage' or 'current'")
    amplitude: ComplexNumber = Field(
        default=ComplexNumber(real=1.0, imag=0.0),
        description="Source amplitude (complex)"
    )
    position: str = Field(
        default="center",
        description="Source position: 'center' for dipole"
    )


class DipoleRequest(BaseModel):
    """Request to create a dipole antenna."""
    length: float = Field(gt=0, description="Total length in meters")
    center_position: Tuple[float, float, float] = Field(
        default=(0.0, 0.0, 0.0),
        description="Center point [x, y, z] in meters"
    )
    orientation: Tuple[float, float, float] = Field(
        default=(0.0, 0.0, 1.0),
        description="Direction vector [dx, dy, dz]"
    )
    wire_radius: float = Field(
        default=0.001,
        gt=0,
        description="Wire radius in meters"
    )
    gap: float = Field(
        default=0.0,
        ge=0,
        description="Gap between dipole halves in meters (for feed point)"
    )
    segments: int = Field(
        default=21,
        ge=2,
        description="Number of segments per dipole half (total will be 2*segments)"
    )
    source: Optional[SourceRequest] = Field(
        default=None,
        description="Optional source excitation"
    )
    name: Optional[str] = Field(
        default=None,
        description="Optional name for the element"
    )


class GeometryResponse(BaseModel):
    """Response containing created geometry."""
    element: dict = Field(description="Created antenna element")
    mesh: dict = Field(description="Generated mesh")
    message: str = Field(description="Success message")
