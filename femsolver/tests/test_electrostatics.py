"""2D electrostatics (P1): the physics test standard.

1. Analytic benchmarks (plate capacitor, layered dielectric, coax)
2. Manufactured solution: L2 error O(h²), energy error O(h)
3. Consistency: Q = C·ΔV = 2W/ΔV, charge neutrality, Gauss's law
4. One test per boundary condition type
5. Invariance under rotation
6. Checklist / setup errors, and the "inside FEM" data
"""

import math
import xml.etree.ElementTree as ET

import numpy as np
import pytest
from fem_mesher import Geometry2D, mesh_geometry
from fem_solver import EPSILON_0, Electrostatics, SetupError, check, p1, solve
from fem_solver.opencfs import export


def mesh(shapes, size, holes=(), selections=(), **mesh_opts):
    g = Geometry2D.model_validate(
        {
            "shapes": shapes,
            "holes": list(holes),
            "selections": list(selections),
            "mesh": {"size": size, **mesh_opts},
        }
    )
    return mesh_geometry(g).mesh


def rect(name, x, y, w, h):
    return {"kind": "rectangle", "name": name, "x": x, "y": y, "width": w, "height": h}


def line(name, x0, y0, x1, y1):
    return {
        "name": name,
        "xmin": min(x0, x1),
        "ymin": min(y0, y1),
        "xmax": max(x0, x1),
        "ymax": max(y0, y1),
    }


def problem(materials, bcs, **kw):
    return Electrostatics.model_validate(
        {
            "materials": {
                d: {"name": d, "relative_permittivity": er} for d, er in materials.items()
            },
            "boundary_conditions": bcs,
            **kw,
        }
    )


W, D = 0.1, 0.01  # plate width and gap


def plate_capacitor(er=4.0, size=0.002, **kw):
    m = mesh(
        [rect("diel", 0, 0, W, D)],
        size,
        selections=[line("top", 0, D, W, D), line("bottom", 0, 0, W, 0)],
    )
    p = problem(
        {"diel": er},
        [
            {"type": "potential", "boundary": "top", "value": 1.0},
            {"type": "ground", "boundary": "bottom"},
        ],
        **kw,
    )
    return m, solve(p, m)


# ── 1. Analytic benchmarks ────────────────────────────────────────────────────


def test_plate_capacitor_is_exact():
    """The exact V is linear, which P1 elements reproduce exactly (on any mesh)."""
    m, r = plate_capacitor()
    np.testing.assert_allclose(r.potential, m.nodes[:, 1] / D, atol=1e-12)
    np.testing.assert_allclose(
        r.electric_field, np.tile([0.0, -1 / D], (m.n_triangles, 1)), atol=1e-9
    )
    c = 4 * EPSILON_0 * W / D  # per metre depth
    assert r.capacitance["from_charge"] == pytest.approx(c, rel=1e-12)
    assert r.capacitance["from_energy"] == pytest.approx(c, rel=1e-12)


def test_depth_scales_capacitance():
    _, r1 = plate_capacitor()
    _, r2 = plate_capacitor(depth=0.03)
    assert r2.capacitance["from_charge"] == pytest.approx(
        0.03 * r1.capacitance["from_charge"], rel=1e-12
    )


def test_layered_dielectric_series_capacitance():
    """Two layers in series: D·n continuous across the interface, E jumps by ε₁/ε₂."""
    d1, d2, er1, er2 = 0.004, 0.006, 2.0, 8.0
    m = mesh(
        [rect("low", 0, 0, W, d1), rect("high", 0, d1, W, d2)],
        0.002,
        selections=[line("top", 0, d1 + d2, W, d1 + d2), line("bottom", 0, 0, W, 0)],
    )
    r = solve(
        problem(
            {"low": er1, "high": er2},
            [
                {"type": "potential", "boundary": "top", "value": 1.0},
                {"type": "ground", "boundary": "bottom"},
            ],
        ),
        m,
    )
    c = EPSILON_0 * W / (d1 / er1 + d2 / er2)
    assert r.capacitance["from_charge"] == pytest.approx(c, rel=1e-10)
    dy = r.flux_density[:, 1]
    np.testing.assert_allclose(dy, dy[0], rtol=1e-9)  # D uniform through both layers
    e_low = r.electric_field[m.triangle_domain == m.domain_names.index("low"), 1]
    e_high = r.electric_field[m.triangle_domain == m.domain_names.index("high"), 1]
    assert e_low.mean() / e_high.mean() == pytest.approx(er2 / er1, rel=1e-9)


