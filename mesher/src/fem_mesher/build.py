"""Geometry2D → Gmsh (OpenCASCADE) → Mesh, with named domains and boundaries."""

from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path

import gmsh
import numpy as np

from .expressions import evaluate, evaluate_parameters
from .geometry import RESERVED_BOUNDARY, Circle, Geometry2D, Polygon, Rectangle
from .mesh import Mesh

# Gmsh element types: 3/6-node triangles, 2/3-node lines
_TRIANGLE = {1: 2, 2: 9}
_LINE = {1: 1, 2: 8}
_BOX_TOLERANCE = 1e-9


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


def mesh_geometry(geometry: Geometry2D, msh_path: str | Path | None = None) -> MeshResult:
    """Mesh a 2D geometry. Optionally also writes a Gmsh file (MSH 2.2 ASCII,
    the version openCFS reads) whose physical names are the domain and
    boundary names."""
    values = evaluate_parameters(geometry.parameters)
    ev = lambda expr: evaluate(expr, values)  # noqa: E731
    warnings: list[str] = []

    with _gmsh_session():
        occ = gmsh.model.occ
        shape_tags = [_add_shape(occ, shape, ev) for shape in geometry.shapes]

        # Conforming partition: every overlap becomes its own piece
        if len(shape_tags) > 1:
            _, out_map = occ.fragment([(2, t) for t in shape_tags], [])
        else:
            out_map = [[(2, shape_tags[0])]]
        occ.synchronize()

        names = [s.name for s in geometry.shapes]
        holes = {names.index(h) for h in geometry.holes}
        containing: dict[int, list[int]] = {}
        for i, pieces in enumerate(out_map):
            for _, piece in pieces:
                containing.setdefault(piece, []).append(i)

        hole_pieces = [p for p, ix in containing.items() if holes & set(ix)]
        owner = {p: max(ix) for p, ix in containing.items() if p not in hole_pieces}
        hole_curves: dict[int, set[str]] = {}
        for p in hole_pieces:
            hole_name = names[max(i for i in containing[p] if i in holes)]
            for _, c in gmsh.model.getBoundary([(2, p)], combined=False, oriented=False):
                hole_curves.setdefault(abs(c), set()).add(hole_name)
        if hole_pieces:
            occ.remove([(2, p) for p in hole_pieces], recursive=False)
            occ.synchronize()

        domain_surfaces: dict[str, list[int]] = {}
        for p, i in sorted(owner.items()):
            domain_surfaces.setdefault(names[i], []).append(p)
        domain_names = [n for n in names if n in domain_surfaces]
        for n in names:
            if n not in domain_surfaces and names.index(n) not in holes:
                warnings.append(f"Domain {n!r} is completely covered by later shapes or holes")

        boundary_curves = _classify_curves(owner, names, hole_curves)
        for sel in geometry.selections:
            box = [ev(sel.xmin), ev(sel.ymin), ev(sel.xmax), ev(sel.ymax)]
            curves = [c for c in _meshed_curves() if _inside(gmsh.model.getBoundingBox(1, c), box)]
            if curves:
                boundary_curves[sel.name] = curves
            else:
                warnings.append(f"Selection {sel.name!r} contains no boundary")

        for i, name in enumerate(domain_names, start=1):
            gmsh.model.addPhysicalGroup(2, domain_surfaces[name], tag=i, name=name)
        for i, (name, curves) in enumerate(
            sorted(boundary_curves.items()), start=len(domain_names) + 1
        ):
            gmsh.model.addPhysicalGroup(1, curves, tag=i, name=name)

        _apply_sizes(geometry, ev, domain_surfaces, boundary_curves)
        gmsh.model.mesh.generate(2)
        if geometry.mesh.order == 2:
            gmsh.model.mesh.setOrder(2)

        mesh = _extract(geometry.mesh.order, domain_names, domain_surfaces, boundary_curves)
        if msh_path is not None:
            gmsh.option.setNumber("Mesh.MshFileVersion", 2.2)
            gmsh.option.setNumber("Mesh.SaveAll", 0)  # only physical groups
            gmsh.write(str(msh_path))

    return MeshResult(mesh=mesh, warnings=warnings)


def _add_shape(occ, shape, ev) -> int:
    if isinstance(shape, Rectangle):
        w, h = ev(shape.width), ev(shape.height)
        if w <= 0 or h <= 0:
            raise ValueError(f"Rectangle {shape.name!r}: width and height must be positive")
        return occ.addRectangle(ev(shape.x), ev(shape.y), 0, w, h)
    if isinstance(shape, Circle):
        r = ev(shape.r)
        if r <= 0:
            raise ValueError(f"Circle {shape.name!r}: radius must be positive")
        return occ.addDisk(ev(shape.cx), ev(shape.cy), 0, r, r)
    if isinstance(shape, Polygon):
        pts = [occ.addPoint(ev(x), ev(y), 0) for x, y in shape.points]
        lines = [occ.addLine(pts[i], pts[(i + 1) % len(pts)]) for i in range(len(pts))]
        return occ.addPlaneSurface([occ.addCurveLoop(lines)])
    raise TypeError(shape)


def _meshed_curves() -> list[int]:
    """Curves on the boundary of at least one remaining surface."""
    return [c for _, c in gmsh.model.getEntities(1) if len(gmsh.model.getAdjacencies(1, c)[0]) > 0]


def _classify_curves(owner, names, hole_curves) -> dict[str, list[int]]:
    """outer / hole name / 'a|b' interface for every meshed curve (a partition)."""
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


def _inside(bbox, box) -> bool:
    xmin, ymin, _, xmax, ymax, _ = bbox
    t = _BOX_TOLERANCE
    return xmin >= box[0] - t and ymin >= box[1] - t and xmax <= box[2] + t and ymax <= box[3] + t


def _apply_sizes(geometry: Geometry2D, ev, domain_surfaces, boundary_curves) -> None:
    settings = geometry.mesh
    size = ev(settings.size)
    if size <= 0:
        raise ValueError("mesh.size must be positive")
    gmsh.option.setNumber("Mesh.MeshSizeMax", size)
    # Sizes come only from these settings: OpenCASCADE's default point sizes
    # (from the model extent) would silently override them
    gmsh.option.setNumber("Mesh.MeshSizeFromPoints", 0)
    gmsh.option.setNumber("Mesh.MeshSizeFromCurvature", settings.elements_per_circle)
    fields = []
    field = gmsh.model.mesh.field
    for name, expr in settings.domain_sizes.items():
        f = field.add("Constant")
        field.setNumbers(f, "SurfacesList", domain_surfaces.get(name, []))
        field.setNumber(f, "VIn", ev(expr))
        field.setNumber(f, "VOut", size)
        fields.append(f)
    for name, expr in settings.boundary_sizes.items():
        if name not in boundary_curves:
            raise ValueError(f"mesh.boundary_sizes: {name!r} is not a boundary")
        h = ev(expr)
        dist = field.add("Distance")
        field.setNumbers(dist, "CurvesList", boundary_curves[name])
        field.setNumber(dist, "Sampling", 200)
        f = field.add("Threshold")  # h on the boundary, growing to size over 4·size
        field.setNumber(f, "InField", dist)
        field.setNumber(f, "SizeMin", h)
        field.setNumber(f, "SizeMax", size)
        field.setNumber(f, "DistMin", 0.0)
        field.setNumber(f, "DistMax", 4 * size)
        fields.append(f)
    if fields:
        m = field.add("Min")
        field.setNumbers(m, "FieldsList", fields)
        field.setAsBackgroundMesh(m)


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
