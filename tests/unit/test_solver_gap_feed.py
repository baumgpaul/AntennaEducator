"""Balanced feeds are solved as one source across the gap.

The preprocessor feeds a gap dipole with two sources from ground (node 0, the
reference at infinity): +V to one gap node, -V to the other. Each source has its
own branch to infinity, so as soon as the surroundings are not symmetric a
common-mode current flows to infinity and the port impedance is wrong (a
reflector shifted 0.15 m along the dipole axis: 30 % error at 300 MHz). The
solver now replaces such a pair by one source of 2V between the gap nodes, as a
delta-gap feed is defined. Stored designs keep their two sources.
"""

import numpy as np
import pytest

from backend.solver.schemas import AntennaInput, VoltageSourceInput
from backend.solver.solver import (
    SolverConfiguration,
    gap_feed_sources,
    solve_multi_antenna,
    solve_peec_frequency_sweep,
)
from backend.solver.system import VoltageSource

A = 1e-3
LOSSLESS = SolverConfiguration(include_skin_effect=False, resistivity=1e-20)


def dipole(length=0.48, gap=0.005, n_half=12, x=0.0, z0=0.0):
    """Gap dipole along z: nodes 1..n+1 lower arm (tip -> gap), then upper arm (gap -> tip)."""
    lo = np.linspace(-(length - gap) / 2, -gap / 2, n_half + 1)
    hi = np.linspace(gap / 2, (length - gap) / 2, n_half + 1)
    z = np.r_[lo, hi] + z0
    nodes = np.column_stack([np.full_like(z, x), 0 * z, z])
    edges = [[i + 1, i + 2] for i in range(n_half)] + [
        [n_half + 2 + i, n_half + 3 + i] for i in range(n_half)
    ]
    return nodes, edges, n_half + 1, n_half + 2  # feed_lower, feed_upper


def wire(x, z0, length, n):
    z = np.linspace(z0 - length / 2, z0 + length / 2, n + 1)
    return np.column_stack([np.full_like(z, x), 0 * z, z]), [[i + 1, i + 2] for i in range(n)]


def with_parasites(parasites):
    nodes, edges, lo, up = dipole()
    for p_nodes, p_edges in parasites:
        off = len(nodes)
        nodes = np.vstack([nodes, p_nodes])
        edges = edges + [[a + off, b + off] for a, b in p_edges]
    return nodes, edges, lo, up


def z_in(nodes, edges, sources, f=300e6):
    r = solve_peec_frequency_sweep(
        nodes, edges, np.full(len(edges), A), np.array([f]), sources, config=LOSSLESS
    )
    return r.frequency_solutions[0]


def grounded_pair(lo, up, v=0.5):
    return [VoltageSource(0, lo, v), VoltageSource(0, up, -v)]


def gap_source(lo, up, v=0.5):
    return [VoltageSource(up, lo, 2 * v)]


# ── the pairing itself ──────────────────────────────────────────────────────────


def test_balanced_pair_becomes_one_gap_source():
    sources, mapping = gap_feed_sources(
        [VoltageSource(0, 4, 0.5, R=1.0), VoltageSource(0, 5, -0.5, R=2.0)]
    )
    assert len(sources) == 1
    s = sources[0]
    assert (s.node_start, s.node_end, s.value, s.R) == (5, 4, 1.0, 3.0)  # series: R adds
    assert mapping == [(0, 1.0), (0, -1.0)]


@pytest.mark.parametrize(
    "vs",
    [
        [
            VoltageSource(0, 4, 1.0)
        ],  # single source against ground: left as it is (warned elsewhere)
        [VoltageSource(0, 4, 1.0), VoltageSource(0, 5, 1.0)],  # same sign: not a gap feed
        [VoltageSource(0, 4, 1.0), VoltageSource(0, 4, -1.0)],  # same node
        [VoltageSource(3, 4, 1.0), VoltageSource(0, 5, -1.0)],  # not both from ground
    ],
)
def test_other_sources_are_left_alone(vs):
    sources, mapping = gap_feed_sources(vs)
    assert [(s.node_start, s.node_end, s.value) for s in sources] == [
        (s.node_start, s.node_end, s.value) for s in vs
    ]
    assert mapping == [(k, 1.0) for k in range(len(vs))]


def test_pairs_never_cross_antenna_groups():
    """Antenna 1 fed +1 V, antenna 2 fed -1 V (each against ground): not one feed."""
    vs = [VoltageSource(0, 4, 1.0), VoltageSource(0, 30, -1.0)]
    sources, _ = gap_feed_sources(vs, groups=[0, 1])
    assert len(sources) == 2


