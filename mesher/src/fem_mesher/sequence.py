"""Run a geometry sequence in Gmsh's OpenCASCADE kernel: steps → named objects."""

import math
from contextlib import contextmanager
from typing import Callable

import gmsh

from .geometry import Geometry

DimTag = tuple[int, int]
Objects = dict[str, list[DimTag]]  # insertion order = painter's order


@contextmanager
def gmsh_errors(context: str):
    """Gmsh reports geometry errors as plain ``Exception``: make them ``ValueError``
    (a client error), with the step they come from."""
    try:
        yield
    except Exception as e:  # noqa: BLE001 - gmsh raises bare Exception
        if type(e) is Exception:
            raise ValueError(f"{context}: {e}") from None
        raise


def run_sequence(geometry: Geometry, ev: Callable) -> Objects:
    objects: Objects = {}
    for step in geometry.steps:
        with gmsh_errors(f"Step {step.name!r}"):
            _STEPS[step.kind](gmsh.model.occ, step, ev, objects)
    gmsh.model.occ.synchronize()
    return objects


def _positive(step, **values: float) -> None:
    for key, v in values.items():
        if not v > 0:
            raise ValueError(f"Step {step.name!r}: {key} must be positive")


def _sweep(step, ev) -> tuple[float, float]:
    a0, a1 = ev(step.start), ev(step.end)
    if not 0 < a1 - a0 <= 360 + 1e-9:
        raise ValueError(f"Step {step.name!r}: end must be after start, by at most 360°")
    return math.radians(a0), math.radians(min(a1, a0 + 360))


def _points(occ, step, ev) -> list[int]:
    return [occ.addPoint(ev(x), ev(y), 0) for x, y in step.points]


# ── Primitives ────────────────────────────────────────────────────────────────


def _rectangle(occ, s, ev, objects):
    x, y, w, h, r = ev(s.x), ev(s.y), ev(s.width), ev(s.height), ev(s.corner_radius)
    _positive(s, width=w, height=h)
    if not 0 <= r < min(w, h) / 2:
        raise ValueError(f"Step {s.name!r}: corner radius must be below half the shorter side")
    t = occ.addRectangle(x, y, 0, w, h, roundedRadius=r)
    if angle := ev(s.rotation):
        occ.rotate([(2, t)], x, y, 0, 0, 0, 1, math.radians(angle))
    objects[s.name] = [(2, t)]


def _circle(occ, s, ev, objects):
    r = ev(s.r)
    _positive(s, r=r)
    objects[s.name] = [(2, occ.addDisk(ev(s.cx), ev(s.cy), 0, r, r))]


def _ellipse(occ, s, ev, objects):
    cx, cy, rx, ry = ev(s.cx), ev(s.cy), ev(s.rx), ev(s.ry)
    _positive(s, rx=rx, ry=ry)
    angle = ev(s.rotation)
    if rx < ry:  # OpenCASCADE wants the major axis along x
        rx, ry, angle = ry, rx, angle + 90
    t = occ.addDisk(cx, cy, 0, rx, ry)
    if angle:
        occ.rotate([(2, t)], cx, cy, 0, 0, 0, 1, math.radians(angle))
    objects[s.name] = [(2, t)]


def _sector(occ, s, ev, objects):
    cx, cy, r, ri = ev(s.cx), ev(s.cy), ev(s.r), ev(s.r_inner)
    _positive(s, r=r)
    if not 0 <= ri < r:
        raise ValueError(f"Step {s.name!r}: inner radius must be between 0 and r")
    a0, a1 = _sweep(s, ev)
    if a1 - a0 >= 2 * math.pi - 1e-12:  # full circle or ring
        if ri == 0:
            objects[s.name] = [(2, occ.addDisk(cx, cy, 0, r, r))]
            return
        loops = [occ.addCurveLoop([occ.addCircle(cx, cy, 0, rr)]) for rr in (r, ri)]
        objects[s.name] = [(2, occ.addPlaneSurface(loops))]
        return

    def at(rr, a):
        return occ.addPoint(cx + rr * math.cos(a), cy + rr * math.sin(a), 0)

    # in loop order: outer arc, end side, (inner arc,) start side
    outer = occ.addCircle(cx, cy, 0, r, angle1=a0, angle2=a1)
    if ri > 0:
        inner = occ.addCircle(cx, cy, 0, ri, angle1=a0, angle2=a1)
        curves = [
            outer,
            occ.addLine(at(r, a1), at(ri, a1)),
            inner,
            occ.addLine(at(ri, a0), at(r, a0)),
        ]
    else:
        c = occ.addPoint(cx, cy, 0)
        curves = [outer, occ.addLine(at(r, a1), c), occ.addLine(c, at(r, a0))]
    objects[s.name] = [(2, occ.addPlaneSurface([occ.addCurveLoop(curves)]))]


def _polygon(occ, s, ev, objects):
    pts = _points(occ, s, ev)
    lines = [occ.addLine(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts))]
    objects[s.name] = [(2, occ.addPlaneSurface([occ.addCurveLoop(lines)]))]


def _polyline(occ, s, ev, objects):
    pts = _points(occ, s, ev)
    if s.closed:
        pts.append(pts[0])
    objects[s.name] = [(1, occ.addLine(a, b)) for a, b in zip(pts, pts[1:])]


def _arc(occ, s, ev, objects):
    r = ev(s.r)
    _positive(s, r=r)
    a0, a1 = _sweep(s, ev)
    objects[s.name] = [(1, occ.addCircle(ev(s.cx), ev(s.cy), 0, r, angle1=a0, angle2=a1))]


def _spline(occ, s, ev, objects):
    objects[s.name] = [(1, occ.addSpline(_points(occ, s, ev)))]


