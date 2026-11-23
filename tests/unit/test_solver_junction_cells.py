"""Charge cells at wire junctions (nodes with more than two edges).

The capacitive cell of a node is made of the half-edges around it. At a node
with k > 2 edges it must consist of all k half-edges, with the k pieces in
parallel for the self term. The old cell collapsed the k edge midpoints into
their average: for a symmetric star the average is the node itself (a cell of
length 0, singular for a 4-arm cross), and the capacitance diverged from the
converged value under mesh refinement.
"""

import numpy as np
import pytest

from backend.solver.gauss_quadrature import get_gauss_points
from backend.solver.geometry import build_edge_geometries
from backend.solver.potential_nodal import (
    assemble_nodal_potential_matrix_with_cap_elem,
    build_cell_pieces,
    cell_mutual_coefficient,
    cell_self_coefficient,
)
from backend.solver.solver import SolverConfiguration, solve_peec_frequency_sweep
from backend.solver.system import VoltageSource

RADIUS = 1e-3


def star(angles_deg, arm, n_per_arm, radius=RADIUS, z_axis=False):
    """Straight arms from node 1 (the junction) at the given angles in the xy-plane."""
    nodes, edges = [np.zeros(3)], []
    for phi in np.radians(angles_deg):
        d = np.array([np.cos(phi), np.sin(phi), 0.0])
        prev = 1
        for i in range(1, n_per_arm + 1):
            nodes.append(d * arm * i / n_per_arm)
            edges.append([prev, len(nodes)])
            prev = len(nodes)
    nodes = np.array(nodes)
    if z_axis:  # rotate the structure out of the xy-plane (invariance test)
        c, s = np.cos(0.7), np.sin(0.7)
        nodes = nodes @ np.array([[1, 0, 0], [0, c, -s], [0, s, c]]).T
    return nodes, edges, np.full(len(edges), radius)


def potential_matrix(nodes, edges, radii):
    geo = build_edge_geometries(nodes, [[a - 1, b - 1] for a, b in edges])
    return assemble_nodal_potential_matrix_with_cap_elem(geo, edges, radii, len(nodes))[0]


def capacitance(nodes, edges, radii):
    """Static capacitance of the whole structure to infinity: sum of the entries of P^-1."""
    return float(np.linalg.inv(potential_matrix(nodes, edges, radii)).sum())


# ── regular nodes: unchanged ───────────────────────────────────────────────────


def test_two_piece_cells_reproduce_the_regular_coefficients():
    """The k-piece formulas with k = 2 are exactly the old 3-point cell formulas."""
    nodes, edges, radii = star([0, 180], 0.1, 5)
    P = potential_matrix(nodes, edges, radii)
    geo = build_edge_geometries(nodes, [[a - 1, b - 1] for a, b in edges])
    pieces = build_cell_pieces(geo, edges, radii, len(nodes))
    gp, gw = get_gauss_points(10)
    scale = 1 / (4 * np.pi * 8.8541878176e-12)
    for i in range(len(nodes)):
        assert scale * cell_self_coefficient(pieces[i], gp, gw) == pytest.approx(P[i, i], rel=1e-12)
        for j in range(i + 1, len(nodes)):
            assert scale * cell_mutual_coefficient(pieces[j], pieces[i], gp, gw) == pytest.approx(
                P[i, j], rel=1e-12
            )


def test_cells_of_a_straight_wire_have_two_pieces_and_ends_one():
    nodes, edges, radii = star([0, 180], 0.1, 3)
    geo = build_edge_geometries(nodes, [[a - 1, b - 1] for a, b in edges])
    pieces = build_cell_pieces(geo, edges, radii, len(nodes))
    lengths = [sum(np.linalg.norm(p1 - p0) for p0, p1, _ in pc) for pc in pieces]
    seg = 0.1 / 3
    assert lengths[0] == pytest.approx(seg)  # junction-free centre node: two half-edges
    assert min(lengths) == pytest.approx(seg / 2)  # wire ends: one half-edge


# ── junctions ─────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("arms", [3, 4, 6])
def test_junction_cell_is_all_half_edges(arms):
    nodes, edges, radii = star(np.arange(arms) * 360 / arms, 0.1, 4)
    geo = build_edge_geometries(nodes, [[a - 1, b - 1] for a, b in edges])
    cell = build_cell_pieces(geo, edges, radii, len(nodes))[0]
    assert len(cell) == arms
    assert sum(np.linalg.norm(p1 - p0) for p0, p1, _ in cell) == pytest.approx(arms * 0.1 / 4 / 2)


@pytest.mark.parametrize("angles", [[0, 120, 240], [0, 90, 180, 270], [0, 90, 180]])
def test_junction_capacitance_converges_like_a_straight_wire(angles):
    """Thin-wire capacitance converges slowly (charge singularity at the wire ends):
    a straight wire's successive differences shrink ~1.10-1.15x per halving. A
    junction must not be worse: monotone, at least the straight wire's rate.
    The old cell diverged (3-arm star +1.9 % -> +5.1 % from 5 to 20 seg/arm)."""
    ns = (5, 10, 20, 40)
    c = np.array([capacitance(*star(angles, 0.1, n)) for n in ns])
    s = np.array([capacitance(*star([0, 180], 0.1, n)) for n in ns])
    d, ds = np.diff(c), np.diff(s)
    assert np.all(d > 0)  # monotone, like the straight wire
    assert np.all(d[:-1] / d[1:] >= 0.95 * ds[:-1] / ds[1:])
    assert abs(c[2] / c[3] - 1) < 0.003  # 20 vs 40 seg/arm


