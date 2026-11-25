"""Geometry → Gmsh (OpenCASCADE) → Mesh, with named domains and boundaries."""

import math
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path

import gmsh
import numpy as np

from .expressions import evaluate, evaluate_parameters
from .geometry import ALGORITHMS, MAX_DIVISIONS, RESERVED_BOUNDARY, Geometry
from .mesh import Mesh
from .sequence import gmsh_errors, run_sequence

# Gmsh element types: 3/6-node triangles, 2/3-node lines
_TRIANGLE = {1: 2, 2: 9}
_LINE = {1: 1, 2: 8}
_BOX_TOLERANCE = 1e-9  # relative to the model size
_POINT_TOLERANCE = 0.02  # a point selection picks curves this close (relative to the model size)
_EQUILATERAL = math.sqrt(3) / 4  # area of an equilateral triangle of side 1


@dataclass
class MeshResult:
    mesh: Mesh
    warnings: list[str] = field(default_factory=list)


@contextmanager
def _gmsh_session():
    # interruptible=False: no signal handler (works outside the main thread)
    gmsh.initialize(readConfigFiles=False, interruptible=False)
    try:
        gmsh.option.setNumber("General.Terminal", 0)
        gmsh.model.add("fem")
        yield
    finally:
        gmsh.finalize()


@dataclass
class _Model:
    """The fragmented model: which pieces belong to which domain/boundary/point."""

    domain_surfaces: dict[str, list[int]]
    boundary_curves: dict[str, list[int]]
    points: dict[str, list[int]]
    warnings: list[str]


def mesh_geometry(
    geometry: Geometry, msh_path: str | Path | None = None, max_elements: int | None = None
) -> MeshResult:
    """Mesh a 2D geometry. Optionally also writes a Gmsh file (MSH 2.2 ASCII,
    the version openCFS reads) whose physical names are the domain and
    boundary names. ``max_elements`` refuses meshes estimated (before meshing)
    or found to be larger."""
    values = evaluate_parameters(geometry.parameters)
    ev = lambda expr: evaluate(expr, values)  # noqa: E731

    with _gmsh_session():
        model = _build(geometry, ev)
        order = geometry.mesh.order
        domain_names = list(model.domain_surfaces)
        for i, name in enumerate(domain_names, start=1):
            gmsh.model.addPhysicalGroup(2, model.domain_surfaces[name], tag=i, name=name)
        for i, (name, curves) in enumerate(
            sorted(model.boundary_curves.items()), start=len(domain_names) + 1
        ):
            gmsh.model.addPhysicalGroup(1, curves, tag=i, name=name)

        estimate = _apply_mesh_settings(geometry, ev, model)
        if max_elements is not None and estimate > max_elements:
            raise ValueError(
                f"The mesh would have about {estimate:,.0f} elements (at most "
                f"{max_elements:,}): increase the element size"
            )
        with gmsh_errors("Meshing"):
            gmsh.model.mesh.generate(2)
            if order == 2:
                gmsh.model.mesh.setOrder(2)

        mesh = _extract(order, domain_names, model.domain_surfaces, model.boundary_curves)
        if max_elements is not None and mesh.n_triangles > max_elements:
            raise ValueError(
                f"The mesh has {mesh.n_triangles:,} elements (at most {max_elements:,}): "
                "increase the element size"
            )
        if msh_path is not None:
            gmsh.option.setNumber("Mesh.MshFileVersion", 2.2)
            gmsh.option.setNumber("Mesh.SaveAll", 0)  # only physical groups
            gmsh.write(str(msh_path))

    return MeshResult(mesh=mesh, warnings=model.warnings)


# ── Geometry: sequence → fragments → names ────────────────────────────────────


