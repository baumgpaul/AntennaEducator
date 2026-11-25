"""Geometry description (version 2): a sequence of modelling steps.

Like the geometry sequence of a CAD/FEM tool, each step creates one named
object from numbers/parameter expressions or from earlier objects:

- primitives: surfaces (rectangle, circle, ellipse, sector, polygon),
  curves (polyline, arc, spline) and points;
- ``surface``: a surface bounded by closed curves (build a shape from lines);
- booleans (union, difference, intersection) consume their inputs unless ``keep``;
- transforms (move, rotate, scale, mirror) change objects in place, or with
  ``keep`` add the transformed copies as a new object named after the step;
- arrays (linear, polar) replace their inputs by one object holding all copies;
- ``delete`` removes objects (e.g. an input a boolean kept).

When the sequence has run, every remaining object is fragmented together:

- the mesh is conforming, and interfaces between materials share their nodes;
- where surfaces overlap, the object created **later** wins (painter's order);
  every surface object that is not a hole becomes a domain named after it;
- objects listed in ``holes`` are cut out and not meshed (e.g. the inside of an
  electrode); their boundary is named after them;
- curve objects become named lines inside the domains (thin electrodes, lines
  that guide the mesh); point objects become mesh nodes (size control, probes);
- boundaries get automatic names that partition all boundary curves:
  ``outer`` (outside of the model), the hole's name (around a hole) and ``a|b``
  (interface between domains a and b, names sorted). Selections and curve
  objects add further names and may overlap with the automatic ones.

Version 1 (a flat list of ``shapes``, sizes per domain/boundary) is upgraded on
load: a v1 shape is a v2 primitive step, and v1 sizes become mesh controls.
"""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .expressions import Expr


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


Point2 = tuple[Expr, Expr]
Angle = Expr  # degrees

# ── Primitives: surfaces ──────────────────────────────────────────────────────


class Rectangle(_Model):
    kind: Literal["rectangle"] = "rectangle"
    name: str
    x: Expr = Field(description="Lower-left corner x [m]")
    y: Expr = Field(description="Lower-left corner y [m]")
    width: Expr
    height: Expr
    rotation: Angle = Field(0, description="Counter-clockwise about the corner (x, y) [°]")
    corner_radius: Expr = Field(0, description="Rounded corners [m]")


class Circle(_Model):
    kind: Literal["circle"] = "circle"
    name: str
    cx: Expr
    cy: Expr
    r: Expr


class Ellipse(_Model):
    kind: Literal["ellipse"] = "ellipse"
    name: str
    cx: Expr
    cy: Expr
    rx: Expr = Field(description="Semi-axis along x before rotation [m]")
    ry: Expr
    rotation: Angle = 0


class Sector(_Model):
    """Circular sector from ``start`` to ``end`` (counter-clockwise, degrees);
    with ``r_inner`` > 0 an annular sector (a full ring for 0…360)."""

    kind: Literal["sector"] = "sector"
    name: str
    cx: Expr
    cy: Expr
    r: Expr
    start: Angle = 0
    end: Angle = 90
    r_inner: Expr = 0


class Polygon(_Model):
    kind: Literal["polygon"] = "polygon"
    name: str
    points: list[Point2] = Field(min_length=3)


# ── Primitives: curves and points ─────────────────────────────────────────────


class Polyline(_Model):
    kind: Literal["polyline"] = "polyline"
    name: str
    points: list[Point2] = Field(min_length=2)
    closed: bool = False


class Arc(_Model):
    kind: Literal["arc"] = "arc"
    name: str
    cx: Expr
    cy: Expr
    r: Expr
    start: Angle = 0
    end: Angle = 90


class Spline(_Model):
    """Smooth curve through the points."""

    kind: Literal["spline"] = "spline"
    name: str
    points: list[Point2] = Field(min_length=2)


class Point(_Model):
    kind: Literal["point"] = "point"
    name: str
    x: Expr
    y: Expr


# ── Steps that use earlier objects ────────────────────────────────────────────


class SurfaceFromCurves(_Model):
    """The surface inside a closed loop of curve objects (consumed)."""

    kind: Literal["surface"] = "surface"
    name: str
    curves: list[str] = Field(min_length=1)


class Union(_Model):
    kind: Literal["union"] = "union"
    name: str
    objects: list[str] = Field(min_length=2)
    keep: bool = Field(False, description="Keep the inputs")
    interior: bool = Field(
        False,
        description="Keep the edges between the inputs: one object of several pieces "
        "(the edges can be named, e.g. for a condition on them)",
    )


