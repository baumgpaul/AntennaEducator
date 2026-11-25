"""Element types (triangles, quadrilaterals, order 2), quality measures, boundary layers."""

import math
import xml.etree.ElementTree as ET
from collections import Counter

import numpy as np
import pytest
from fem_mesher import Geometry, Mesh, mesh_geometry
from pydantic import ValidationError


def run(steps, mesh, **kw):
    return mesh_geometry(Geometry.model_validate({"steps": steps, "mesh": mesh, **kw}))


def rect(name, x, y, w, h):
    return {"kind": "rectangle", "name": name, "x": x, "y": y, "width": w, "height": h}


DISK = {"kind": "circle", "name": "disk", "cx": 0, "cy": 0, "r": 1}


def all_edges(m: Mesh):
    edges = Counter()
    for t in m.triangles[:, :3]:
        edges.update(tuple(sorted((t[i], t[(i + 1) % 3]))) for i in range(3))
    for q in m.quads[:, :4]:
        edges.update(tuple(sorted((q[i], q[(i + 1) % 4]))) for i in range(4))
    return edges


# ── Quality measures (analytic) ───────────────────────────────────────────────


def single(nodes, triangles=(), quads=()):
    return Mesh(
        nodes=np.array(nodes, dtype=float),
        triangles=np.array(triangles, dtype=np.int64).reshape(-1, 3),
        triangle_domain=np.zeros(len(triangles), dtype=np.int64),
        domain_names=["d"],
        edges=np.zeros((0, 2), dtype=np.int64),
        quads=np.array(quads, dtype=np.int64).reshape(-1, 4),
        quad_domain=np.zeros(len(quads), dtype=np.int64),
    )


def test_quality_measures_of_ideal_and_known_elements():
    h = math.sqrt(3) / 2
    m = single([[0, 0], [1, 0], [0.5, h], [0, 1]], triangles=[[0, 1, 2], [0, 1, 3]])
    smallest, largest = m.angles()
    np.testing.assert_allclose(m.quality(), [1, 4 * math.sqrt(3) * 0.5 / 4], rtol=1e-12)
    np.testing.assert_allclose(smallest, [60, 45], rtol=1e-12)
    np.testing.assert_allclose(largest, [60, 90], rtol=1e-12)
    # right isosceles: R / 2r = (√2/2) / (2 − √2)
    np.testing.assert_allclose(
        m.aspect_ratio(), [1, (math.sqrt(2) / 2) / (2 - math.sqrt(2))], rtol=1e-12
    )


def test_quad_measures():
    s = math.sqrt(3) / 2
    m = single(
        [[0, 0], [2, 0], [2, 1], [0, 1], [3, 0], [4, 0], [4.5, s], [3.5, s]],
        quads=[[0, 1, 2, 3], [4, 5, 6, 7]],
    )
    np.testing.assert_allclose(m.quality(), [1, s], rtol=1e-12)  # rectangle; 60° rhombus
    np.testing.assert_allclose(m.angles()[0], [90, 60], rtol=1e-12)
    np.testing.assert_allclose(m.aspect_ratio(), [2, 1], rtol=1e-12)
    np.testing.assert_allclose(m.quad_areas(), [2, s], rtol=1e-12)


# ── Quadrilaterals ────────────────────────────────────────────────────────────


def test_quad_mesh_is_conforming_counter_clockwise_and_area_exact():
    m = run([rect("box", 0, 0, 2, 1)], {"size": 0.1, "element": "quad"}).mesh
    assert m.n_quads > 0.9 * m.n_elements
    assert (m.quad_areas() > 0).all() and (m.areas() > 0).all()
    assert m.domain_area("box") == pytest.approx(2)
    counts = Counter(all_edges(m).values())
    assert set(counts) == {1, 2}  # every edge in one (boundary) or two elements
    assert m.quality().min() > 0.3


def test_quad_mesh_of_a_disk():
    m = run([DISK], {"size": 0.15, "element": "quad", "elements_per_circle": 64}).mesh
    assert m.n_quads > 0 and m.n_triangles < 0.1 * m.n_elements
    assert m.domain_area("disk") == pytest.approx(math.pi, rel=1e-2)


def test_structured_quads_are_a_grid_of_equal_rectangles():
    controls = [{"target": "r", "structured": True}]
    m = run([rect("r", 0, 0, 2, 1)], {"size": 0.25, "element": "quad", "controls": controls}).mesh
    assert m.n_triangles == 0
    np.testing.assert_allclose(m.quality(), 1, rtol=1e-9)
    np.testing.assert_allclose(m.quad_areas(), m.quad_areas()[0], rtol=1e-9)
    assert m.stats()["quads"] == m.n_quads


