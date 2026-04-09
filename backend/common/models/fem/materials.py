"""FEM material models: properties, generic materials, and PDE-specific materials."""

from pydantic import BaseModel


class MaterialProperty(BaseModel):
    """A single material property (scalar or tensor)."""

    name: str
    value: float | list[list[float]]
    is_tensor: bool = False
    unit: str | None = None


class Material(BaseModel):
    """Generic material with a dictionary of named properties."""

    id: str
    name: str
    properties: dict[str, MaterialProperty]


class ElectrostaticMaterial(BaseModel):
    """Material for electrostatic analysis with relative permittivity."""

    id: str
    name: str
    relative_permittivity: float | list[list[float]]


class ConductionMaterial(BaseModel):
    """Material for current-flow analysis with conductivity."""

    id: str
    name: str
    conductivity: float | list[list[float]]