class Difference(_Model):
    kind: Literal["difference"] = "difference"
    name: str
    objects: list[str] = Field(min_length=1)
    tools: list[str] = Field(min_length=1, description="Subtracted from the objects")
    keep: bool = False


class Intersection(_Model):
    kind: Literal["intersection"] = "intersection"
    name: str
    objects: list[str] = Field(min_length=2)
    keep: bool = False


class _Transform(_Model):
    name: str
    objects: list[str] = Field(min_length=1)
    keep: bool = Field(
        False, description="Keep the objects and add the transformed copies as a new object `name`"
    )


class Move(_Transform):
    kind: Literal["move"] = "move"
    dx: Expr = 0
    dy: Expr = 0


class Rotate(_Transform):
    kind: Literal["rotate"] = "rotate"
    cx: Expr = 0
    cy: Expr = 0
    angle: Angle


class Scale(_Transform):
    kind: Literal["scale"] = "scale"
    cx: Expr = 0
    cy: Expr = 0
    factor: Expr = Field(description="Uniform factor, or factor along x when factor_y is set")
    factor_y: Expr | None = None


class Mirror(_Transform):
    """Mirror across the line through (x, y) at ``angle`` (0 = horizontal line)."""

    kind: Literal["mirror"] = "mirror"
    x: Expr = 0
    y: Expr = 0
    angle: Angle = 90


class Delete(_Model):
    """Remove objects from the model (e.g. an input kept by a boolean)."""

    kind: Literal["delete"] = "delete"
    name: str
    objects: list[str] = Field(min_length=1)


MAX_ARRAY = 200


class LinearArray(_Model):
    """``count`` copies at multiples of (dx, dy), the original included."""

    kind: Literal["array"] = "array"
    name: str
    objects: list[str] = Field(min_length=1)
    count: int = Field(ge=1, le=MAX_ARRAY)
    dx: Expr = 0
    dy: Expr = 0


class PolarArray(_Model):
    """``count`` copies rotated about (cx, cy) by multiples of ``angle``."""

    kind: Literal["polar_array"] = "polar_array"
    name: str
    objects: list[str] = Field(min_length=1)
    count: int = Field(ge=1, le=MAX_ARRAY)
    cx: Expr = 0
    cy: Expr = 0
    angle: Angle = Field(description="Between neighbouring copies [°]")


SURFACE_KINDS = ("rectangle", "circle", "ellipse", "sector", "polygon")
CURVE_KINDS = ("polyline", "arc", "spline")
TRANSFORM_KINDS = ("move", "rotate", "scale", "mirror")

Step = Annotated[
    Rectangle
    | Circle
    | Ellipse
    | Sector
    | Polygon
    | Polyline
    | Arc
    | Spline
    | Point
    | SurfaceFromCurves
    | Union
    | Difference
    | Intersection
    | Move
    | Rotate
    | Scale
    | Mirror
    | LinearArray
    | PolarArray
    | Delete,
    Field(discriminator="kind"),
]

# ── Named boundary selections ─────────────────────────────────────────────────


class BoxSelection(_Model):
    """Every boundary curve lying completely inside the box."""

    kind: Literal["box"] = "box"
    name: str
    xmin: Expr
    ymin: Expr
    xmax: Expr
    ymax: Expr


class PointSelection(_Model):
    """The boundary curve nearest to each point (what a click in the editor stores)."""

    kind: Literal["points"] = "points"
    name: str
    points: list[Point2] = Field(min_length=1)


class BoundaryOfSelection(_Model):
    """All boundary curves of the given domains."""

    kind: Literal["boundary_of"] = "boundary_of"
    name: str
    domains: list[str] = Field(min_length=1)


Selection = Annotated[
    BoxSelection | PointSelection | BoundaryOfSelection, Field(discriminator="kind")
]

# ── Mesh ──────────────────────────────────────────────────────────────────────

MAX_DIVISIONS = 10_000
MAX_LAYERS = 50


class BoundaryLayer(_Model):
    """Thin layers of elements along a boundary or curve: ``layers`` rows, the
    first ``first`` thick, each ``growth`` times thicker than the one before."""

    first: Expr = Field(description="Thickness of the first layer [m]")
    growth: Expr = 1.2
    layers: int = Field(5, ge=1, le=MAX_LAYERS)


