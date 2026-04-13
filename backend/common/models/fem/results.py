"""FEM solver result models: scalar fields, vector fields, integrals."""

from typing import Any

from pydantic import BaseModel


class ScalarFieldResult(BaseModel):
    """A scalar field defined at mesh nodes or per element."""

    field_name: str
    node_values: list[float] = []
    element_values: list[float] = []
    unit: str = ""
    min_value: float = 0.0
    max_value: float = 0.0


class VectorFieldResult(BaseModel):
    """A vector field defined per element (e.g. electric field, current density)."""

    field_name: str
    element_values: list[list[float]]
    unit: str = ""
    max_magnitude: float = 0.0


class IntegralQuantity(BaseModel):
    """An integral quantity computed over a region or boundary."""

    name: str
    value: float
    unit: str = ""
    region: str | None = None


class FEMSolverResult(BaseModel):
    """Complete FEM solver output."""

    scalar_fields: dict[str, ScalarFieldResult]
    vector_fields: dict[str, VectorFieldResult]
    integrals: list[IntegralQuantity]
    n_dofs: int
    n_elements: int
    solve_time: float
    solver_info: dict[str, Any] = {}
