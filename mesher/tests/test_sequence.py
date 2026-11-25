"""Geometry version 2: the modelling sequence, curves and points, selections, mesh controls."""

import math
from collections import Counter

import numpy as np
import pytest
from fem_mesher import Geometry, mesh_geometry
from pydantic import ValidationError

FINE = {"size": 0.05, "elements_per_circle": 200}


def geo(steps, mesh=None, **kw) -> Geometry:
    return Geometry.model_validate({"steps": steps, "mesh": mesh or {"size": 0.1}, **kw})


def run(steps, mesh=None, **kw):
    return mesh_geometry(geo(steps, mesh, **kw))


def rect(name, x, y, w, h, **kw):
    return {"kind": "rectangle", "name": name, "x": x, "y": y, "width": w, "height": h, **kw}


def disk(name, cx, cy, r):
    return {"kind": "circle", "name": name, "cx": cx, "cy": cy, "r": r}


def polyline(name, *points, **kw):
    return {"kind": "polyline", "name": name, "points": [list(p) for p in points], **kw}


def total_area(mesh):
    return float(mesh.areas().sum())


def extent(mesh):
    return (*mesh.nodes.min(axis=0), *mesh.nodes.max(axis=0))


def edge_lengths(mesh, name):
    e = mesh.edges[mesh.boundaries[name]]
    return np.linalg.norm(mesh.nodes[e[:, 1]] - mesh.nodes[e[:, 0]], axis=1)


def triangle_edges(mesh):
    return {tuple(sorted((t[i], t[(i + 1) % 3]))) for t in mesh.triangles[:, :3] for i in range(3)}


def topological_boundary(mesh):
    count = Counter(
        tuple(sorted((t[i], t[(i + 1) % 3]))) for t in mesh.triangles[:, :3] for i in range(3)
    )
    return {e for e, n in count.items() if n == 1}


# ── Version 1 compatibility ───────────────────────────────────────────────────


def test_version_1_models_mesh_exactly_as_their_version_2_form():
    v1 = {
        "parameters": {"w": 0.04, "d": 0.004},
        "shapes": [rect("air", "-w", "-w", "2*w", "2*w"), rect("top", "-w/2", "d/2", "w", "d")],
        "holes": ["top"],
        "selections": [{"name": "left", "xmin": "-w", "ymin": "-w", "xmax": "-w", "ymax": "w"}],
        "mesh": {"size": "w/8", "domain_sizes": {"air": "w/10"}, "boundary_sizes": {"top": "d/4"}},
    }
    v2 = {
        "version": 2,
        "parameters": v1["parameters"],
        "steps": v1["shapes"],
        "holes": ["top"],
        "selections": [{"kind": "box", **v1["selections"][0]}],
        "mesh": {
            "size": "w/8",
            "controls": [{"target": "air", "size": "w/10"}, {"target": "top", "size": "d/4"}],
        },
    }
    a = mesh_geometry(Geometry.model_validate(v1)).mesh
    b = mesh_geometry(Geometry.model_validate(v2)).mesh
    np.testing.assert_array_equal(a.nodes, b.nodes)
    np.testing.assert_array_equal(a.triangles, b.triangles)
    assert a.boundaries.keys() == b.boundaries.keys()


def test_the_json_form_round_trips():
    g = geo(
        [rect("a", 0, 0, 1, 1), {"kind": "move", "name": "m", "objects": ["a"], "dx": 1}],
        selections=[{"kind": "points", "name": "p", "points": [[1.5, 0]]}],
    )
    assert Geometry.model_validate(g.model_dump(mode="json")) == g


# ── Primitives ────────────────────────────────────────────────────────────────


def test_rotated_rounded_rectangle():
    m = run([rect("r", 0, 0, 2, 1, rotation=90, corner_radius=0.2)], FINE).mesh
    assert total_area(m) == pytest.approx(2 - (4 - math.pi) * 0.04, rel=1e-3)
    xmin, ymin, xmax, ymax = extent(m)  # rotated about its corner (0, 0)
    assert (xmin, ymin, xmax, ymax) == pytest.approx((-1, 0, 0, 2), abs=1e-9)