class MeshControl(_Model):
    """Local discretisation of a domain, a boundary (or curve object) or a point object.

    - ``size``: maximum element size inside a domain; along a boundary or at a
      point, graded back to the global size over 4 × the global size;
    - ``divisions``: number of elements along each curve of a boundary/domain
      (split curves share it in proportion to their length);
    - ``grading``: last/first element length along each curve with divisions;
    - ``structured``: mapped mesh in a domain with 3 or 4 sides;
    - ``boundary_layer``: thin layers along a boundary or curve (e.g. where a
      field changes fast next to an electrode).
    """

    target: str
    size: Expr | None = None
    divisions: Expr | None = None
    grading: Expr = 1
    structured: bool = False
    boundary_layer: BoundaryLayer | None = None


ALGORITHMS = {"frontal-delaunay": 6, "delaunay": 5, "meshadapt": 1}


class MeshSettings(_Model):
    size: Expr = Field(description="Maximum element size [m]")
    min_size: Expr | None = Field(None, description="Minimum element size [m]")
    algorithm: Literal["frontal-delaunay", "delaunay", "meshadapt"] = "frontal-delaunay"
    order: Literal[1, 2] = Field(1, description="2: elements with edge midpoints")
    element: Literal["triangle", "quad"] = Field(
        "triangle", description="quad: triangles recombined into quadrilaterals"
    )
    elements_per_circle: int = Field(16, ge=4, description="Resolution of curved boundaries")
    smoothing: int = Field(1, ge=0, le=100, description="Laplacian smoothing passes")
    controls: list[MeshControl] = Field(default_factory=list)


RESERVED_BOUNDARY = "outer"


class Geometry(_Model):
    version: Literal[2] = 2
    dimension: Literal[2] = 2
    parameters: dict[str, Expr] = Field(default_factory=dict)
    steps: list[Step] = Field(min_length=1)
    holes: list[str] = Field(default_factory=list)
    selections: list[Selection] = Field(default_factory=list)
    mesh: MeshSettings

    @model_validator(mode="before")
    @classmethod
    def _upgrade_v1(cls, data: Any) -> Any:
        if isinstance(data, dict) and "shapes" in data:
            if data.get("version", 1) != 1:
                raise ValueError("'shapes' is version 1; version 2 uses 'steps'")
            return upgrade_v1(data)
        return data

    @model_validator(mode="after")
    def _sequence(self) -> "Geometry":
        validate_sequence(self)
        return self

    def objects(self) -> dict[str, int]:
        """Objects alive after the sequence: name → dimension (2 surface, 1 curve, 0 point)."""
        return validate_sequence(self)

    def domains(self) -> list[str]:
        holes = set(self.holes)
        return [n for n, d in self.objects().items() if d == 2 and n not in holes]


def upgrade_v1(data: dict) -> dict:
    """Version 1 JSON → version 2 JSON (shapes → steps, sizes → controls).

    A v1 shape is a v2 primitive step and v1 selections are boxes, so only the
    mesh sizes change form; the mesh comes out the same."""
    out = {k: v for k, v in data.items() if k not in ("shapes", "version")}
    out["version"] = 2
    out["steps"] = data["shapes"]
    out["selections"] = [{"kind": "box", **s} for s in data.get("selections", [])]
    if isinstance(data.get("mesh"), dict):
        mesh = {
            k: v for k, v in data["mesh"].items() if k not in ("domain_sizes", "boundary_sizes")
        }
        sizes = {**data["mesh"].get("domain_sizes", {}), **data["mesh"].get("boundary_sizes", {})}
        mesh["controls"] = [{"target": t, "size": v} for t, v in sizes.items()]
        out["mesh"] = mesh
    return out


def _object_dim(step) -> int | None:
    if step.kind in SURFACE_KINDS or step.kind == "surface":
        return 2
    if step.kind in CURVE_KINDS:
        return 1
    if step.kind == "point":
        return 0
    return None


