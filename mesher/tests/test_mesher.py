"""fem_mesher: geometry → conforming mesh with named domains and boundaries."""

import json
import math
import xml.etree.ElementTree as ET
from collections import Counter

import numpy as np
import pytest
from fem_mesher import (
    ExpressionError,
    Geometry2D,
    evaluate,
    evaluate_field,
    evaluate_parameters,
    mesh_geometry,
)
from fem_mesher.__main__ import main
from pydantic import ValidationError


def geo(shapes, mesh=None, **kw):
    return Geometry2D.model_validate({"shapes": shapes, "mesh": mesh or {"size": 0.1}, **kw})


def rect(name, x, y, w, h):
    return {"kind": "rectangle", "name": name, "x": x, "y": y, "width": w, "height": h}


def circle(name, cx, cy, r):
    return {"kind": "circle", "name": name, "cx": cx, "cy": cy, "r": r}


def edge_set(mesh, rows):
    return {tuple(sorted(e[:2])) for e in mesh.edges[rows]}


def topological_boundary(mesh):
    """Edges belonging to exactly one triangle: the boundary of the meshed region."""
    count = Counter(
        tuple(sorted((t[i], t[(i + 1) % 3]))) for t in mesh.triangles[:, :3] for i in range(3)
    )
    return {e for e, n in count.items() if n == 1}


# ── Expressions ───────────────────────────────────────────────────────────────


def test_expressions():
    p = evaluate_parameters({"d": 0.01, "gap": "2*d", "r": "sqrt(gap**2 + d**2)"})
    assert p["gap"] == pytest.approx(0.02)
    assert p["r"] == pytest.approx(math.sqrt(5) * 0.01)
    assert evaluate("pi*r**2", p) == pytest.approx(math.pi * p["r"] ** 2)
    assert evaluate(-1.5, {}) == -1.5


@pytest.mark.parametrize(
    "expr",
    ["unknown + 1", "__import__('os')", "d.real", "(lambda: 1)()", "open('x')", "1 if d else 2"],
)
def test_expressions_reject_anything_but_arithmetic(expr):
    with pytest.raises(ExpressionError):
        evaluate(expr, {"d": 1.0})


def test_field_expressions_over_points():
    x, y = np.array([0.0, 1.0, 2.0]), np.array([0.0, 0.5, 1.0])
    np.testing.assert_allclose(
        evaluate_field("E0*x + sqrt(y)", {"E0": 2.0}, x, y), 2 * x + np.sqrt(y)
    )
    np.testing.assert_allclose(evaluate_field(3, {}, x, y), [3, 3, 3])
    np.testing.assert_allclose(evaluate_field("max(x, 1)", {}, x, y), [1, 1, 2])
    with pytest.raises(ExpressionError):
        evaluate_field("z", {}, x, y)


def test_parameters_only_see_earlier_ones():
    with pytest.raises(ExpressionError):
        evaluate_parameters({"a": "b", "b": 1})


# ── Basic shapes ──────────────────────────────────────────────────────────────


def test_rectangle_area_orientation_and_quality():
    m = mesh_geometry(geo([rect("plate", 0, 0, 2.0, 1.0)])).mesh
    assert m.domain_names == ["plate"]
    assert m.domain_area("plate") == pytest.approx(2.0, rel=1e-12)
    assert (m.areas() > 0).all()  # counter-clockwise
    assert m.quality().min() > 0.5
    assert set(m.boundaries) == {"outer"}
    assert m.boundary_length("outer") == pytest.approx(6.0, rel=1e-12)
    assert edge_set(m, m.boundaries["outer"]) == topological_boundary(m)


def test_circle_converges_to_its_area():
    errors = []
    for per_circle in (8, 16, 64):
        g = geo([circle("disk", 0, 0, 1.0)], {"size": 1.0, "elements_per_circle": per_circle})
        m = mesh_geometry(g).mesh
        errors.append(abs(m.domain_area("disk") - math.pi))
    assert errors[0] > errors[1] > errors[2]
    assert errors[2] / math.pi < 0.002  # polygon with ≥64 sides


def test_polygon():
    tri = {"kind": "polygon", "name": "tri", "points": [[0, 0], [1, 0], [0, "h"]]}
    m = mesh_geometry(geo([tri], parameters={"h": 2.0})).mesh
    assert m.domain_area("tri") == pytest.approx(1.0, rel=1e-12)


# ── Overlaps, holes, interfaces ───────────────────────────────────────────────


def test_later_shape_wins_where_shapes_overlap():
    m = mesh_geometry(geo([rect("a", 0, 0, 2, 1), rect("b", 1, 0, 2, 1)])).mesh
    assert m.domain_area("a") == pytest.approx(1.0)
    assert m.domain_area("b") == pytest.approx(2.0)
    assert m.boundary_length("a|b") == pytest.approx(1.0)