def test_two_dipoles_get_one_gap_source_each():
    vs = [
        VoltageSource(0, 4, 1.0),
        VoltageSource(0, 5, -1.0),
        VoltageSource(0, 14, 1.0),
        VoltageSource(0, 15, -1.0),
    ]
    sources, mapping = gap_feed_sources(vs, groups=[0, 0, 1, 1])
    assert [(s.node_start, s.node_end) for s in sources] == [(5, 4), (15, 14)]
    assert mapping == [(0, 1.0), (0, -1.0), (1, 1.0), (1, -1.0)]


# ── physics ───────────────────────────────────────────────────────────────────


def test_symmetric_dipole_is_unchanged():
    """No common mode in a symmetric structure: both feeds agree to round-off."""
    nodes, edges, lo, up = dipole()
    a = z_in(nodes, edges, grounded_pair(lo, up)).input_impedance
    b = z_in(nodes, edges, gap_source(lo, up)).input_impedance
    assert a == pytest.approx(b, rel=1e-9)
    assert 50 < a.real < 90


@pytest.mark.parametrize(
    "parasites",
    [
        [wire(-0.15, 0.15, 0.52, 26)],  # reflector shifted along the axis
        [wire(-0.15, 0.1, 0.52, 26), wire(0.12, 0.1, 0.44, 22)],  # offset 3-element Yagi
        [wire(0.05, 0.12, 0.20, 10)],  # short wire beside one arm
    ],
)
def test_asymmetric_surroundings_match_the_gap_source(parasites):
    """The stored balanced pair now gives the delta-gap impedance (it was off by up to 30 %)."""
    nodes, edges, lo, up = with_parasites(parasites)
    pair = z_in(nodes, edges, grounded_pair(lo, up))
    gap = z_in(nodes, edges, gap_source(lo, up))
    assert pair.input_impedance == pytest.approx(gap.input_impedance, rel=1e-9)


def test_no_current_leaves_to_infinity():
    """Charge conservation: the source currents of the pair are equal and opposite."""
    nodes, edges, lo, up = with_parasites([wire(-0.15, 0.15, 0.52, 26)])
    sol = z_in(nodes, edges, grounded_pair(lo, up))
    i_plus, i_minus = sol.branch_currents[len(edges)], sol.branch_currents[len(edges) + 1]
    assert i_plus == pytest.approx(-i_minus, rel=1e-12)
    assert sol.input_current == pytest.approx(i_plus)


def test_output_layout_is_unchanged():
    nodes, edges, lo, up = dipole()
    r = solve_peec_frequency_sweep(
        nodes,
        edges,
        np.full(len(edges), A),
        np.array([300e6]),
        grounded_pair(lo, up),
        config=LOSSLESS,
    )
    assert r.n_branches == len(edges) + 2
    assert len(r.frequency_solutions[0].branch_currents) == len(edges) + 2


def test_power_balance_with_the_gap_source():
    """P_in = 1/2 Re(V I*) equals the power the port delivers into the structure."""
    nodes, edges, lo, up = with_parasites([wire(-0.15, 0.15, 0.52, 26)])
    sol = z_in(nodes, edges, grounded_pair(lo, up))
    z = sol.input_impedance
    assert sol.input_power == pytest.approx(0.5 * abs(sol.input_current) ** 2 * z.real, rel=1e-9)


def test_multi_antenna_driven_plus_parasite():
    """Multi-antenna path: dipole and a shifted reflector as separate antennas."""
    nodes, edges, lo, up = dipole()
    r_nodes, r_edges = wire(-0.15, 0.15, 0.52, 26)
    driven = AntennaInput(
        antenna_id="d",
        nodes=nodes.tolist(),
        edges=edges,
        radii=[A] * len(edges),
        voltage_sources=[
            VoltageSourceInput(node_start=0, node_end=lo, value=0.5),
            VoltageSourceInput(node_start=0, node_end=up, value=-0.5),
        ],
    )
    refl = AntennaInput(
        antenna_id="r", nodes=r_nodes.tolist(), edges=r_edges, radii=[A] * len(r_edges)
    )
    res = solve_multi_antenna([driven, refl], 300e6, LOSSLESS)
    z_multi = complex(res["antenna_solutions"][0]["input_impedance"])
    both_nodes, both_edges, lo2, up2 = with_parasites([wire(-0.15, 0.15, 0.52, 26)])
    z_gap = z_in(both_nodes, both_edges, gap_source(lo2, up2)).input_impedance
    assert z_multi == pytest.approx(z_gap, rel=1e-6)
    i = res["antenna_solutions"][0]["voltage_source_currents"]
    assert len(i) == 2 and complex(i[0]) == pytest.approx(-complex(i[1]), rel=1e-12)