def _build(geometry: Geometry, ev) -> _Model:
    occ = gmsh.model.occ
    warnings: list[str] = []
    objects = run_sequence(geometry, ev)
    names = list(objects)  # painter's order: later objects win
    dims = {n: tags[0][0] for n, tags in objects.items()}
    inputs = [(dt, n) for n in names for dt in objects[n]]

    # Conforming partition: every overlap becomes its own piece
    with gmsh_errors("Joining the objects"):
        if len(inputs) > 1:
            _, out_map = occ.fragment([dt for dt, _ in inputs], [])
        else:
            out_map = [[inputs[0][0]]]
        occ.synchronize()

    surface_owners: dict[int, list[int]] = {}  # surface piece → indices into names
    curve_objects: dict[int, set[str]] = {}  # curve piece → curve objects
    point_objects: dict[int, set[str]] = {}
    for (_, name), pieces in zip(inputs, out_map):
        for d, t in pieces:
            if d == dims[name] == 2:
                surface_owners.setdefault(t, []).append(names.index(name))
            elif d == dims[name] == 1:
                curve_objects.setdefault(t, set()).add(name)
            elif d == dims[name] == 0:
                point_objects.setdefault(t, set()).add(name)

    holes = {names.index(h) for h in geometry.holes}
    hole_pieces = [p for p, ix in surface_owners.items() if holes & set(ix)]
    owner = {p: max(ix) for p, ix in surface_owners.items() if p not in hole_pieces}
    hole_curves: dict[int, set[str]] = {}
    for p in hole_pieces:
        hole_name = names[max(i for i in surface_owners[p] if i in holes)]
        for _, c in gmsh.model.getBoundary([(2, p)], combined=False, oriented=False):
            hole_curves.setdefault(abs(c), set()).add(hole_name)
    if hole_pieces:
        occ.remove([(2, p) for p in hole_pieces], recursive=False)
        occ.synchronize()

    domain_surfaces: dict[str, list[int]] = {}
    for p, i in sorted(owner.items()):
        domain_surfaces.setdefault(names[i], []).append(p)
    domain_surfaces = {n: domain_surfaces[n] for n in names if n in domain_surfaces}
    for n in names:
        if dims[n] == 2 and n not in domain_surfaces and n not in geometry.holes:
            warnings.append(f"Domain {n!r} is completely covered by later objects or holes")

    boundary_curves = _classify_curves(owner, names, hole_curves)
    embedded_curves, embedded_points = _embedded(owner)
    in_model = set(_meshed_curves()) | embedded_curves

    # Curve objects: named lines (on boundaries, or inside a domain)
    for n in names:
        if dims[n] != 1:
            continue
        curves = sorted(c for c, objs in curve_objects.items() if n in objs and c in in_model)
        if len(curves) < sum(1 for objs in curve_objects.values() if n in objs):
            warnings.append(f"Curve {n!r} lies partly outside every domain: that part is ignored")
        if curves:
            boundary_curves[n] = curves

    points: dict[str, list[int]] = {}
    on_curves = {
        abs(t) for c in in_model for _, t in gmsh.model.getBoundary([(1, c)], combined=False)
    }
    for p, objs in point_objects.items():
        if p in embedded_points or p in on_curves:
            for n in objs:
                points.setdefault(n, []).append(p)
    for n in names:
        if dims[n] == 0 and n not in points:
            warnings.append(f"Point {n!r} lies outside every domain: it is ignored")

    _apply_selections(geometry, ev, boundary_curves, domain_surfaces, in_model, warnings)
    return _Model(domain_surfaces, boundary_curves, points, warnings)


def _embedded(owner) -> tuple[set[int], set[int]]:
    """Curves and points embedded in (inside of) the remaining surfaces."""
    curves, points = set(), set()
    for s in owner:
        for d, t in gmsh.model.mesh.getEmbedded(2, s):
            (curves if d == 1 else points).add(t)
    return curves, points


def _meshed_curves() -> list[int]:
    """Curves on the boundary of at least one remaining surface."""
    return [c for _, c in gmsh.model.getEntities(1) if len(gmsh.model.getAdjacencies(1, c)[0]) > 0]