@pytest.mark.parametrize("rx, ry", [(2, 1), (1, 2)])
def test_ellipse_either_axis_longer(rx, ry):
    shape = {"kind": "ellipse", "name": "e", "cx": 0, "cy": 0, "rx": rx, "ry": ry}
    m = run([shape], FINE).mesh
    assert total_area(m) == pytest.approx(math.pi * rx * ry, rel=1e-3)
    xmin, ymin, xmax, ymax = extent(m)  # nodes sample the curve: the tips are close
    assert (xmax, ymax) == pytest.approx((rx, ry), rel=1e-3)


@pytest.mark.parametrize(
    "start, end, r_inner, area",
    [
        (0, 90, 0, math.pi / 4),
        (30, 300, 0, 0.75 * math.pi),  # more than half a circle
        (0, 180, 0.5, 0.5 * math.pi * 0.75),
        (0, 360, 0.5, math.pi * 0.75),  # full ring
        (0, 360, 0, math.pi),
    ],
)
def test_sectors_and_rings(start, end, r_inner, area):
    shape = {"kind": "sector", "name": "s", "cx": 0, "cy": 0, "r": 1}
    shape.update(start=start, end=end, r_inner=r_inner)
    assert total_area(run([shape], FINE).mesh) == pytest.approx(area, rel=1e-3)


def test_surface_from_curves_drawn_in_any_order_and_direction():
    steps = [
        polyline("l1", (1, 0), (1, 1)),
        polyline("l2", (0, 0), (1, 0)),
        {"kind": "arc", "name": "a", "cx": 0.5, "cy": 1, "r": 0.5, "start": 0, "end": 180},
        polyline("l3", (0, 1), (0, 0)),
        {"kind": "surface", "name": "arch", "curves": ["l1", "a", "l2", "l3"]},
    ]
    m = run(steps, FINE).mesh
    assert m.domain_names == ["arch"]
    assert total_area(m) == pytest.approx(1 + math.pi / 8, rel=1e-3)


def test_spline_bounded_surface():
    steps = [
        {"kind": "spline", "name": "s", "points": [[0, 0], [0.5, 0.3], [1, 0]]},
        polyline("base", (0, 0), (1, 0)),
        {"kind": "surface", "name": "lens", "curves": ["s", "base"]},
    ]
    m = run(steps, {"size": 0.02}).mesh
    assert 0.15 < total_area(m) < 0.25  # a smooth bump of height 0.3 over 1


# ── Booleans ──────────────────────────────────────────────────────────────────


def test_union_is_one_domain_without_inner_edges():
    steps = [rect("a", 0, 0, 1, 1), rect("b", 0.5, 0.5, 1, 1)]
    m = run([*steps, {"kind": "union", "name": "u", "objects": ["a", "b"]}]).mesh
    assert m.domain_names == ["u"]
    assert total_area(m) == pytest.approx(1.75)
    assert sorted(m.boundaries) == ["outer"]
    assert m.boundary_length("outer") == pytest.approx(6)


def test_difference_cuts_the_tools_out():
    steps = [rect("box", 0, 0, 1, 1), disk("c", 0.5, 0.5, 0.25)]
    diff = {"kind": "difference", "name": "d", "objects": ["box"], "tools": ["c"]}
    m = run([*steps, diff], FINE).mesh
    assert m.domain_names == ["d"]
    assert total_area(m) == pytest.approx(1 - math.pi / 16, rel=1e-3)
    assert m.boundary_length("outer") == pytest.approx(4 + math.pi / 2, rel=1e-3)


def test_intersection_of_three_objects():
    steps = [rect("a", 0, 0, 2, 2), rect("b", 1, 0, 2, 2), rect("c", 0, 1, 3, 2)]
    inter = {"kind": "intersection", "name": "i", "objects": ["a", "b", "c"]}
    m = run([*steps, inter]).mesh
    assert m.domain_names == ["i"]
    assert extent(m) == pytest.approx((1, 1, 2, 2))


