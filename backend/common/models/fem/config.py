"""FEM solver configuration models."""

from enum import Enum

from pydantic import BaseModel


class PDEType(str, Enum):
    """Supported PDE types."""

    ELECTROSTATIC = "electrostatic"
    CURRENT_FLOW = "current_flow"
    MAGNETOSTATIC = "magnetostatic"
    EDDY_CURRENT = "eddy_current"
    MECHANICS = "mechanics"
    ACOUSTIC = "acoustic"


class AnalysisType(str, Enum):
    """Analysis type (time-domain behaviour)."""

    STATIC = "static"
    HARMONIC = "harmonic"
    TRANSIENT = "transient"
    EIGENFREQUENCY = "eigenfrequency"


class LinearSolverType(str, Enum):
    """Linear algebra solver backend."""

    DIRECT = "direct"
    CG = "cg"
    GMRES = "gmres"


class FEMSolverConfig(BaseModel):
    """Configuration for the FEM solver."""

    pde_type: PDEType
    analysis_type: AnalysisType = AnalysisType.STATIC
    polynomial_order: int = 1
    gauss_order: int | None = None
    solver_type: LinearSolverType = LinearSolverType.DIRECT
    tolerance: float = 1e-10
    max_iterations: int = 1000
    frequency: float | None = None
    compute_gradient: bool = True
    compute_flux: bool = True
    compute_energy: bool = True