def _classify_curves(owner, names, hole_curves) -> dict[str, list[int]]:
    """outer / hole name / 'a|b' interface for every boundary curve (a partition)."""
    result: dict[str, list[int]] = {}
    for c in _meshed_curves():
        surfaces = gmsh.model.getAdjacencies(1, c)[0]
        domains = sorted({names[owner[s]] for s in surfaces})
        if len(domains) == 2:
            key = f"{domains[0]}|{domains[1]}"
        elif len(surfaces) == 2:
            continue  # between two pieces of the same domain: inside it
        elif c in hole_curves:
            key = sorted(hole_curves[c])[0]
        else:
            key = RESERVED_BOUNDARY
        result.setdefault(key, []).append(c)
    return result


def _apply_selections(geometry, ev, boundary_curves, domain_surfaces, in_model, warnings):
    size = _model_size()
    candidates = sorted(in_model)
    for sel in geometry.selections:
        if sel.kind == "box":
            box = [ev(sel.xmin), ev(sel.ymin), ev(sel.xmax), ev(sel.ymax)]
            curves = [c for c in candidates if _curve_inside(c, box, _BOX_TOLERANCE * size)]
        elif sel.kind == "points":
            curves = []
            for x, y in sel.points:
                c = _nearest_curve(candidates, ev(x), ev(y), _POINT_TOLERANCE * size)
                if c is None:
                    warnings.append(f"Selection {sel.name!r}: no boundary near ({x}, {y})")
                elif c not in curves:
                    curves.append(c)
        else:  # boundary_of
            surfaces = [(2, s) for d in sel.domains for s in domain_surfaces.get(d, [])]
            curves = sorted(
                {abs(t) for _, t in gmsh.model.getBoundary(surfaces, combined=True, oriented=False)}
            )
        if curves:
            boundary_curves[sel.name] = sorted(curves)
        else:
            warnings.append(f"Selection {sel.name!r} contains no boundary")


def _model_size() -> float:
    xmin, ymin, _, xmax, ymax, _ = gmsh.model.getBoundingBox(-1, -1)
    return max(xmax - xmin, ymax - ymin, 1e-300)


def _curve_inside(curve: int, box, tolerance: float) -> bool:
    """All of the curve inside the box. Sampled on the curve itself: OpenCASCADE
    pads bounding boxes (~1e-7), which would miss a box drawn exactly on an edge."""
    lo, hi = gmsh.model.getParametrizationBounds(1, curve)
    xyz = np.reshape(gmsh.model.getValue(1, curve, np.linspace(lo[0], hi[0], 17)), (-1, 3))
    x, y = xyz[:, 0], xyz[:, 1]
    return bool(
        (x >= box[0] - tolerance).all()
        and (y >= box[1] - tolerance).all()
        and (x <= box[2] + tolerance).all()
        and (y <= box[3] + tolerance).all()
    )


def _nearest_curve(curves, x, y, tolerance) -> int | None:
    best, best_d = None, tolerance
    for c in curves:
        p, _ = gmsh.model.getClosestPoint(1, c, [x, y, 0])
        d = math.hypot(p[0] - x, p[1] - y)
        if d <= best_d:
            best, best_d = c, d
    return best


# ── Mesh settings ─────────────────────────────────────────────────────────────


def _curve_length(c: int) -> float:
    return gmsh.model.occ.getMass(1, c)


