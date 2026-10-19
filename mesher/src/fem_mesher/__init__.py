"""fem_mesher — geometry description → conforming triangle mesh (Gmsh), solver-agnostic."""

from .build import MeshResult, mesh_geometry
from .expressions import ExpressionError, evaluate, evaluate_parameters
from .geometry import BoxSelection, Circle, Geometry2D, MeshSettings, Polygon, Rectangle
from .mesh import Mesh

__all__ = [
    "BoxSelection",
    "Circle",
    "ExpressionError",
    "Geometry2D",
    "Mesh",
    "MeshResult",
    "MeshSettings",
    "Polygon",
    "Rectangle",
    "evaluate",
    "evaluate_parameters",
    "mesh_geometry",
]
