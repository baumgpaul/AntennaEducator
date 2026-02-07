"""Request and response models for the Preprocessor API."""

from typing import List, Optional, Tuple, Union

from pydantic import BaseModel, Field


class ComplexNumber(BaseModel):
    """Complex number representation."""

    real: float = Field(description="Real part")
    imag: float = Field(default=0.0, description="Imaginary part")


class LumpedElementRequest(BaseModel):
    """Request to add a lumped circuit element (R, L, C) to an antenna."""

    type: str = Field(
        default="rlc", description="Element type: 'resistor', 'inductor', 'capacitor', or 'rlc'"
    )
    R: float = Field(default=0.0, ge=0, description="Resistance in Ohms")
    L: float = Field(default=0.0, ge=0, description="Inductance in Henries")
    C_inv: float = Field(default=0.0, ge=0, description="Inverse capacitance (1/C) in F^-1")
    node_start: int = Field(
        description="Starting node index: 1-based for mesh nodes (1 to N), 0 for ground, negative for appended nodes"
    )
    node_end: int = Field(
        description="Ending node index: 1-based for mesh nodes (1 to N), 0 for ground, negative for appended nodes"
    )
    tag: str = Field(
        default="", description="Human-readable label (e.g., 'Load resistor', 'Matching capacitor')"
    )


class SourceRequest(BaseModel):
    """Source excitation configuration."""

    type: str = Field(description="Source type: 'voltage' or 'current'")
    amplitude: ComplexNumber = Field(
        default=ComplexNumber(real=1.0, imag=0.0), description="Source amplitude (complex)"
    )
    position: Union[str, int] = Field(
        default="center",
        description="Source position: 'center' for dipole, 'base' for rod, or segment index (int) for loop/rod",
    )
    # Series impedance for voltage sources (matches enhanced Source model)
    series_R: float = Field(default=0.0, ge=0, description="Series resistance in Ohms")
    series_L: float = Field(default=0.0, ge=0, description="Series inductance in Henries")
    series_C_inv: float = Field(
        default=0.0, ge=0, description="Series inverse capacitance (1/C) in F^-1"
    )
    tag: str = Field(default="", description="Human-readable label for the source")


class DipoleRequest(BaseModel):
    """Request to create a dipole antenna."""

    length: float = Field(gt=0, description="Total length in meters")
    center_position: Tuple[float, float, float] = Field(
        default=(0.0, 0.0, 0.0), description="Center point [x, y, z] in meters"
    )
    orientation: Tuple[float, float, float] = Field(
        default=(0.0, 0.0, 1.0), description="Direction vector [dx, dy, dz]"
    )
    wire_radius: float = Field(default=0.001, gt=0, description="Wire radius in meters")
    gap: float = Field(
        default=0.0, ge=0, description="Gap between dipole halves in meters (for feed point)"
    )
    segments: int = Field(
        default=21,
        ge=2,
        description="Number of segments per dipole half (total will be 2*segments)",
    )
    source: Optional[SourceRequest] = Field(default=None, description="Optional source excitation")
    lumped_elements: List[LumpedElementRequest] = Field(
        default_factory=list,
        description="Optional list of lumped circuit elements (R, L, C) to attach",
    )
    name: Optional[str] = Field(default=None, description="Optional name for the element")


class LoopRequest(BaseModel):
    """Request to create a loop antenna."""

    radius: float = Field(gt=0, description="Loop radius in meters")
    center_position: Tuple[float, float, float] = Field(
        default=(0.0, 0.0, 0.0), description="Center point [x, y, z] in meters"
    )
    normal_vector: Tuple[float, float, float] = Field(
        default=(0.0, 0.0, 1.0), description="Normal vector to loop plane [dx, dy, dz]"
    )
    wire_radius: float = Field(default=0.001, gt=0, description="Wire radius in meters")
    gap: float = Field(
        default=0.0, ge=0, description="Gap at feed point in meters (along circumference)"
    )
    segments: int = Field(default=36, ge=3, description="Number of segments around the loop")
    source: Optional[SourceRequest] = Field(default=None, description="Optional source excitation")
    lumped_elements: List[LumpedElementRequest] = Field(
        default_factory=list,
        description="Optional list of lumped circuit elements (R, L, C) to attach",
    )
    name: Optional[str] = Field(default=None, description="Optional name for the element")


class RodRequest(BaseModel):
    """Request to create a rod (monopole) antenna."""

    length: float = Field(gt=0, description="Rod length in meters")
    base_position: Tuple[float, float, float] = Field(
        default=(0.0, 0.0, 0.0), description="Base point [x, y, z] in meters (ground point)"
    )
    orientation: Tuple[float, float, float] = Field(
        default=(0.0, 0.0, 1.0), description="Direction vector [dx, dy, dz] (points from base)"
    )
    wire_radius: float = Field(default=0.001, gt=0, description="Wire radius in meters")
    segments: int = Field(default=21, ge=1, description="Number of segments along the rod")
    source: Optional[SourceRequest] = Field(default=None, description="Optional source excitation")
    lumped_elements: List[LumpedElementRequest] = Field(
        default_factory=list,
        description="Optional list of lumped circuit elements (R, L, C) to attach",
    )
    name: Optional[str] = Field(default=None, description="Optional name for the element")


class HelixRequest(BaseModel):
    """Request to create a helix antenna."""

    radius: float = Field(gt=0, description="Helix radius in meters")
    pitch: float = Field(gt=0, description="Vertical distance per turn in meters")
    turns: float = Field(gt=0, description="Number of complete turns")
    start_position: Tuple[float, float, float] = Field(
        default=(0.0, 0.0, 0.0), description="Starting point [x, y, z] in meters"
    )
    axis: Tuple[float, float, float] = Field(
        default=(0.0, 0.0, 1.0), description="Helix axis direction [dx, dy, dz]"
    )
    wire_radius: float = Field(default=0.001, gt=0, description="Wire radius in meters")
    segments_per_turn: int = Field(
        default=24, ge=3, description="Number of segments per complete turn"
    )
    source: Optional[SourceRequest] = Field(default=None, description="Optional source excitation")
    lumped_elements: List[LumpedElementRequest] = Field(
        default_factory=list,
        description="Optional list of lumped circuit elements (R, L, C) to attach",
    )
    name: Optional[str] = Field(default=None, description="Optional name for the element")


class GeometryResponse(BaseModel):
    """Response containing created geometry."""

    element: dict = Field(description="Created antenna element")
    mesh: dict = Field(description="Generated mesh")
    message: str = Field(description="Success message")