def _apply_mesh_settings(geometry: Geometry, ev, model: _Model) -> float:
    """Set sizes, divisions, structured domains and the algorithm. Returns an
    estimate of the number of triangles."""
    settings = geometry.mesh
    size = ev(settings.size)
    if size <= 0:
        raise ValueError("mesh.size must be positive")
    gmsh.option.setNumber("Mesh.MeshSizeMax", size)
    if settings.min_size is not None:
        h_min = ev(settings.min_size)
        if not 0 < h_min <= size:
            raise ValueError("mesh.min_size must be positive and at most mesh.size")
        gmsh.option.setNumber("Mesh.MeshSizeMin", h_min)
    # Sizes come only from these settings: OpenCASCADE's default point sizes
    # (from the model extent) would silently override them
    gmsh.option.setNumber("Mesh.MeshSizeFromPoints", 0)
    gmsh.option.setNumber("Mesh.MeshSizeFromCurvature", settings.elements_per_circle)
    gmsh.option.setNumber("Mesh.Algorithm", ALGORITHMS[settings.algorithm])
    gmsh.option.setNumber("Mesh.Smoothing", settings.smoothing)

    domain_size = {d: size for d in model.domain_surfaces}
    extra = 0.0  # elements added by local refinement (estimate)
    fields = []
    f = gmsh.model.mesh.field
    for c in settings.controls:
        t = c.target
        kind = (
            "domain"
            if t in model.domain_surfaces
            else (
                "boundary" if t in model.boundary_curves else "point" if t in model.points else None
            )
        )
        if kind is None:
            raise ValueError(f"Mesh control {t!r}: not a boundary of the meshed model")
        if c.size is not None:
            h = ev(c.size)
            if h <= 0:
                raise ValueError(f"Mesh control {t!r}: size must be positive")
            if kind == "domain":
                fid = f.add("Constant")
                f.setNumbers(fid, "SurfacesList", model.domain_surfaces[t])
                f.setNumber(fid, "VIn", h)
                f.setNumber(fid, "VOut", size)
                fields.append(fid)
                domain_size[t] = min(h, size)
            else:
                dist = f.add("Distance")
                if kind == "boundary":
                    f.setNumbers(dist, "CurvesList", model.boundary_curves[t])
                    f.setNumber(dist, "Sampling", 200)
                    length = sum(_curve_length(x) for x in model.boundary_curves[t])
                    extra += _band_elements(length, h, size)
                else:
                    f.setNumbers(dist, "PointsList", model.points[t])
                    extra += _ball_elements(h, size) * len(model.points[t])
                fid = f.add("Threshold")  # h at the target, growing to size over 4·size
                f.setNumber(fid, "InField", dist)
                f.setNumber(fid, "SizeMin", h)
                f.setNumber(fid, "SizeMax", size)
                f.setNumber(fid, "DistMin", 0.0)
                f.setNumber(fid, "DistMax", 4 * size)
                fields.append(fid)
        if c.structured:
            for s in model.domain_surfaces[t]:
                gmsh.model.mesh.setTransfiniteAutomatic([(2, s)], recombine=False)
        if c.divisions is not None:
            if kind != "boundary":
                raise ValueError(f"Mesh control {t!r}: divisions are set along a boundary or curve")
            extra += _divide(t, ev(c.divisions), ev(c.grading), model.boundary_curves[t], size)
    if fields:
        m = f.add("Min")
        f.setNumbers(m, "FieldsList", fields)
        f.setAsBackgroundMesh(m)

    area = sum(
        gmsh.model.occ.getMass(2, s) / (_EQUILATERAL * domain_size[d] ** 2)
        for d, surfaces in model.domain_surfaces.items()
        for s in surfaces
    )
    return area + extra


def _divide(target, n_expr, grading, curves, size) -> float:
    n = round(n_expr)
    if not 1 <= n <= MAX_DIVISIONS:
        raise ValueError(f"Mesh control {target!r}: divisions must be 1 … {MAX_DIVISIONS}")
    if grading <= 0:
        raise ValueError(f"Mesh control {target!r}: grading must be positive")
    lengths = {c: _curve_length(c) for c in curves}
    total = sum(lengths.values())
    extra = 0.0
    for c, length in lengths.items():
        k = max(1, round(n * length / total))
        progression = grading ** (1 / (k - 1)) if k > 1 else 1.0
        gmsh.model.mesh.setTransfiniteCurve(c, k + 1, "Progression", progression)
        extra += _band_elements(length, length / k, size)
    return extra


