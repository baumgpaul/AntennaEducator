"""Request/response schemas for the FEM Postprocessor service."""

from pydantic import BaseModel

from backend.common.models.fem.mesh import FEMMesh
from backend.common.models.fem.results import ScalarFieldResult, VectorFieldResult


class FieldVisualizationRequest(BaseModel):
    """Request to prepare field data for WebGL rendering."""

    mesh: FEMMesh
    scalar_fields: dict[str, ScalarFieldResult] = {}
    vector_fields: dict[str, VectorFieldResult] = {}
    field_name: str
    display_mode: str = "contour"  # contour, arrows, both


class ScalarFieldResponse(BaseModel):
    """WebGL-ready scalar field visualization data."""

    field_name: str
    positions: list[float]
    indices: list[int]
    values: list[float]
    min_value: float
    max_value: float


class VectorFieldResponse(BaseModel):
    """WebGL-ready vector field visualization data."""

    field_name: str
    arrows: list[dict[str, float]]
    max_magnitude: float = 0.0


class LinePlotRequest(BaseModel):
    """Request to sample a field along a line."""

    mesh: FEMMesh
    scalar_fields: dict[str, ScalarFieldResult] = {}
    vector_fields: dict[str, VectorFieldResult] = {}
    field_name: str
    start_point: list[float]
    end_point: list[float]
    num_points: int = 100


class LinePlotResponse(BaseModel):
    """Field values sampled along a line."""

    distances: list[float]
    values: list[float]
    field_name: str = ""


class PointProbeRequest(BaseModel):
    """Request to probe a field at a single point."""

    mesh: FEMMesh
    scalar_fields: dict[str, ScalarFieldResult] = {}
    vector_fields: dict[str, VectorFieldResult] = {}
    field_name: str
    point: list[float]


class PointProbeResponse(BaseModel):
    """Field value at a specific point."""

    value: float
    point: list[float]
    field_name: str = ""


class VTKExportRequest(BaseModel):
    """Request to export mesh + fields to VTK."""

    mesh: FEMMesh
    scalar_fields: dict[str, ScalarFieldResult] = {}
    vector_fields: dict[str, VectorFieldResult] = {}


class CSVExportRequest(BaseModel):
    """Request to export a scalar field to CSV."""

    mesh: FEMMesh
    scalar_fields: dict[str, ScalarFieldResult] = {}
    vector_fields: dict[str, VectorFieldResult] = {}
    field_name: str


class SurfaceChargeRequest(BaseModel):
    """Request to compute charge on a boundary: Q = ∫ D·n dΓ."""

    mesh: FEMMesh
    vector_fields: dict[str, VectorFieldResult]
    boundary_name: str


class SurfaceChargeResponse(BaseModel):
    """Surface charge integration result."""

    charge: float
    boundary_name: str
    unit: str = "C/m"


class CapacitanceRequest(BaseModel):
    """Request to compute capacitance: C = Q/V."""

    mesh: FEMMesh
    vector_fields: dict[str, VectorFieldResult]
    electrode_boundary: str
    voltage_difference: float


class CapacitanceResponse(BaseModel):
    """Capacitance extraction result."""

    capacitance: float
    charge: float
    voltage_difference: float
    electrode_boundary: str
    unit: str = "F/m"


class BoundaryCurrentRequest(BaseModel):
    """Request to compute current through a boundary: I = ∫ J·n dΓ."""

    mesh: FEMMesh
    vector_fields: dict[str, VectorFieldResult]
    boundary_name: str


class BoundaryCurrentResponse(BaseModel):
    """Boundary current integration result."""

    current: float
    boundary_name: str
    unit: str = "A/m"


class ResistanceRequest(BaseModel):
    """Request to compute resistance: R = V/I."""

    mesh: FEMMesh
    vector_fields: dict[str, VectorFieldResult]
    electrode_boundary: str
    voltage_difference: float


class ResistanceResponse(BaseModel):
    """Resistance extraction result."""

    resistance: float
    current: float
    voltage_difference: float
    electrode_boundary: str
    unit: str = "Ω·m"
