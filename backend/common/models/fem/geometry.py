"""Parametric geometry models: operations, points, edges, bodies, and discretization."""

from typing import Any

from pydantic import BaseModel, computed_field

from backend.common.models.fem.mesh import ElementType


class GeoPointDef(BaseModel):
    """A parametric point with expression coordinates."""

    id: str
    x: str
    y: str


class GeoEdgeDef(BaseModel):
    """An edge (line or arc) connecting points."""

    id: str
    name: str = ""
    edge_type: str  # "line", "arc", etc.
    point_ids: list[str]
    parent_surface_id: str | None = None


class GeoBodyDef(BaseModel):
    """A closed 2-D body (surface) defined by its outer-loop edges and optional inner holes."""

    id: str
    name: str
    primitive_type: str = ""
    edge_ids: list[str]
    inner_loops: list[list[str]] = []


class GeoOperation(BaseModel):
    """A single parametric geometry operation in the construction history."""

    type: str
    params: dict[str, Any]


class FEMGeometry(BaseModel):
    """Complete parametric geometry — operation history plus optional evaluated state."""

    operations: list[GeoOperation]
    points: list[GeoPointDef] | None = None
    edges: list[GeoEdgeDef] | None = None
    bodies: list[GeoBodyDef] | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def surfaces(self) -> list[GeoBodyDef] | None:
        """Alias for bodies — frontend uses 'surfaces' terminology."""
        return self.bodies


class DiscretizationSettings(BaseModel):
    """Mesh discretization configuration for the Gmsh backend."""

    element_type: ElementType = ElementType.TRI3
    global_element_size: float | str = "auto"
    min_element_size: float | str = "auto"
    growth_rate: float = 1.2
    algorithm: str = "frontal_delaunay"
    optimize: bool = True
    polynomial_order: int = 1
    recombine_to_quads: bool = False
    body_sizes: dict[str, float | str] = {}
    edge_divisions: dict[str, int] = {}
    edge_gradings: dict[str, float] = {}


class BoundaryLayerSpec(BaseModel):
    """Boundary layer mesh specification for a specific edge."""

    edge_id: str
    first_layer_thickness: float | str
    num_layers: int
    growth_rate: float = 1.5