def coax(size, per_circle=64, a=0.002, b=0.01):
    m = mesh(
        [
            {"kind": "circle", "name": "air", "cx": 0, "cy": 0, "r": b},
            {"kind": "circle", "name": "inner", "cx": 0, "cy": 0, "r": a},
        ],
        size,
        holes=["inner"],
        elements_per_circle=per_circle,
    )
    r = solve(
        problem(
            {"air": 1.0},
            [
                {"type": "potential", "boundary": "inner", "value": 1.0},
                {"type": "ground", "boundary": "outer"},
            ],
        ),
        m,
    )
    return m, r, 2 * math.pi * EPSILON_0 / math.log(b / a)


def test_coax_converges_to_analytic_capacitance():
    errors = []
    for size, per_circle in ((0.002, 32), (0.001, 64), (0.0005, 128)):
        _, r, c = coax(size, per_circle)
        errors.append(abs(r.capacitance["from_charge"] / c - 1))
    assert errors[0] > errors[1] > errors[2]
    assert errors[2] < 2e-3


def test_coax_field_is_radial_and_follows_one_over_r():
    """E is constant per P1 element: first-order accurate, so its error halves with h."""
    errors = []
    for size, per_circle in ((0.001, 64), (0.0005, 128)):
        m, r, _ = coax(size, per_circle)
        centre = m.nodes[m.triangles[:, :3]].mean(axis=1)
        radius = np.linalg.norm(centre, axis=1)
        exact = 1.0 / (radius * math.log(0.01 / 0.002))
        radial = np.einsum("ed,ed->e", r.electric_field, centre / radius[:, None])
        middle = (radius > 0.004) & (radius < 0.008)  # away from the polygonal boundaries
        errors.append(np.median(np.abs(radial[middle] / exact[middle] - 1)))
        assert np.abs(r.field_magnitude - np.abs(radial)).max() < 0.05 * r.field_magnitude.max()
    assert errors[1] < 0.7 * errors[0]
    assert errors[1] < 0.02


# ── 2. Manufactured solution: convergence rates ───────────────────────────────


def _mms_errors(size):
    """u = sin(πx)·sin(πy) + x·y on the unit square: ρ = ε·2π²·sin(πx)·sin(πy)."""
    m = mesh([rect("sq", 0, 0, 1, 1)], size)
    p = problem(
        {"sq": 1.0},
        [{"type": "potential", "boundary": "outer", "value": "x*y"}],
        parameters={"eps": EPSILON_0},
        sources=[
            {"type": "charge_density", "domain": "sq", "value": "eps*2*pi**2*sin(pi*x)*sin(pi*y)"}
        ],
    )
    r = solve(p, m)
    areas, grads = p1.geometry(m.nodes, m.triangles)
    mid = p1.edge_midpoints(m.nodes, m.triangles)
    x, y = mid[..., 0], mid[..., 1]
    exact = np.sin(np.pi * x) * np.sin(np.pi * y) + x * y
    u = r.potential[m.triangles]
    u_mid = 0.5 * (u + u[:, [1, 2, 0]])
    l2 = math.sqrt(np.sum(areas[:, None] / 3 * (u_mid - exact) ** 2))
    gx = np.pi * np.cos(np.pi * x) * np.sin(np.pi * y) + y
    gy = np.pi * np.sin(np.pi * x) * np.cos(np.pi * y) + x
    gh = np.einsum("eid,ei->ed", grads, u)
    h1 = math.sqrt(
        np.sum(areas[:, None] / 3 * ((gh[:, None, 0] - gx) ** 2 + (gh[:, None, 1] - gy) ** 2))
    )
    return 1 / math.sqrt(m.n_nodes), l2, h1


