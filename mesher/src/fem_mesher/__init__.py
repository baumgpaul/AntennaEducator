"""fem_mesher — geometry sequence → conforming triangle mesh (Gmsh), solver-agnostic."""

from .build import MeshResult, mesh_geometry
from .expressions import ExpressionError, evaluate, evaluate_field, evaluate_parameters
from .geometry import (
    BoxSelection,
    Circle,
    Geometry,
    Geometry2D,
    MeshControl,
    MeshSettings,
    Polygon,
    Rectangle,
    upgrade_v1,
)
from .mesh import Mesh

__all__ = [
    "BoxSelection",
    "Circle",
    "ExpressionError",
    "Geometry",
    "Geometry2D",
    "Mesh",
    "MeshControl",
    "MeshResult",
    "MeshSettings",
    "Polygon",
    "Rectangle",
    "evaluate",
    "evaluate_field",
    "evaluate_parameters",
    "mesh_geometry",
    "upgrade_v1",
]
