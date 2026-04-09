"""FEM boundary condition and excitation models."""

from enum import Enum

from pydantic import BaseModel


class BCType(str, Enum):
    """Boundary condition type."""

    DIRICHLET = "dirichlet"
    NEUMANN = "neumann"
    ROBIN = "robin"


class BoundaryCondition(BaseModel):
    """A boundary condition applied to a named boundary."""

    bc_type: BCType
    boundary_name: str
    value: float | str
    alpha: float | None = None
    beta: float | None = None


class Excitation(BaseModel):
    """A volumetric excitation (source term) applied to a named region."""

    region_name: str
    excitation_type: str
    value: float | str