def test_keep_leaves_the_inputs_and_the_result_wins():
    steps = [rect("a", 0, 0, 2, 1), rect("b", 1, 0, 2, 1)]
    inter = {"kind": "intersection", "name": "i", "objects": ["a", "b"], "keep": True}
    m = run([*steps, inter]).mesh
    assert set(m.domain_names) == {"a", "b", "i"}
    assert [m.domain_area(n) for n in ("a", "b", "i")] == pytest.approx([1, 1, 1])
    assert {"a|i", "b|i"} <= set(m.boundaries)


def test_empty_boolean_result_is_an_error():
    steps = [rect("a", 0, 0, 1, 1), rect("b", 2, 0, 1, 1)]
    with pytest.raises(ValueError, match="'i'.*empty"):
        run([*steps, {"kind": "intersection", "name": "i", "objects": ["a", "b"]}])


# ── Transforms and arrays ─────────────────────────────────────────────────────


def test_transforms_in_place_keep_the_name():
    steps = [
        rect("r", 1, 0, 1, 1),
        {"kind": "rotate", "name": "rot", "objects": ["r"], "angle": 90},
        {"kind": "move", "name": "mv", "objects": ["r"], "dx": 10, "dy": 0},
        {"kind": "scale", "name": "sc", "objects": ["r"], "cx": 10, "factor": 2},
    ]
    m = run(steps).mesh
    assert m.domain_names == ["r"]
    # rotated about the origin to [-1,0]×[1,2], moved by 10, scaled ×2 about (10, 0)
    assert extent(m) == pytest.approx((8, 2, 10, 4))


def test_anisotropic_scale_turns_a_circle_into_an_ellipse():
    scale = {"kind": "scale", "name": "s", "objects": ["c"], "factor": 2, "factor_y": 0.5}
    assert total_area(run([disk("c", 0, 0, 1), scale], FINE).mesh) == pytest.approx(
        math.pi, rel=1e-3
    )


def test_mirror_with_keep_adds_a_copy():
    tri = {"kind": "polygon", "name": "t", "points": [[1, 0], [2, 0], [1, 1]]}
    mirror = {"kind": "mirror", "name": "t2", "objects": ["t"], "x": 0, "angle": 90, "keep": True}
    m = run([tri, mirror]).mesh
    assert set(m.domain_names) == {"t", "t2"}
    t2 = m.triangles[m.triangle_domain == m.domain_names.index("t2")]
    assert m.nodes[t2.ravel(), 0].max() == pytest.approx(-1)


def test_linear_array_is_one_object():
    array = {"kind": "array", "name": "fingers", "objects": ["f"], "count": 4, "dx": 0.3}
    m = run([rect("f", 0, 0, 0.1, 1), array], {"size": 0.05}).mesh
    assert m.domain_names == ["fingers"]
    assert total_area(m) == pytest.approx(0.4)
    assert extent(m)[2] == pytest.approx(0.9 + 0.1)


def test_polar_array_places_rotated_copies():
    array = {"kind": "polar_array", "name": "ring", "objects": ["c"], "count": 6, "angle": 60}
    m = run([disk("c", 1, 0, 0.1), array], {"size": 0.05, "elements_per_circle": 64}).mesh
    assert total_area(m) == pytest.approx(6 * math.pi * 0.01, rel=1e-2)
    for k in range(6):  # each copy's centre is surrounded by mesh
        a = math.radians(60 * k)
        d = np.hypot(m.nodes[:, 0] - math.cos(a), m.nodes[:, 1] - math.sin(a))
        assert d.min() < 0.1


# ── Curves and points ─────────────────────────────────────────────────────────