def test_second_order_quads_have_their_edge_midpoints():
    m = run([rect("r", 0, 0, 1, 1)], {"size": 0.3, "element": "quad", "order": 2}).mesh
    assert m.quads.shape[1] == 8
    p = m.nodes[m.quads]
    for i in range(4):  # straight edges: midpoint = mean of the corners
        np.testing.assert_allclose(p[:, 4 + i], (p[:, i] + p[:, (i + 1) % 4]) / 2, atol=1e-12)


def test_quad_mesh_files(tmp_path):
    r = run([rect("r", 0, 0, 1, 1)], {"size": 0.2, "element": "quad"})
    r.mesh.write_vtu(tmp_path / "m.vtu")
    piece = ET.parse(tmp_path / "m.vtu").getroot().find(".//Piece")
    assert int(piece.get("NumberOfCells")) == r.mesh.n_elements
    types = piece.find(".//DataArray[@Name='types']").text.split()
    assert types.count("9") == r.mesh.n_quads
    mesh_geometry(
        Geometry.model_validate(
            {"steps": [rect("r", 0, 0, 1, 1)], "mesh": {"size": 0.2, "element": "quad"}}
        ),
        msh_path=tmp_path / "m.msh",
    )
    text = (tmp_path / "m.msh").read_text()
    elements = text.split("$Elements\n")[1].split("\n")[1:-2]
    assert any(line.split()[1] == "3" for line in elements)  # 4-node quadrangles


def test_stats_have_the_measures():
    st = run([DISK], {"size": 0.2}).mesh.stats()
    assert st["quads"] == 0 and st["elements"] == st["triangles"]
    assert 20 < st["angles"]["min"] < 60 < st["angles"]["max"] < 140
    assert 1 <= st["aspect"]["mean"] <= st["aspect"]["max"] < 3


# ── Boundary layers ───────────────────────────────────────────────────────────

BOTTOM = {"kind": "box", "name": "bottom", "xmin": 0, "ymin": 0, "xmax": 1, "ymax": 0}


def layer_rows(m: Mesh, ymax=0.05):
    """Heights of the node rows above the bottom, away from the corners (refined too)."""
    x, y = m.nodes[:, 0], m.nodes[:, 1]
    middle = (x > 0.3) & (x < 0.7)
    return sorted({round(v, 9) for v in y[middle & (y > 1e-12) & (y < ymax)]})


def test_boundary_layer_rows_grow_geometrically():
    control = {"target": "bottom", "boundary_layer": {"first": 0.002, "growth": 1.5, "layers": 4}}
    m = run(
        [rect("box", 0, 0, 1, 1)], {"size": 0.1, "controls": [control]}, selections=[BOTTOM]
    ).mesh
    expected = np.cumsum([0.002 * 1.5**k for k in range(4)])
    np.testing.assert_allclose(layer_rows(m)[:4], expected, rtol=1e-6)
    assert m.n_quads == 0  # layers of triangles: the P1 solver can use them
    assert (m.areas() > 0).all()
    # the corners where the layer meets the side walls are refined as well
    corner = np.hypot(m.nodes[:, 0], m.nodes[:, 1]) < 2 * expected[-1]  # twice the thickness
    assert corner.sum() > 10


def test_boundary_layer_of_quads_in_a_quad_mesh():
    control = {"target": "bottom", "boundary_layer": {"first": 0.005, "growth": 1.2, "layers": 3}}
    mesh = {"size": 0.1, "element": "quad", "controls": [control]}
    m = run([rect("box", 0, 0, 1, 1)], mesh, selections=[BOTTOM]).mesh
    assert layer_rows(m)[0] == pytest.approx(0.005)
    assert m.n_quads > 0


@pytest.mark.parametrize(
    "layer, message",
    [({"first": 0.2, "layers": 3}, "thinner"), ({"first": 0.01, "growth": 20}, "growth")],
)
def test_boundary_layer_settings_are_checked(layer, message):
    control = {"target": "bottom", "boundary_layer": layer}
    with pytest.raises(ValueError, match=message):
        run([rect("box", 0, 0, 1, 1)], {"size": 0.1, "controls": [control]}, selections=[BOTTOM])


def test_boundary_layer_needs_a_boundary_not_a_domain():
    control = {"target": "box", "boundary_layer": {"first": 0.01}}
    with pytest.raises(ValidationError, match="boundary layers"):
        Geometry.model_validate(
            {"steps": [rect("box", 0, 0, 1, 1)], "mesh": {"size": 0.1, "controls": [control]}}
        )
