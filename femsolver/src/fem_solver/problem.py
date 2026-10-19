"""Electrostatics problem description and the model checklist.

The PDE, in each domain with permittivity ε = ε₀·εr:

    −∇·(ε ∇V) = ρ                    (ρ: volume charge density [C/m³])

Boundary conditions on named boundaries (from the mesher):
    ground                  V = 0                    (Dirichlet)
    potential               V = V₀(x, y)             (Dirichlet)
    surface_charge_density  −D·n = σ(x, y)           (Neumann; n = outward normal of the domain:
                                                      a charged sheet, field lines go into the domain)
    (none)                  D·n = 0                  ("natural": what FEM imposes by default)

2D plane: fields do not vary along z; ``depth`` [m] is the extent along z
(1 m: results per metre). Values may be expressions of the parameters and,
where they vary in space, of ``x`` and ``y`` [m].
"""

from dataclasses import dataclass
from typing import Annotated, Literal

from fem_mesher.expressions import Expr
from pydantic import BaseModel, ConfigDict, Field

EPSILON_0 = 8.8541878128e-12  # F/m


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Material(_Model):
    name: str
    relative_permittivity: float = Field(gt=0, description="εr (1 for vacuum/air)")


class Ground(_Model):
    type: Literal["ground"] = "ground"
    boundary: str


class Potential(_Model):
    type: Literal["potential"] = "potential"
    boundary: str
    value: Expr = Field(description="V [V]; may depend on x, y")


class SurfaceChargeDensity(_Model):
    type: Literal["surface_charge_density"] = "surface_charge_density"
    boundary: str
    value: Expr = Field(description="σ [C/m²]; may depend on x, y")


BoundaryCondition = Annotated[
    Ground | Potential | SurfaceChargeDensity, Field(discriminator="type")
]


class ChargeDensity(_Model):
    type: Literal["charge_density"] = "charge_density"
    domain: str
    value: Expr = Field(description="ρ [C/m³]; may depend on x, y")


class Electrostatics(_Model):
    physics: Literal["electrostatics"] = "electrostatics"
    depth: float = Field(1.0, gt=0, description="Extent along z [m] (2D plane)")
    parameters: dict[str, Expr] = Field(default_factory=dict)
    materials: dict[str, Material] = Field(description="Material of each domain")
    boundary_conditions: list[BoundaryCondition] = Field(default_factory=list)
    sources: list[ChargeDensity] = Field(default_factory=list)


DIRICHLET = (Ground, Potential)


@dataclass(frozen=True)
class Issue:
    """One entry of the model checklist: what is wrong, where, and why it matters."""

    severity: Literal["error", "warning"]
    step: Literal["materials", "physics", "mesh"]
    message: str
    why: str


def check(problem: Electrostatics, domains: list[str], boundaries: list[str]) -> list[Issue]:
    """Model checklist against the meshed domains and boundaries. Errors block solving."""
    issues: list[Issue] = []
    for d in domains:
        if d not in problem.materials:
            issues.append(
                Issue(
                    "error",
                    "materials",
                    f"Domain {d!r} has no material",
                    "The permittivity is the coefficient of the equation; without it the "
                    "element matrices of this domain cannot be built.",
                )
            )
    for d in problem.materials:
        if d not in domains:
            issues.append(
                Issue(
                    "warning",
                    "materials",
                    f"Material set for {d!r}, which is not a domain",
                    "It has no effect.",
                )
            )
    seen: dict[str, str] = {}
    for bc in problem.boundary_conditions:
        if bc.boundary not in boundaries:
            issues.append(
                Issue(
                    "error",
                    "physics",
                    f"{bc.type} on {bc.boundary!r}, which is not a boundary",
                    "Conditions attach to named boundaries of the geometry.",
                )
            )
        elif bc.boundary in seen:
            issues.append(
                Issue(
                    "error",
                    "physics",
                    f"Boundary {bc.boundary!r} has two conditions ({seen[bc.boundary]}, {bc.type})",
                    "On each boundary either V or the normal flux D·n can be prescribed, not both.",
                )
            )
        else:
            seen[bc.boundary] = bc.type
    for s in problem.sources:
        if s.domain not in domains:
            issues.append(
                Issue(
                    "error", "physics", f"Charge density in {s.domain!r}, which is not a domain", ""
                )
            )
    if not any(isinstance(bc, DIRICHLET) for bc in problem.boundary_conditions):
        issues.append(
            Issue(
                "error",
                "physics",
                "No ground or potential anywhere",
                "Only differences of V are physical: without at least one fixed potential, V is "
                "defined only up to a constant and the system matrix is singular.",
            )
        )
    return issues