def test_curve_inside_a_domain_is_a_named_conforming_line():
    steps = [rect("box", 0, 0, 1, 1), polyline("wire", (0.2, 0.5), (0.5, 0.5), (0.5, 0.8))]
    m = run(steps).mesh
    assert m.domain_names == ["box"]
    assert m.boundary_length("wire") == pytest.approx(0.6)
    wire = {tuple(sorted(e)) for e in m.edges[m.boundaries["wire"]][:, :2]}
    assert wire <= triangle_edges(m)  # the triangles follow the wire
    assert not wire & topological_boundary(m)  # it is inside, not a boundary


def test_curve_across_a_domain_splits_it_but_keeps_one_name():
    m = run([rect("box", 0, 0, 1, 1), polyline("cut", (0, 0.5), (1, 0.5))]).mesh
    assert m.domain_names == ["box"] and total_area(m) == pytest.approx(1)
    assert m.boundary_length("cut") == pytest.approx(1)
    assert m.boundary_length("outer") == pytest.approx(4)


def test_curve_on_an_edge_names_that_edge():
    m = run([rect("box", 0, 0, 1, 1), polyline("bottom", (0, 0), (1, 0))]).mesh
    assert m.boundary_length("bottom") == pytest.approx(1)
    assert m.boundary_length("outer") == pytest.approx(4)  # names may overlap


def test_curve_partly_outside_is_clipped_with_a_warning():
    r = run([rect("box", 0, 0, 1, 1), polyline("w", (0.5, 0.5), (2, 0.5))])
    assert r.mesh.boundary_length("w") == pytest.approx(0.5)
    assert any("'w'" in w and "outside" in w for w in r.warnings)


def test_point_becomes_a_node_and_can_refine_the_mesh():
    point = {"kind": "point", "name": "p", "x": 0.3, "y": 0.4}
    coarse = run([rect("box", 0, 0, 1, 1), point]).mesh
    assert np.hypot(coarse.nodes[:, 0] - 0.3, coarse.nodes[:, 1] - 0.4).min() < 1e-12
    fine = run(
        [rect("box", 0, 0, 1, 1), point],
        {"size": 0.1, "controls": [{"target": "p", "size": 0.005}]},
    ).mesh
    assert fine.n_triangles > 2 * coarse.n_triangles
    near = np.hypot(fine.nodes[:, 0] - 0.3, fine.nodes[:, 1] - 0.4) < 0.02
    assert near.sum() > 10


def test_point_outside_warns():
    r = run([rect("box", 0, 0, 1, 1), {"kind": "point", "name": "p", "x": 3, "y": 3}])
    assert any("'p'" in w for w in r.warnings)


# ── Selections ────────────────────────────────────────────────────────────────


def test_point_selection_picks_the_nearest_boundary():
    sel = {"kind": "points", "name": "s", "points": [[1, 0.001], [2.001, 0.5]]}
    m = run([rect("r", 0, 0, 2, 1)], selections=[sel]).mesh
    assert m.boundary_length("s") == pytest.approx(3)  # bottom (2) + right (1)


def test_point_selection_far_from_any_boundary_warns():
    sel = {"kind": "points", "name": "s", "points": [[1, 0.5]]}
    r = run([rect("r", 0, 0, 2, 1)], selections=[sel])
    assert "s" not in r.mesh.boundaries and any("'s'" in w for w in r.warnings)


def test_boundary_of_a_domain():
    sel = {"kind": "boundary_of", "name": "rim", "domains": ["c"]}
    m = run([rect("box", -1, -1, 2, 2), disk("c", 0, 0, 0.5)], FINE, selections=[sel]).mesh
    assert m.boundary_length("rim") == pytest.approx(math.pi, rel=1e-3)


# ── Mesh controls ─────────────────────────────────────────────────────────────


def test_divisions_set_the_number_of_elements_along_a_curve():
    steps = [rect("box", 0, 0, 1, 1), polyline("wire", (0.2, 0.5), (0.8, 0.5))]
    m = run(steps, {"size": 0.1, "controls": [{"target": "wire", "divisions": 12}]}).mesh
    assert len(m.boundaries["wire"]) == 12
    assert edge_lengths(m, "wire") == pytest.approx(np.full(12, 0.05))