def test_manufactured_solution_converges_at_the_theoretical_rates():
    """P1: potential error ~h², field (energy-norm) error ~h. Catches assembly bugs."""
    results = [_mms_errors(h) for h in (0.1, 0.05, 0.025)]
    for (h0, l0, g0), (h1, l1, g1) in zip(results, results[1:]):
        assert math.log(l0 / l1) / math.log(h0 / h1) > 1.8
        assert math.log(g0 / g1) / math.log(h0 / h1) > 0.9
    assert results[-1][1] < 2e-3


# ── 3. Consistency ────────────────────────────────────────────────────────────


def test_charge_and_energy_give_the_same_capacitance():
    """Q·ΔV = uᵀKu exactly for two electrodes: 2W/ΔV² = Q/ΔV to rounding."""
    _, r, _ = coax(0.002, 32)
    assert r.capacitance["from_energy"] == pytest.approx(r.capacitance["from_charge"], rel=1e-10)
    assert r.charge["inner"] + r.charge["outer"] == pytest.approx(
        0, abs=1e-12 * abs(r.charge["inner"])
    )


def test_reaction_charge_is_more_accurate_than_flux_charge():
    """Charges from the FE reactions converge faster than from element fields."""
    _, r, c = coax(0.001, 64)
    assert abs(r.charge["inner"] / c - 1) < abs(r.charge_from_flux["inner"] / c - 1)


def test_gauss_law_with_volume_charge():
    """The electrodes carry exactly minus the enclosed charge."""
    rho = 1e-6
    m = mesh(
        [rect("slab", 0, 0, W, D)],
        0.002,
        selections=[line("top", 0, D, W, D), line("bottom", 0, 0, W, 0)],
    )
    p = problem(
        {"slab": 2.0},
        [{"type": "ground", "boundary": "top"}, {"type": "ground", "boundary": "bottom"}],
        sources=[{"type": "charge_density", "domain": "slab", "value": rho}],
    )
    r = solve(p, m)
    enclosed = rho * W * D
    assert r.charge["top"] + r.charge["bottom"] == pytest.approx(-enclosed, rel=1e-10)
    assert r.charge["top"] == pytest.approx(r.charge["bottom"], rel=1e-2)  # symmetric slab
    assert r.capacitance is None  # free charge: no capacitance


# ── 4. Boundary conditions ────────────────────────────────────────────────────


def test_ground_equals_zero_potential():
    m = mesh(
        [rect("diel", 0, 0, W, D)],
        0.002,
        selections=[line("top", 0, D, W, D), line("bottom", 0, 0, W, 0)],
    )
    a = solve(
        problem(
            {"diel": 1},
            [
                {"type": "potential", "boundary": "top", "value": 1},
                {"type": "ground", "boundary": "bottom"},
            ],
        ),
        m,
    )
    b = solve(
        problem(
            {"diel": 1},
            [
                {"type": "potential", "boundary": "top", "value": 1},
                {"type": "potential", "boundary": "bottom", "value": 0},
            ],
        ),
        m,
    )
    np.testing.assert_allclose(a.potential, b.potential, atol=1e-14)


def test_natural_boundary_has_no_normal_flux():
    """The untouched sides of the plate capacitor: D·n = 0, so E has no x part."""
    _, r = plate_capacitor()
    assert np.abs(r.electric_field[:, 0]).max() < 1e-9


