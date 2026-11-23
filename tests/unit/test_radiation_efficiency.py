"""Radiation efficiency from the solver's energy balance: eta = 1 - P_loss / P_in.

P_in: power delivered by all sources at their terminals (for a balanced gap feed
the two sources together give the port power). P_loss: wire resistance + lumped
loads. The far-field response used to report efficiency 1.0 and gain =
directivity for every antenna.
"""

import numpy as np
import pytest

from backend.solver.schemas import AntennaInput, LoadInput, SolverConfiguration, VoltageSourceInput
from backend.solver.solver import SolverConfiguration as DirectConfig
from backend.solver.solver import solve_multi_antenna, solve_peec_frequency_sweep
from backend.solver.system import Load, VoltageSource

F = 300e6


def _dipole_nodes(n=12, length=0.48, gap=0.005):
    lo = np.linspace(-(length - gap) / 2, -gap / 2, n + 1)
    hi = np.linspace(gap / 2, (length - gap) / 2, n + 1)
    z = np.r_[lo, hi]
    nodes = np.column_stack([0 * z, 0 * z, z])
    edges = [[i + 1, i + 2] for i in range(n)] + [[n + 2 + i, n + 3 + i] for i in range(n)]
    return nodes, edges, n + 1, n + 2


def _point(radius=1e-3, resistivity=1.68e-8, skin=True, loads=None, sources=None):
    nodes, edges, lo, up = _dipole_nodes()
    sources = sources or [VoltageSource(0, lo, 0.5), VoltageSource(0, up, -0.5)]
    cfg = DirectConfig(include_skin_effect=skin, resistivity=resistivity)
    return solve_peec_frequency_sweep(
        nodes, edges, np.full(len(edges), radius), np.array([F]), sources, loads=loads, config=cfg
    ).frequency_solutions[0]


def test_balanced_feed_input_power_is_the_port_power():
    sol = _point()
    assert sol.total_input_power == pytest.approx(sol.input_power, rel=1e-12)


def test_copper_dipole_is_almost_lossless():
    sol = _point()
    assert 0.985 < sol.radiation_efficiency < 1.0  # mm copper at 300 MHz: < 1.5 % loss


def test_efficiency_drops_with_resistive_wire_and_matches_the_loss_share():
    sol = _point(radius=5e-5, resistivity=1e-6, skin=False)  # thin resistive wire
    expected = 1 - sol.total_power_dissipated / sol.total_input_power
    assert sol.radiation_efficiency == pytest.approx(expected, rel=1e-12)
    assert 0.05 < sol.radiation_efficiency < 0.9


def test_lossless_wire_is_100_percent():
    sol = _point(resistivity=1e-20, skin=False)
    assert sol.radiation_efficiency == pytest.approx(1.0, abs=1e-9)


def test_resistive_load_counts_as_loss():
    """A 50 Ohm load in one arm (split edge between two extra nodes) absorbs power."""
    nodes, edges, lo, up = _dipole_nodes()
    # put the load across the middle of the upper arm: remove that edge, load instead
    mid = up + 6
    edges_l = [e for e in edges if e != [mid, mid + 1]]
    loads = [Load(node_start=mid, node_end=mid + 1, R=50.0)]
    cfg = DirectConfig(include_skin_effect=False, resistivity=1e-20)
    sol = solve_peec_frequency_sweep(
        nodes,
        edges_l,
        np.full(len(edges_l), 1e-3),
        np.array([F]),
        [VoltageSource(0, lo, 0.5), VoltageSource(0, up, -0.5)],
        loads=loads,
        config=cfg,
    ).frequency_solutions[0]
    i_load = sol.branch_currents[len(edges_l) + 2]
    assert sol.total_power_dissipated == pytest.approx(0.5 * 50.0 * abs(i_load) ** 2, rel=1e-9)
    assert sol.radiation_efficiency < 0.95


def test_multi_antenna_response_reports_system_powers():
    nodes, edges, lo, up = _dipole_nodes()
    ant = AntennaInput(
        antenna_id="d",
        nodes=nodes.tolist(),
        edges=edges,
        radii=[5e-5] * len(edges),
        voltage_sources=[
            VoltageSourceInput(node_start=0, node_end=lo, value=0.5),
            VoltageSourceInput(node_start=0, node_end=up, value=-0.5),
        ],
    )
    res = solve_multi_antenna([ant], F, SolverConfiguration(include_skin_effect=True))
    assert res["input_power"] > 0 and res["power_dissipated"] > 0
    assert res["radiation_efficiency"] == pytest.approx(
        1 - res["power_dissipated"] / res["input_power"], rel=1e-12
    )
    assert 0 < res["radiation_efficiency"] < 1


def test_parasitic_loads_in_a_second_antenna_count_too():
    """System efficiency: a resistively loaded parasite absorbs part of the power."""
    nodes, edges, lo, up = _dipole_nodes()
    z = np.linspace(-0.25, 0.25, 21)
    p_nodes = np.column_stack([np.full_like(z, 0.1), 0 * z, z])
    p_edges = [[i + 1, i + 2] for i in range(20) if i != 9]  # gap in the middle for the load
    driven = AntennaInput(
        antenna_id="d",
        nodes=nodes.tolist(),
        edges=edges,
        radii=[1e-3] * len(edges),
        voltage_sources=[
            VoltageSourceInput(node_start=0, node_end=lo, value=0.5),
            VoltageSourceInput(node_start=0, node_end=up, value=-0.5),
        ],
    )
    parasite = AntennaInput(
        antenna_id="p",
        nodes=p_nodes.tolist(),
        edges=p_edges,
        radii=[1e-3] * len(p_edges),
        loads=[LoadInput(node_start=10, node_end=11, R=100.0)],
    )
    lossless = SolverConfiguration(include_skin_effect=False, resistivity=1e-20)
    res = solve_multi_antenna([driven, parasite], F, lossless)
    assert 0 < res["radiation_efficiency"] < 0.99