def test_divisions_are_shared_by_length_over_the_curves_of_a_boundary():
    sel = {"kind": "boundary_of", "name": "rim", "domains": ["r"]}
    m = run(
        [rect("r", 0, 0, 2, 1)],
        {"size": 0.5, "controls": [{"target": "rim", "divisions": 30}]},
        selections=[sel],
    ).mesh
    assert len(m.boundaries["rim"]) == 30
    assert edge_lengths(m, "rim") == pytest.approx(np.full(30, 0.2))


def test_grading_is_the_ratio_of_last_to_first_element():
    steps = [rect("box", 0, 0, 1, 1), polyline("wire", (0.1, 0.5), (0.9, 0.5))]
    control = {"target": "wire", "divisions": 10, "grading": 4}
    lengths = edge_lengths(run(steps, {"size": 0.2, "controls": [control]}).mesh, "wire")
    assert lengths.max() / lengths.min() == pytest.approx(4, rel=1e-6)
    assert lengths.sum() == pytest.approx(0.8)


def test_structured_domain_is_a_regular_grid():
    selections = [
        {"kind": "points", "name": "long", "points": [[1, 0], [1, 1]]},
        {"kind": "points", "name": "short", "points": [[0, 0.5], [2, 0.5]]},
    ]
    controls = [
        {"target": "r", "structured": True},
        {"target": "long", "divisions": 16},  # 8 per side
        {"target": "short", "divisions": 6},  # 3 per side
    ]
    m = run([rect("r", 0, 0, 2, 1)], {"size": 1, "controls": controls}, selections=selections).mesh
    assert (m.n_nodes, m.n_triangles) == (9 * 4, 2 * 8 * 3)
    assert m.quality() == pytest.approx(np.full(48, m.quality()[0]))  # all alike


def test_structured_domain_without_divisions_takes_the_element_size():
    controls = [{"target": "r", "structured": True}]
    m = run([rect("r", 0, 0, 2, 1)], {"size": 0.25, "controls": controls}).mesh
    grids = [
        (nx, ny)
        for nx in range(1, 40)
        for ny in range(1, 40)
        if (m.n_nodes, m.n_triangles) == ((nx + 1) * (ny + 1), 2 * nx * ny)
    ]
    assert any(2 / nx <= 0.25 and 1 / ny <= 0.25 for nx, ny in grids)  # 9×5 here


@pytest.mark.parametrize("algorithm", ["frontal-delaunay", "delaunay", "meshadapt"])
def test_algorithms_give_valid_meshes(algorithm):
    m = run([disk("c", 0, 0, 1)], {"size": 0.1, "algorithm": algorithm, "smoothing": 5}).mesh
    assert (m.areas() > 0).all() and m.quality().min() > 0.3


def test_min_size_bounds_local_refinement():
    steps = [rect("box", 0, 0, 1, 1), {"kind": "point", "name": "p", "x": 0.5, "y": 0.5}]
    controls = [{"target": "p", "size": 1e-4}]
    m = run(steps, {"size": 0.1, "min_size": 0.01, "controls": controls}).mesh
    e = m.nodes[m.triangles[:, [0, 1]]]
    assert np.linalg.norm(e[:, 1] - e[:, 0], axis=1).min() > 0.005


def test_divisions_on_a_domain_are_an_error():
    with pytest.raises(ValueError, match="divisions"):
        run([rect("r", 0, 0, 1, 1)], {"size": 0.1, "controls": [{"target": "r", "divisions": 4}]})


def test_too_large_meshes_are_refused_before_meshing():
    steps = [rect("box", 0, 0, 1, 1), polyline("wire", (0.2, 0.5), (0.8, 0.5))]
    with pytest.raises(ValueError, match="would have about"):
        mesh_geometry(geo(steps, {"size": 1e-4}), max_elements=60_000)
    with pytest.raises(ValueError, match="would have about"):
        controls = [{"target": "wire", "divisions": 10_000}]
        mesh_geometry(geo(steps, {"size": 0.1, "controls": controls}), max_elements=60_000)
    assert mesh_geometry(geo(steps, {"size": 0.02}), max_elements=60_000).mesh.n_triangles > 0