def _band_elements(length: float, h: float, size: float) -> float:
    """Elements in the band where the size grows linearly from h (on a curve of
    this length, both sides) to ``size`` over 4·size: 2·L·∫dx/h(x)²."""
    h = min(h, size)
    return 2 * length * 4 * size / (h * size) / _EQUILATERAL


def _ball_elements(h: float, size: float) -> float:
    """Elements around a point where the size grows from h to ``size`` over D = 4·size."""
    h = min(h, size)
    if h >= size:
        return 0.0
    big_d = 4 * size
    b = (size - h) / big_d
    integral = (math.log(size / h) + h / size - 1) / b**2  # ∫₀ᴰ r/(h+br)² dr
    return 2 * math.pi * integral / _EQUILATERAL


# ── Extraction ────────────────────────────────────────────────────────────────


def _extract(order, domain_names, domain_surfaces, boundary_curves) -> Mesh:
    tags, coords, _ = gmsh.model.mesh.getNodes()
    xyz = coords.reshape(-1, 3)[:, :2]
    position = {int(t): i for i, t in enumerate(tags)}
    n_tri, n_line = (3, 2) if order == 1 else (6, 3)

    triangles, tri_domain = [], []
    for d, name in enumerate(domain_names):
        for s in domain_surfaces[name]:
            t = _elements(2, s, _TRIANGLE[order], n_tri)
            triangles.append(t)
            tri_domain.append(np.full(len(t), d))
    tri = np.vstack(triangles)

    edge_rows, curve_rows = [], {}
    for name, curves in sorted(boundary_curves.items()):
        for c in curves:
            if c not in curve_rows:
                e = _elements(1, c, _LINE[order], n_line)
                curve_rows[c] = np.arange(len(e)) + sum(len(r) for r in edge_rows)
                edge_rows.append(e)
    edges = np.vstack(edge_rows) if edge_rows else np.zeros((0, n_line), dtype=np.int64)

    # Compact 0-based numbering of the nodes that are actually used
    used = np.unique(np.concatenate([tri.ravel(), edges.ravel()]))
    renumber = {int(t): i for i, t in enumerate(used)}
    to_index = np.vectorize(renumber.__getitem__, otypes=[np.int64])
    nodes = xyz[[position[int(t)] for t in used]]
    tri = to_index(tri)
    edges = to_index(edges) if len(edges) else edges

    mesh = Mesh(
        nodes=nodes,
        triangles=tri,
        triangle_domain=np.concatenate(tri_domain),
        domain_names=list(domain_names),
        edges=edges,
        boundaries={
            name: np.concatenate([curve_rows[c] for c in curves])
            for name, curves in sorted(boundary_curves.items())
        },
        order=order,
    )
    _orient_counter_clockwise(mesh)
    return mesh


def _elements(dim: int, tag: int, element_type: int, n_nodes: int) -> np.ndarray:
    types, _, node_tags = gmsh.model.mesh.getElements(dim, tag)
    for t, nt in zip(types, node_tags):
        if t == element_type:
            return np.asarray(nt, dtype=np.int64).reshape(-1, n_nodes)
    return np.zeros((0, n_nodes), dtype=np.int64)


def _orient_counter_clockwise(mesh: Mesh) -> None:
    flip = mesh.areas() < 0
    if not flip.any():
        return
    # corners 0,1,2 → 0,2,1; P2 midpoints (01, 12, 20) → (02, 21, 10) = (5, 4, 3)
    perm = [0, 2, 1] if mesh.order == 1 else [0, 2, 1, 5, 4, 3]
    mesh.triangles[flip] = mesh.triangles[flip][:, perm]