def test_interfaces_are_conforming():
    """Both domains share the interface nodes: no hanging nodes."""
    m = mesh_geometry(geo([rect("a", 0, 0, 1, 1), circle("b", 0.5, 0.5, 0.3)])).mesh
    a, b = (m.domain_names.index(n) for n in ("a", "b"))

    def edges_of(domain):
        t = m.triangles[m.triangle_domain == domain][:, :3]
        return {tuple(sorted((r[i], r[(i + 1) % 3]))) for r in t for i in range(3)}

    interface = edge_set(m, m.boundaries["a|b"])
    assert interface and interface <= edges_of(a) and interface <= edges_of(b)


def test_holes_are_cut_out_and_named():
    g = geo(
        [rect("air", -1, -1, 2, 2), circle("wire", 0, 0, 0.2)],
        {"size": 0.1, "elements_per_circle": 64},
        holes=["wire"],
    )
    m = mesh_geometry(g).mesh
    assert m.domain_names == ["air"]
    assert m.domain_area("air") == pytest.approx(4 - math.pi * 0.04, rel=1e-3)
    assert m.boundary_length("wire") == pytest.approx(2 * math.pi * 0.2, rel=1e-3)
    assert m.boundary_length("outer") == pytest.approx(8.0)


def test_automatic_boundaries_partition_the_boundary():
    """outer + hole boundaries = the region's boundary; interfaces lie inside."""
    g = geo(
        [rect("air", 0, 0, 3, 2), rect("diel", 1, 0.5, 1, 1), rect("electrode", 1, 1.5, 1, 0.1)],
        holes=["electrode"],
    )
    m = mesh_geometry(g).mesh
    names = set(m.boundaries)
    assert names == {"outer", "electrode", "air|diel"}
    sets = {n: edge_set(m, ix) for n, ix in m.boundaries.items()}
    assert not (sets["outer"] & sets["electrode"])
    assert sets["outer"] | sets["electrode"] == topological_boundary(m)
    assert not (sets["air|diel"] & topological_boundary(m))
    # the electrode touches the dielectric on its bottom side and air elsewhere
    assert m.boundary_length("electrode") == pytest.approx(2 * (1 + 0.1))


def test_box_selection_names_boundaries():
    g = geo(
        [rect("plate", 0, 0, 2, 1)],
        selections=[
            {"name": "left", "xmin": -0.01, "ymin": -0.01, "xmax": 0.01, "ymax": 1.01},
            {"name": "nothing", "xmin": 5, "ymin": 5, "xmax": 6, "ymax": 6},
        ],
    )
    r = mesh_geometry(g)
    assert r.mesh.boundary_length("left") == pytest.approx(1.0)
    assert r.mesh.boundary_length("outer") == pytest.approx(6.0)  # selections may overlap
    assert any("nothing" in w for w in r.warnings)


def test_box_drawn_exactly_on_an_edge_selects_it():
    """The UI selects an edge with a zero-width box; OCC's padded bounding boxes miss it."""
    g = geo(
        [rect("plate", 0, 0, 0.1, 0.01), circle("hole", 0.05, 0.005, 0.002)],
        holes=["hole"],
        selections=[
            {"name": "top", "xmin": 0, "ymin": 0.01, "xmax": 0.1, "ymax": 0.01},
            {"name": "ring", "xmin": 0.048, "ymin": 0.003, "xmax": 0.052, "ymax": 0.007},
        ],
    )
    m = mesh_geometry(g).mesh
    assert m.boundary_length("top") == pytest.approx(0.1)
    assert edge_set(m, m.boundaries["ring"]) == edge_set(m, m.boundaries["hole"])


def test_fully_covered_domain_warns():
    r = mesh_geometry(geo([rect("small", 0.2, 0.2, 0.2, 0.2), rect("big", 0, 0, 1, 1)]))
    assert r.mesh.domain_names == ["big"]
    assert any("small" in w for w in r.warnings)


# ── Mesh size control ─────────────────────────────────────────────────────────


def _max_edge(m, domain=None):
    t = m.triangles[:, :3] if domain is None else m.triangles[m.triangle_domain == domain][:, :3]
    p = m.nodes[t]
    return max(np.linalg.norm(p[:, i] - p[:, (i + 1) % 3], axis=1).max() for i in range(3))


def test_global_size_bounds_the_elements():
    m = mesh_geometry(geo([rect("plate", 0, 0, 1, 1)], {"size": 0.05})).mesh
    assert _max_edge(m) <= 0.05 * 1.5