def _point(occ, s, ev, objects):
    objects[s.name] = [(0, occ.addPoint(ev(s.x), ev(s.y), 0))]


# ── Steps that use earlier objects ────────────────────────────────────────────


def _surface(occ, s, ev, objects):
    curves = _chain([t for n in s.curves for _, t in objects.pop(n)])
    objects[s.name] = [(2, occ.addPlaneSurface([occ.addCurveLoop(curves)]))]


def _chain(curves: list[int]) -> list[int]:
    """Order curves so that each touches the ones before it: OpenCASCADE builds
    a loop edge by edge and fails on an edge that does not connect yet."""
    gmsh.model.occ.synchronize()

    def ends(c):
        pts = gmsh.model.getBoundary([(1, c)], combined=False, oriented=False)
        return [tuple(gmsh.model.getValue(0, abs(p), [])) for _, p in pts]

    xyz = {c: ends(c) for c in curves}
    span = max((abs(v) for e in xyz.values() for p in e for v in p), default=1.0)
    tol = 1e-9 * max(span, 1e-300)

    def touches(a, b):
        return any(max(abs(u - v) for u, v in zip(p, q)) <= tol for p in a for q in b)

    ordered, rest = [curves[0]], curves[1:]
    while rest:
        nxt = next((c for c in rest if any(touches(xyz[c], xyz[o]) for o in ordered)), None)
        if nxt is None:
            ordered += rest  # not one loop: let OpenCASCADE report it
            break
        ordered.append(nxt)
        rest.remove(nxt)
    return ordered


def _tags(objects, names):
    return [dt for n in names for dt in objects[n]]


def _consume(objects, names, keep):
    if not keep:
        for n in names:
            del objects[n]


def _nonempty(s, out):
    if not out:
        raise ValueError(f"Step {s.name!r}: the {s.kind} is empty")
    return out


def _union(occ, s, ev, objects):
    first, rest = objects[s.objects[0]], _tags(objects, s.objects[1:])
    if s.interior:
        # the pieces of all inputs, edges between them kept
        out, _ = occ.fragment(first, rest, removeObject=not s.keep, removeTool=not s.keep)
        dim = first[0][0]
        out = [dt for dt in out if dt[0] == dim]
    else:
        out, _ = occ.fuse(first, rest, removeObject=not s.keep, removeTool=not s.keep)
    _consume(objects, s.objects, s.keep)
    objects[s.name] = _nonempty(s, out)


def _delete(occ, s, ev, objects):
    occ.remove(_tags(objects, s.objects), recursive=True)
    _consume(objects, s.objects, False)


def _difference(occ, s, ev, objects):
    out, _ = occ.cut(
        _tags(objects, s.objects),
        _tags(objects, s.tools),
        removeObject=not s.keep,
        removeTool=not s.keep,
    )
    _consume(objects, s.objects + s.tools, s.keep)
    objects[s.name] = _nonempty(s, out)


def _intersection(occ, s, ev, objects):
    # OpenCASCADE intersects the object with each tool separately: chain them
    current, original = objects[s.objects[0]], True
    for n in s.objects[1:]:
        current, _ = occ.intersect(
            current, objects[n], removeObject=not (s.keep and original), removeTool=not s.keep
        )
        original = False
        if not current:
            break
    _consume(objects, s.objects, s.keep)
    objects[s.name] = _nonempty(s, current)


def _transform(apply):
    def step(occ, s, ev, objects):
        tags = _tags(objects, s.objects)
        if s.keep:
            tags = occ.copy(tags)
        apply(occ, s, ev, tags)
        if s.keep:
            objects[s.name] = tags

    return step


def _move(occ, s, ev, tags):
    occ.translate(tags, ev(s.dx), ev(s.dy), 0)


def _rotate(occ, s, ev, tags):
    occ.rotate(tags, ev(s.cx), ev(s.cy), 0, 0, 0, 1, math.radians(ev(s.angle)))


def _scale(occ, s, ev, tags):
    fx = ev(s.factor)
    fy = fx if s.factor_y is None else ev(s.factor_y)
    if fx == 0 or fy == 0:
        raise ValueError(f"Step {s.name!r}: a scale factor cannot be 0")
    occ.dilate(tags, ev(s.cx), ev(s.cy), 0, fx, fy, 1)


def _mirror(occ, s, ev, tags):
    a = math.radians(ev(s.angle))
    nx, ny = -math.sin(a), math.cos(a)  # normal of the mirror line
    occ.mirror(tags, nx, ny, 0, -(nx * ev(s.x) + ny * ev(s.y)))


def _array(place):
    def step(occ, s, ev, objects):
        base = _tags(objects, s.objects)
        result = list(base)
        for k in range(1, s.count):
            copy = occ.copy(base)
            place(occ, s, ev, copy, k)
            result += copy
        _consume(objects, s.objects, False)
        objects[s.name] = result

    return step


def _linear(occ, s, ev, tags, k):
    occ.translate(tags, k * ev(s.dx), k * ev(s.dy), 0)


def _polar(occ, s, ev, tags, k):
    occ.rotate(tags, ev(s.cx), ev(s.cy), 0, 0, 0, 1, math.radians(k * ev(s.angle)))


_STEPS = {
    "rectangle": _rectangle,
    "circle": _circle,
    "ellipse": _ellipse,
    "sector": _sector,
    "polygon": _polygon,
    "polyline": _polyline,
    "arc": _arc,
    "spline": _spline,
    "point": _point,
    "surface": _surface,
    "union": _union,
    "difference": _difference,
    "intersection": _intersection,
    "move": _transform(_move),
    "rotate": _transform(_rotate),
    "scale": _transform(_scale),
    "mirror": _transform(_mirror),
    "array": _array(_linear),
    "polar_array": _array(_polar),
    "delete": _delete,
}