def validate_sequence(g: Geometry) -> dict[str, int]:
    """Run the sequence on names only: references, dimensions, unique names.
    Returns the objects alive at the end (name → dimension), in painter's order."""
    step_names = [s.name for s in g.steps]
    for n in step_names:
        _check_name(n, "Step")
    if len(set(step_names)) != len(step_names):
        raise ValueError("Step names must be unique")

    live: dict[str, int] = {}

    def use(names: list[str], what: str) -> list[int]:
        dims = []
        for n in names:
            if n not in live:
                raise ValueError(f"{what}: {n!r} is not an object at this step")
            dims.append(live[n])
        if len(set(names)) != len(names):
            raise ValueError(f"{what}: an object is listed twice")
        return dims

    for s in g.steps:
        what = f"Step {s.name!r} ({s.kind})"
        dim = _object_dim(s)
        if dim is not None and s.kind != "surface":
            live[s.name] = dim
        elif s.kind == "surface":
            if any(d != 1 for d in use(s.curves, what)):
                raise ValueError(f"{what}: only curves can bound a surface")
            for n in s.curves:
                del live[n]
            live[s.name] = 2
        elif s.kind in ("union", "intersection", "difference"):
            dims = use(s.objects, what)
            if len(set(dims)) != 1 or dims[0] == 0:
                raise ValueError(f"{what}: objects must all be surfaces or all curves")
            consumed = list(s.objects)
            if s.kind == "difference":
                tool_dims = use(s.tools, what)
                if set(s.tools) & set(s.objects):
                    raise ValueError(f"{what}: an object cannot also be a tool")
                if any(d < dims[0] for d in tool_dims):
                    raise ValueError(f"{what}: a tool must not have a lower dimension")
                consumed += s.tools
            if not s.keep:
                for n in consumed:
                    del live[n]
            live[s.name] = dims[0]
        elif s.kind in TRANSFORM_KINDS:
            dims = use(s.objects, what)
            if s.keep:
                if len(set(dims)) != 1:
                    raise ValueError(f"{what}: copied objects must have the same dimension")
                live[s.name] = dims[0]
        elif s.kind == "delete":
            use(s.objects, what)
            for n in s.objects:
                del live[n]
        elif s.kind in ("array", "polar_array"):
            dims = use(s.objects, what)
            if len(set(dims)) != 1:
                raise ValueError(f"{what}: objects must have the same dimension")
            for n in s.objects:
                del live[n]
            live[s.name] = dims[0]
        else:  # pragma: no cover - every kind is handled above
            raise TypeError(s.kind)

    for h in g.holes:
        if live.get(h) != 2:
            raise ValueError(f"Hole {h!r} is not a surface object")
    if not any(d == 2 and n not in g.holes for n, d in live.items()):
        raise ValueError("At least one surface must be a domain (not a hole)")

    selection_names = [s.name for s in g.selections]
    for n in selection_names:
        _check_name(n, "Selection")
    if len(set(selection_names)) != len(selection_names) or set(selection_names) & set(step_names):
        raise ValueError("Selection names must be unique and differ from step names")
    domains = {n for n, d in live.items() if d == 2 and n not in g.holes}
    for sel in g.selections:
        if isinstance(sel, BoundaryOfSelection):
            for d in sel.domains:
                if d not in domains:
                    raise ValueError(f"Selection {sel.name!r}: {d!r} is not a domain")
    possible = set(live) | set(selection_names) | {RESERVED_BOUNDARY}
    for c in g.mesh.controls:
        a, _, b = c.target.partition("|")
        if c.target not in possible and not (a in domains and b in domains):
            raise ValueError(
                f"Mesh control {c.target!r}: not a domain, boundary, curve or point of the model"
            )
        if c.size is None and c.divisions is None and not c.structured and not c.boundary_layer:
            raise ValueError(
                f"Mesh control {c.target!r}: set a size, divisions, structured or a boundary layer"
            )
        if c.boundary_layer and c.target in domains:
            raise ValueError(
                f"Mesh control {c.target!r}: boundary layers grow from a boundary or curve"
            )
        if c.structured and c.target not in domains:
            raise ValueError(f"Mesh control {c.target!r}: only a domain can be structured")
        if live.get(c.target) == 0 and c.divisions is not None:
            raise ValueError(f"Mesh control {c.target!r}: a point has no divisions")
    targets = [c.target for c in g.mesh.controls]
    if len(set(targets)) != len(targets):
        raise ValueError("One mesh control per target")
    return live


def _check_name(n: str, what: str) -> None:
    if not n or "|" in n or n == RESERVED_BOUNDARY:
        raise ValueError(
            f"Invalid {what.lower()} name {n!r} ('|' and {RESERVED_BOUNDARY!r} are reserved)"
        )


# Version 1 compatibility: the v1 model name
Geometry2D = Geometry