def test_domain_size_refines_only_that_domain():
    shapes = [rect("coarse", 0, 0, 1, 1), rect("fine", 1, 0, 1, 1)]
    m = mesh_geometry(geo(shapes, {"size": 0.2, "domain_sizes": {"fine": 0.04}})).mesh
    fine, coarse = m.domain_names.index("fine"), m.domain_names.index("coarse")
    assert _max_edge(m, fine) <= 0.04 * 1.5
    assert (m.triangle_domain == fine).sum() > 5 * (m.triangle_domain == coarse).sum()


def test_boundary_size_refines_along_the_boundary():
    g = geo([rect("plate", 0, 0, 1, 1)], {"size": 0.2, "boundary_sizes": {"outer": 0.02}})
    m = mesh_geometry(g).mesh
    assert len(m.boundaries["outer"]) >= 4 / 0.02 * 0.9


def test_unknown_boundary_size_is_an_error():
    with pytest.raises(ValueError, match="not a boundary"):
        mesh_geometry(
            geo([rect("plate", 0, 0, 1, 1)], {"size": 0.2, "boundary_sizes": {"top": 0.01}})
        )


# ── Second order ──────────────────────────────────────────────────────────────


def test_second_order_elements_have_edge_midpoints():
    m = mesh_geometry(geo([rect("plate", 0, 0, 1, 1)], {"size": 0.25, "order": 2})).mesh
    assert m.triangles.shape[1] == 6 and m.edges.shape[1] == 3
    p = m.nodes[m.triangles]
    for corner_a, corner_b, mid in ((0, 1, 3), (1, 2, 4), (2, 0, 5)):
        np.testing.assert_allclose(p[:, mid], (p[:, corner_a] + p[:, corner_b]) / 2, atol=1e-12)
    assert (m.areas() > 0).all()


# ── Validation ────────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "shapes, extra",
    [
        ([rect("a", 0, 0, 1, 1), rect("a", 1, 0, 1, 1)], {}),  # duplicate name
        ([rect("a|b", 0, 0, 1, 1)], {}),  # reserved character
        ([rect("outer", 0, 0, 1, 1)], {}),  # reserved name
        ([rect("a", 0, 0, 1, 1)], {"holes": ["b"]}),  # unknown hole
        ([rect("a", 0, 0, 1, 1)], {"holes": ["a"]}),  # nothing left to mesh
        ([rect("a", 0, 0, 1, 1)], {"mesh": {"size": 0.1, "domain_sizes": {"x": 0.1}}}),
    ],
)
def test_invalid_geometry_is_rejected(shapes, extra):
    with pytest.raises(ValidationError):
        Geometry2D.model_validate({"shapes": shapes, "mesh": {"size": 0.1}, **extra})


@pytest.mark.parametrize("shape", [rect("a", 0, 0, 0, 1), circle("c", 0, 0, -1)])
def test_degenerate_shapes_are_rejected(shape):
    with pytest.raises(ValueError, match="positive"):
        mesh_geometry(geo([shape]))


# ── Output ────────────────────────────────────────────────────────────────────


def test_msh_has_physical_names_for_opencfs(tmp_path):
    g = geo([rect("air", 0, 0, 2, 1), rect("electrode", 0.5, 0.4, 1, 0.2)], holes=["electrode"])
    path = tmp_path / "m.msh"
    mesh_geometry(g, msh_path=path)
    text = path.read_text()
    assert text.startswith("$MeshFormat\n2.2 0 8")  # the version openCFS reads
    assert '2 1 "air"' in text and '"electrode"' in text and '"outer"' in text


def test_vtu_is_valid(tmp_path):
    m = mesh_geometry(geo([rect("plate", 0, 0, 1, 1)])).mesh
    path = tmp_path / "m.vtu"
    m.write_vtu(path)
    piece = ET.parse(path).getroot().find("UnstructuredGrid/Piece")
    assert int(piece.get("NumberOfPoints")) == m.n_nodes
    assert int(piece.get("NumberOfCells")) == m.n_triangles


def test_meshing_is_deterministic():
    g = geo([rect("a", 0, 0, 1, 1), circle("b", 0.5, 0.5, 0.2)])
    a, b = mesh_geometry(g).mesh, mesh_geometry(g).mesh
    np.testing.assert_array_equal(a.triangles, b.triangles)
    np.testing.assert_allclose(a.nodes, b.nodes)


def test_cli(tmp_path, capsys):
    path = tmp_path / "g.json"
    path.write_text(json.dumps({"shapes": [rect("plate", 0, 0, 1, 1)], "mesh": {"size": 0.2}}))
    assert (
        main([str(path), "--msh", str(tmp_path / "m.msh"), "--vtu", str(tmp_path / "m.vtu")]) == 0
    )
    stats = json.loads(capsys.readouterr().out)
    assert stats["domains"]["plate"] == stats["triangles"]
    assert (tmp_path / "m.msh").exists() and (tmp_path / "m.vtu").exists()