@pytest.mark.parametrize(
    "angles, c_pf",
    [([0, 120, 240], 2.9481), ([0, 90, 180, 270], 3.4770), ([0, 90, 180], 2.9034)],
)
def test_junction_capacitance_regression(angles, c_pf):
    """Fixture at 10 seg/arm (arm 0.1 m, a = 1 mm). At 40 seg/arm these structures agree
    with an independent PEEC implementation of complete junction cells within 1e-5."""
    assert capacitance(*star(angles, 0.1, 10)) * 1e12 == pytest.approx(c_pf, abs=2e-4)


def test_four_arm_cross_no_longer_singular():
    """The averaged cell of a symmetric cross had length 0: singular 2x2 cell matrix."""
    nodes, edges, radii = star([0, 90, 180, 270], 0.1, 20)
    P = potential_matrix(nodes, edges, radii)
    assert np.all(np.isfinite(P)) and np.all(np.linalg.eigvalsh(P) > 0)


def test_capacitance_grows_with_arms_but_less_than_proportionally():
    """More arms of the same length: more charge, but mutual shielding at the hub."""
    c2, c3, c4 = (capacitance(*star(np.arange(k) * 360 / k, 0.1, 20)) for k in (2, 3, 4))
    assert c2 < c3 < c4
    assert c3 / c2 < 1.5 and c4 / c2 < 2.0


def test_symmetric_star_is_invariant_under_arm_permutation_and_rotation():
    nodes, edges, radii = star([0, 120, 240], 0.1, 6)
    P = potential_matrix(nodes, edges, radii)
    # arm k occupies nodes 2 + 6k ... 7 + 6k: rotating the arms must leave P unchanged
    perm = np.r_[0, np.roll(np.arange(1, 19).reshape(3, 6), 1, axis=0).ravel()]
    np.testing.assert_allclose(P[np.ix_(perm, perm)], P, rtol=1e-10)
    np.testing.assert_allclose(
        potential_matrix(*star([0, 120, 240], 0.1, 6, z_axis=True)), P, rtol=1e-10
    )
    np.testing.assert_allclose(P, P.T, rtol=1e-12)


def test_cross_dipole_with_junction_solves_and_converges():
    """End to end: a gap-fed dipole with a cross (4-wire junction) on one arm."""

    def build(n):
        nodes = [np.array([0, 0, 0.0025 + 0.2475 * i / n]) for i in range(n + 1)]
        nodes += [np.array([0, 0, -0.0025 - 0.2475 * i / n]) for i in range(n + 1)]
        edges = [[i + 1, i + 2] for i in range(n)] + [[n + 2 + i, n + 3 + i] for i in range(n)]
        hub = n // 2 + 1  # node in the middle of the upper arm
        for d in ([0.05, 0, 0], [-0.05, 0, 0]):
            prev = hub
            for k in range(1, 5):
                nodes.append(nodes[hub - 1] + np.array(d) * k / 4)
                edges.append([prev, len(nodes)])
                prev = len(nodes)
        vs = [VoltageSource(0, 1, 0.5), VoltageSource(0, n + 2, -0.5)]
        return np.array(nodes), edges, np.full(len(edges), RADIUS), vs

    z = []
    for n in (10, 20):
        nodes, edges, radii, vs = build(n)
        r = solve_peec_frequency_sweep(
            nodes,
            edges,
            radii,
            np.array([250e6]),
            vs,
            config=SolverConfiguration(include_skin_effect=False),
        )
        z.append(r.frequency_solutions[0].input_impedance)
    assert all(np.isfinite(zz) for zz in z)
    assert abs(z[1] - z[0]) / abs(z[1]) < 0.03


def test_ground_plane_images_use_the_complete_junction_cell():
    """Image theory: the coupling to the mirrored structure must equal the coupling to an
    explicitly mirrored copy (z -> -z) assembled as part of one geometry."""
    from backend.solver.ground_plane import image_potential
    from backend.solver.potential_nodal import junction_nodes

    nodes, edges, radii = star([0, 120, 240], 0.1, 4)
    nodes = nodes + np.array([0, 0, 0.05])  # 5 cm above the plane
    n = len(nodes)
    geo = build_edge_geometries(nodes, [[a - 1, b - 1] for a, b in edges])
    P, _, cap, rcap = assemble_nodal_potential_matrix_with_cap_elem(geo, edges, radii, n)
    P_img, _ = image_potential(
        cap,
        rcap,
        pieces=build_cell_pieces(geo, edges, radii, n),
        junctions=junction_nodes(edges, n),
    )
    both = np.vstack([nodes, nodes * np.array([1, 1, -1])])
    edges2 = edges + [[a + n, b + n] for a, b in edges]
    P2 = potential_matrix(both, edges2, np.r_[radii, radii])
    np.testing.assert_allclose(P_img, P2[:n, n:], rtol=1e-6)
    assert np.all(np.isfinite(P_img))