def test_space_dependent_potential_gives_uniform_field():
    m = mesh([rect("box", 0, 0, 0.2, 0.1)], 0.02)
    r = solve(
        problem(
            {"box": 1},
            [{"type": "potential", "boundary": "outer", "value": "E0*x"}],
            parameters={"E0": 500.0},
        ),
        m,
    )
    np.testing.assert_allclose(
        r.electric_field, np.tile([-500.0, 0.0], (m.n_triangles, 1)), atol=1e-8
    )


def test_surface_charge_density_on_a_boundary():
    """A charged sheet over a grounded plate: E = σ/ε, V(top) = σ·d/ε (exact for P1)."""
    sigma, er = 2e-6, 3.0
    m = mesh(
        [rect("slab", 0, 0, W, D)],
        0.002,
        selections=[line("top", 0, D, W, D), line("bottom", 0, 0, W, 0)],
    )
    r = solve(
        problem(
            {"slab": er},
            [
                {"type": "surface_charge_density", "boundary": "top", "value": sigma},
                {"type": "ground", "boundary": "bottom"},
            ],
        ),
        m,
    )
    eps = er * EPSILON_0
    top = np.isclose(m.nodes[:, 1], D)
    np.testing.assert_allclose(r.potential[top], sigma * D / eps, rtol=1e-10)
    np.testing.assert_allclose(r.electric_field[:, 1], -sigma / eps, rtol=1e-9)
    assert r.charge["bottom"] == pytest.approx(-sigma * W, rel=1e-10)  # the image charge


# ── 5. Invariance ─────────────────────────────────────────────────────────────


def test_rotated_capacitor_gives_the_same_capacitance():
    """Electrodes as holes on a dielectric rotated by 30°: still exact."""
    a = math.radians(30)

    def poly(name, pts):
        rotated = [
            [x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a)] for x, y in pts
        ]
        return {"kind": "polygon", "name": name, "points": rotated}

    t = 0.001
    shapes = [
        poly("diel", [(0, 0), (W, 0), (W, D), (0, D)]),
        poly("top", [(0, D), (W, D), (W, D + t), (0, D + t)]),
        poly("bottom", [(0, -t), (W, -t), (W, 0), (0, 0)]),
    ]
    m = mesh(shapes, 0.002, holes=["top", "bottom"])
    r = solve(
        problem(
            {"diel": 4},
            [
                {"type": "potential", "boundary": "top", "value": 1},
                {"type": "ground", "boundary": "bottom"},
            ],
        ),
        m,
    )
    assert r.capacitance["from_charge"] == pytest.approx(4 * EPSILON_0 * W / D, rel=1e-9)


# ── 6. Checklist, setup errors, inside-FEM data ───────────────────────────────


def test_checklist_explains_what_is_missing():
    p = problem(
        {"air": 1.0, "ghost": 2.0},
        [{"type": "surface_charge_density", "boundary": "nowhere", "value": 1}],
    )
    issues = check(p, ["air", "diel"], ["outer"])
    messages = [i.message for i in issues]
    assert any("'diel' has no material" in s for s in messages)
    assert any("'ghost'" in s for s in messages)
    assert any("'nowhere'" in s for s in messages)
    assert any("No ground or potential" in s for s in messages)
    singular = next(i for i in issues if "No ground" in i.message)
    assert singular.step == "physics" and "singular" in singular.why


def test_two_conditions_on_one_boundary():
    p = problem(
        {"air": 1},
        [
            {"type": "ground", "boundary": "outer"},
            {"type": "potential", "boundary": "outer", "value": 1},
        ],
    )
    assert any("two conditions" in i.message for i in check(p, ["air"], ["outer"]))


def test_solve_refuses_an_incomplete_model():
    m = mesh([rect("air", 0, 0, 1, 1)], 0.2)
    with pytest.raises(SetupError, match="No ground") as e:
        solve(problem({"air": 1}, []), m)
    assert e.value.issues


