"""Request/response schemas for the FEM Preprocessor service."""

from typing import Any

from pydantic import BaseModel

from backend.common.models.fem.geometry import DiscretizationSettings, FEMGeometry
from backend.common.models.fem.mesh import BoundaryEdge, FEMElement, FEMMesh, FEMNode, Region


class MeshGenerateRequest(BaseModel):
    """Request to generate a mesh from geometry and discretization settings."""

    geometry: FEMGeometry
    discretization: DiscretizationSettings
    variables: dict[str, float] | None = None


class MeshImportRequest(BaseModel):
    """Request to import a mesh from explicit node/element data."""

    nodes: list[FEMNode]
    elements: list[FEMElement]
    regions: list[Region]
    boundary_edges: list[BoundaryEdge] = []
    element_type: str = "tri3"
    dimension: int = 2
    metadata: dict[str, Any] = {}


class MeshResponse(BaseModel):
    """Response containing the generated or imported mesh."""

    mesh: FEMMesh
    message: str = ""
