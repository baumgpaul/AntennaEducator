"""Geometry description v1 (2D): shapes, holes, named selections, mesh settings.

Semantics, chosen so that named selections survive geometry edits:

- All shapes are fragmented together: the mesh is conforming, and interfaces
  between materials share their nodes.
- Where shapes overlap, the shape listed **later** wins (painter's order).
  Every non-hole shape becomes a domain named after it.
- Shapes listed in ``holes`` are cut out and not meshed (e.g. the inside of
  an electrode). Holes always cut, whatever their order.
- Boundaries get automatic names that partition all boundary curves:
  ``outer`` (outside of the model), the hole's name (around a hole) and
  ``a|b`` (interface between domains a and b, names sorted). Box selections
  add further names and may overlap with the automatic ones.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .expressions import Expr


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Rectangle(_Model):
    kind: Literal["rectangle"] = "rectangle"
    name: str
    x: Expr = Field(description="Lower-left corner x [m]")
    y: Expr = Field(description="Lower-left corner y [m]")
    width: Expr
    height: Expr


class Circle(_Model):
    kind: Literal["circle"] = "circle"
    name: str
    cx: Expr
    cy: Expr
    r: Expr


class Polygon(_Model):
    kind: Literal["polygon"] = "polygon"
    name: str
    points: list[tuple[Expr, Expr]] = Field(min_length=3)


Shape = Annotated[Rectangle | Circle | Polygon, Field(discriminator="kind")]


class BoxSelection(_Model):
    """Named boundary: every boundary curve lying completely inside the box."""

    name: str
    xmin: Expr
    ymin: Expr
    xmax: Expr
    ymax: Expr


class MeshSettings(_Model):
    size: Expr = Field(description="Maximum element size [m]")
    domain_sizes: dict[str, Expr] = Field(
        default_factory=dict, description="Smaller size inside a domain"
    )
    boundary_sizes: dict[str, Expr] = Field(
        default_factory=dict, description="Smaller size along a boundary"
    )
    order: Literal[1, 2] = 1
    elements_per_circle: int = Field(16, ge=4, description="Resolution of curved boundaries")


RESERVED_BOUNDARY = "outer"


class Geometry2D(_Model):
    version: Literal[1] = 1
    parameters: dict[str, Expr] = Field(default_factory=dict)
    shapes: list[Shape] = Field(min_length=1)
    holes: list[str] = Field(default_factory=list)
    selections: list[BoxSelection] = Field(default_factory=list)
    mesh: MeshSettings

    @model_validator(mode="after")
    def _names(self) -> "Geometry2D":
        names = [s.name for s in self.shapes]
        for n in names:
            if not n or "|" in n or n == RESERVED_BOUNDARY:
                raise ValueError(
                    f"Invalid shape name {n!r} ('|' and {RESERVED_BOUNDARY!r} are reserved)"
                )
        if len(set(names)) != len(names):
            raise ValueError("Shape names must be unique")
        for h in self.holes:
            if h not in names:
                raise ValueError(f"Hole {h!r} is not a shape")
        domains = set(names) - set(self.holes)
        if not domains:
            raise ValueError("At least one shape must be a domain (not a hole)")
        for d in self.mesh.domain_sizes:
            if d not in domains:
                raise ValueError(f"mesh.domain_sizes: {d!r} is not a domain")
        selection_names = [s.name for s in self.selections]
        if (
            len(set(selection_names)) != len(selection_names)
            or set(selection_names) & set(names)
            or RESERVED_BOUNDARY in selection_names
            or any("|" in n for n in selection_names)
        ):
            raise ValueError(
                "Selection names must be unique, differ from shape names and 'outer', no '|'"
            )
        return self
