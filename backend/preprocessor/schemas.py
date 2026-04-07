"""Request and response models for the Preprocessor API."""

from typing import Any, List, Optional, Tuple, Union

from pydantic import BaseModel, Field, model_validator

from backend.common.models.variables import Variable, VariableContext
from backend.common.utils.expressions import (
    ExpressionError,
    parse_numeric_or_expression,
)


class ComplexNumber(BaseModel):
    """Complex number representation."""

    real: float = Field(description="Real part")
    imag: float = Field(default=0.0, description="Imaginary part")


class VariableDefinition(BaseModel):
    """Variable definition for API requests."""

    name: str
    expression: str
    unit: str | None = None
    description: str | None = None


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
    # Explicit node references for custom antennas
    node_start: Optional[int] = Field(
        default=None, description="Starting node index (for custom antennas)"
    )
    node_end: Optional[int] = Field(
        default=None, description="Ending node index (for custom antennas)"
    )
    # Series impedance for voltage sources (matches enhanced Source model)
    series_R: float = Field(default=0.0, ge=0, description="Series resistance in Ohms")
    series_L: float = Field(default=0.0, ge=0, description="Series inductance in Henries")
    series_C_inv: float = Field(
        default=0.0, ge=0, description="Series inverse capacitance (1/C) in F^-1"
    )
    tag: str = Field(default="", description="Human-readable label for the source")


