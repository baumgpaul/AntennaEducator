"""Request/response schemas for the FEM Solver service."""

from pydantic import BaseModel

from backend.common.models.fem.boundary_conditions import BoundaryCondition, Excitation
from backend.common.models.fem.config import FEMSolverConfig, PDEType
from backend.common.models.fem.materials import ConductionMaterial, ElectrostaticMaterial
from backend.common.models.fem.mesh import FEMMesh


class FEMSolveRequest(BaseModel):
    """Request to solve a FEM problem."""

    mesh: FEMMesh
    pde_type: PDEType
    materials: dict[str, ElectrostaticMaterial | ConductionMaterial]
    boundary_conditions: list[BoundaryCondition]
    excitations: list[Excitation] = []
    config: FEMSolverConfig


class FEMEstimateRequest(BaseModel):
    """Request to estimate solve time and memory for a FEM problem."""

    mesh: FEMMesh
    pde_type: PDEType
    config: FEMSolverConfig


class FEMEstimateResponse(BaseModel):
    """Estimated computational cost for a FEM solve."""

    n_dofs: int
    n_elements: int
    estimated_time: float
    estimated_memory_mb: float
