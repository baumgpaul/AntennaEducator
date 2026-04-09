"""FEM mesh models: nodes, elements, regions, boundaries, and the complete mesh."""

from enum import Enum
from typing import Any

from pydantic import BaseModel


class ElementType(str, Enum):
    """Finite element type."""

    TRI3 = "tri3"
    TRI6 = "tri6"
    QUAD4 = "quad4"


class FEMNode(BaseModel):
    """A mesh node with coordinates."""

    id: int
    coords: list[float]


class FEMElement(BaseModel):
    """A finite element connecting nodes within a region."""

    id: int
    element_type: ElementType
    node_ids: list[int]
    region_id: int


class Region(BaseModel):
    """A named region (subdomain) with an optional material assignment."""

    id: int
    name: str
    material_id: str | None = None


class BoundaryEdge(BaseModel):
    """A boundary edge defined by node IDs and a named boundary region."""

    id: int
    node_ids: list[int]
    region_name: str


class FEMMesh(BaseModel):
    """Complete finite element mesh."""

    nodes: list[FEMNode]
    elements: list[FEMElement]
    regions: list[Region]
    boundary_edges: list[BoundaryEdge]
    element_type: ElementType
    dimension: int = 2
    metadata: dict[str, Any] = {}