def _resolve_expressions(
    data: dict[str, Any],
    numeric_fields: list[str],
    variables: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    """
    Resolve expression strings in numeric fields using the variable context.

    Mutates `data` in place and returns it. If a field value is a string,
    evaluate it against the variable context; otherwise leave it as-is.
    """
    if variables is None:
        variables = []

    # Build evaluated variable context
    evaluated: dict[str, float] = {}
    if variables:
        ctx = VariableContext(variables=[Variable(**v) for v in variables])
        evaluated = ctx.evaluate()

    for field_name in numeric_fields:
        if field_name not in data:
            continue
        value = data[field_name]
        if isinstance(value, str):
            try:
                data[field_name] = parse_numeric_or_expression(value, evaluated)
            except ExpressionError as exc:
                raise ValueError(f"Field '{field_name}': {exc}")

    return data


# Numeric fields per antenna type that accept expressions
_DIPOLE_NUMERIC = ["length", "wire_radius", "gap"]
_LOOP_NUMERIC = ["radius", "wire_radius", "gap"]
_ROD_NUMERIC = ["length", "wire_radius"]


class DipoleRequest(BaseModel):
    """Request to create a dipole antenna."""

    length: float = Field(gt=0, le=100, description="Total length in meters")
    center_position: Tuple[float, float, float] = Field(
        default=(0.0, 0.0, 0.0), description="Center point [x, y, z] in meters"
    )
    orientation: Tuple[float, float, float] = Field(
        default=(0.0, 0.0, 1.0), description="Direction vector [dx, dy, dz]"
    )
    wire_radius: float = Field(default=0.001, gt=0, le=1.0, description="Wire radius in meters")
    gap: float = Field(
        default=0.0, ge=0, description="Gap between dipole halves in meters (for feed point)"
    )
    segments: int = Field(
        default=21,
        ge=2,
        le=1000,
        description="Total number of segments (split equally between halves if gap > 0)",
    )
    source: Optional[SourceRequest] = Field(default=None, description="Optional source excitation")
    lumped_elements: List[LumpedElementRequest] = Field(
        default_factory=list,
        description="Optional list of lumped circuit elements (R, L, C) to attach",
    )
    name: Optional[str] = Field(default=None, description="Optional name for the element")
    variable_context: Optional[List[VariableDefinition]] = Field(
        default=None, description="Optional variable definitions for expression evaluation"
    )

    @model_validator(mode="before")
    @classmethod
    def resolve_expressions(cls, data: Any) -> Any:
        if isinstance(data, dict) and data.get("variable_context"):
            _resolve_expressions(data, _DIPOLE_NUMERIC, data["variable_context"])
        return data


class LoopRequest(BaseModel):
    """Request to create a loop antenna."""

    radius: float = Field(gt=0, le=50, description="Loop radius in meters")
    center_position: Tuple[float, float, float] = Field(
        default=(0.0, 0.0, 0.0), description="Center point [x, y, z] in meters"
    )
    normal_vector: Tuple[float, float, float] = Field(
        default=(0.0, 0.0, 1.0), description="Normal vector to loop plane [dx, dy, dz]"
    )
    wire_radius: float = Field(default=0.001, gt=0, le=1.0, description="Wire radius in meters")
    gap: float = Field(
        default=0.0, ge=0, description="Gap at feed point in meters (along circumference)"
    )
    segments: int = Field(
        default=36, ge=3, le=1000, description="Number of segments around the loop"
    )
    source: Optional[SourceRequest] = Field(default=None, description="Optional source excitation")
    lumped_elements: List[LumpedElementRequest] = Field(
        default_factory=list,
        description="Optional list of lumped circuit elements (R, L, C) to attach",
    )
    name: Optional[str] = Field(default=None, description="Optional name for the element")
    variable_context: Optional[List[VariableDefinition]] = Field(
        default=None, description="Optional variable definitions for expression evaluation"
    )

    @model_validator(mode="before")
    @classmethod
    def resolve_expressions(cls, data: Any) -> Any:
        if isinstance(data, dict) and data.get("variable_context"):
            _resolve_expressions(data, _LOOP_NUMERIC, data["variable_context"])
        return data


class RodRequest(BaseModel):
    """Request to create a rod (monopole) antenna."""

    length: float = Field(gt=0, le=100, description="Rod length in meters")
    base_position: Tuple[float, float, float] = Field(
        default=(0.0, 0.0, 0.0), description="Base point [x, y, z] in meters (ground point)"
    )
    orientation: Tuple[float, float, float] = Field(
        default=(0.0, 0.0, 1.0), description="Direction vector [dx, dy, dz] (points from base)"
    )
    wire_radius: float = Field(default=0.001, gt=0, le=1.0, description="Wire radius in meters")
    segments: int = Field(default=21, ge=1, le=1000, description="Number of segments along the rod")
    source: Optional[SourceRequest] = Field(default=None, description="Optional source excitation")
    lumped_elements: List[LumpedElementRequest] = Field(
        default_factory=list,
        description="Optional list of lumped circuit elements (R, L, C) to attach",
    )
    name: Optional[str] = Field(default=None, description="Optional name for the element")
    variable_context: Optional[List[VariableDefinition]] = Field(
        default=None, description="Optional variable definitions for expression evaluation"
    )

    @model_validator(mode="before")
    @classmethod
    def resolve_expressions(cls, data: Any) -> Any:
        if isinstance(data, dict) and data.get("variable_context"):
            _resolve_expressions(data, _ROD_NUMERIC, data["variable_context"])
        return data


class CustomNodeInput(BaseModel):
    """A single node in a custom antenna geometry."""

    id: int = Field(gt=0, description="Node ID (positive integer, 1-based)")
    x: float = Field(description="X coordinate in meters")
    y: float = Field(description="Y coordinate in meters")
    z: float = Field(description="Z coordinate in meters")
    radius: float = Field(
        default=0.001, gt=0, le=1.0, description="Wire radius at this node in meters"
    )


class CustomEdgeInput(BaseModel):
    """An edge connecting two nodes in a custom antenna geometry."""

    node_start: int = Field(description="Start node ID")
    node_end: int = Field(description="End node ID")
    radius: Optional[float] = Field(
        default=None, gt=0, description="Per-edge radius override (uses node avg if None)"
    )


# Numeric fields in custom node coordinates that accept expressions
_CUSTOM_NODE_NUMERIC = ["x", "y", "z", "radius"]


class CustomRequest(BaseModel):
    """Request to create a custom wire antenna from explicit nodes and edges."""

    name: str = Field(default="Custom Antenna", description="Name for the element")
    nodes: List["CustomNodeInput"] = Field(
        min_length=1, max_length=5000, description="Node definitions"
    )
    edges: List["CustomEdgeInput"] = Field(
        min_length=1, max_length=10000, description="Edge connectivity"
    )
    sources: List[SourceRequest] = Field(
        default_factory=list, description="Source excitations with explicit node indices"
    )
    lumped_elements: List[LumpedElementRequest] = Field(
        default_factory=list, description="Lumped circuit elements with explicit node indices"
    )
    variable_context: Optional[List[VariableDefinition]] = Field(
        default=None, description="Optional variable definitions for expression evaluation"
    )

    @model_validator(mode="before")
    @classmethod
    def resolve_expressions(cls, data: Any) -> Any:
        """Resolve expressions in node coordinates using variable context."""
        if isinstance(data, dict) and data.get("variable_context"):
            variables = data["variable_context"]
            nodes = data.get("nodes", [])
            for node in nodes:
                if isinstance(node, dict):
                    _resolve_expressions(node, _CUSTOM_NODE_NUMERIC, variables)
        return data


class GeometryResponse(BaseModel):
    """Response containing created geometry."""

    element: dict = Field(description="Created antenna element")
    mesh: dict = Field(description="Generated mesh")
    message: str = Field(description="Success message")