# ── Validation ────────────────────────────────────────────────────────────────

A, B = rect("a", 0, 0, 1, 1), rect("b", 0.5, 0, 1, 1)
U = {"kind": "union", "name": "u", "objects": ["a", "b"]}


@pytest.mark.parametrize(
    "steps, extra",
    [
        ([A, A], {}),  # duplicate name
        ([A, U], {}),  # unknown object
        ([A, B, U, {"kind": "move", "name": "m", "objects": ["a"]}], {}),  # consumed by u
        ([A, polyline("l", (0, 0), (1, 1)), {**U, "objects": ["a", "l"]}], {}),  # mixed dims
        ([A, {"kind": "surface", "name": "s", "curves": ["a"]}], {}),  # not a curve
        (
            [
                polyline("l", (0, 0), (1, 1)),
                A,
                {"kind": "difference", "name": "d", "objects": ["a"], "tools": ["l"]},
            ],
            {},
        ),  # tool of lower dimension
        ([A, polyline("l", (0, 0), (1, 1))], {"holes": ["l"]}),  # hole must be a surface
        ([A], {"holes": ["a"]}),  # nothing left to mesh
        ([A], {"selections": [{"kind": "points", "name": "a", "points": [[0, 0]]}]}),
        ([A], {"selections": [{"kind": "boundary_of", "name": "s", "domains": ["x"]}]}),
        ([A], {"mesh": {"size": 0.1, "controls": [{"target": "typo", "size": 0.1}]}}),
        ([A], {"mesh": {"size": 0.1, "controls": [{"target": "a"}]}}),  # nothing set
        ([A], {"mesh": {"size": 0.1, "controls": [{"target": "outer", "structured": True}]}}),
        ([rect("a|b", 0, 0, 1, 1)], {}),
        ([rect("outer", 0, 0, 1, 1)], {}),
    ],
)
def test_invalid_sequences_are_rejected(steps, extra):
    with pytest.raises(ValidationError):
        geo(steps, **extra)


def test_interface_names_are_valid_targets():
    g = geo([A, B], {"size": 0.1, "controls": [{"target": "a|b", "size": 0.01}]})
    assert len(mesh_geometry(g).mesh.boundaries["a|b"]) >= 90


def test_gmsh_errors_name_the_step():
    open_loop = [
        polyline("l", (0, 0), (1, 0), (1, 1)),
        {"kind": "surface", "name": "s", "curves": ["l"]},
    ]
    with pytest.raises(ValueError, match="'s'"):
        run(open_loop)


def test_curve_object_is_written_to_the_msh_file(tmp_path):
    steps = [rect("box", 0, 0, 1, 1), polyline("wire", (0.2, 0.5), (0.8, 0.5))]
    mesh_geometry(geo(steps), msh_path=tmp_path / "m.msh")
    assert '"wire"' in (tmp_path / "m.msh").read_text()


def test_sequence_meshing_is_deterministic():
    steps = [rect("a", 0, 0, 1, 1), disk("c", 0.5, 0.5, 0.3), {**U, "objects": ["a", "c"]}]
    m1, m2 = run(steps).mesh, run(steps).mesh
    np.testing.assert_array_equal(m1.triangles, m2.triangles)


def test_readme_example_meshes():
    import re
    from pathlib import Path

    readme = (Path(__file__).parents[1] / "README.md").read_text(encoding="utf-8")
    example = re.search(r"```json\n(.*?)```", readme, re.S).group(1)
    r = mesh_geometry(Geometry.model_validate_json(example))
    assert r.mesh.domain_names == ["air"] and not r.warnings
    assert {"top", "bottom", "guard", "left", "outer"} <= set(r.mesh.boundaries)