def test_touching_electrodes_with_different_potentials():
    m = mesh(
        [rect("box", 0, 0, 1, 1)],
        0.2,
        selections=[line("left", 0, 0, 0, 1), line("bottom", 0, 0, 1, 0)],
    )
    p = problem(
        {"box": 1},
        [
            {"type": "potential", "boundary": "left", "value": 1},
            {"type": "ground", "boundary": "bottom"},
        ],
    )
    with pytest.raises(SetupError, match="touch"):
        solve(p, m)


def test_second_order_mesh_is_rejected_by_the_p1_solver():
    m = mesh([rect("box", 0, 0, 1, 1)], 0.2, order=2)
    with pytest.raises(SetupError, match="first-order"):
        solve(problem({"box": 1}, [{"type": "ground", "boundary": "outer"}]), m)


def test_inside_fem_data():
    m, r = plate_capacitor(size=0.005)
    info = r.info
    assert info.n_free + info.n_prescribed == info.n_nodes == m.n_nodes
    assert info.relative_residual < 1e-10
    k = r.stiffness
    assert abs(k - k.T).max() < 1e-12 * abs(k).max()  # symmetric
    np.testing.assert_allclose(
        k @ np.ones(m.n_nodes), 0, atol=1e-12 * abs(k).max()
    )  # rows sum to 0
    # sparse: a node couples only to its neighbours (≤ ~7 nonzeros per row in 2D)
    assert info.nonzeros < 10 * m.n_nodes
    areas, grads = p1.geometry(m.nodes, m.triangles)
    k_e = p1.stiffness_matrices(areas, grads, np.ones(m.n_triangles))
    np.testing.assert_allclose(k_e.sum(axis=2), 0, atol=1e-12)
    assert (np.linalg.eigvalsh(k_e) > -1e-12).all()  # positive semidefinite


# ── openCFS export ────────────────────────────────────────────────────────────

NS = {"c": "http://www.cfs++.org/simulation", "m": "http://www.cfs++.org/material"}


def test_opencfs_export():
    p = problem(
        {"air": 1.0, "diel": 4.0},
        [
            {"type": "potential", "boundary": "top", "value": "U"},
            {"type": "ground", "boundary": "bottom"},
            {"type": "surface_charge_density", "boundary": "side", "value": "s0*x**2"},
        ],
        parameters={"U": 2.0, "s0": 1e-6},
        depth=0.03,
    )
    files = export(p, ["air", "diel"], ["top", "bottom", "side", "outer"], mesh_file="cap.msh")
    sim = ET.fromstring(files["simulation.xml"])
    assert sim.find("c:fileFormats/c:input/c:gmsh", NS).get("fileName") == "cap.msh"
    domain = sim.find("c:domain", NS)
    assert domain.get("geometryType") == "plane" and float(domain.get("depth2dPlane")) == 0.03
    assert {
        r.get("name"): r.get("material") for r in domain.findall("c:regionList/c:region", NS)
    } == {
        "air": "air",
        "diel": "diel",
    }
    assert {
        v.get("name"): float(v.get("value")) for v in domain.findall("c:variableList/c:var", NS)
    } == {
        "U": 2.0,
        "s0": 1e-6,
    }
    bcs = sim.find("c:sequenceStep/c:pdeList/c:electrostatic/c:bcsAndLoads", NS)
    loads = {(e.tag.split("}")[1], e.get("name")): e.get("value") for e in bcs}
    assert loads[("potential", "top")] == "2.0" and ("ground", "bottom") in loads
    # space-dependent: kept as an expression in openCFS syntax, parameters as its variables
    assert loads[("chargeDensity", "side")] == "(s0*(x^2))"
    mat = ET.fromstring(files["mat.xml"])
    real = mat.find(
        "m:material[@name='diel']/m:electric/m:permittivity/m:linear/m:tensor/m:real", NS
    )
    assert float(real.text.split()[0]) == pytest.approx(4 * EPSILON_0, rel=1e-6)
