"""PEC ground plane at z = 0 by image theory.

A λ/4 monopole over a perfect ground is half of a λ/2 dipole: Z_mono = Z_dip / 2,
and all power goes into the upper half space (directivity +3 dB, ≈ 5.15 dBi).
Without the plane, a wire fed against node 0 carries a net charge and gives an
unphysical (even negative) resistance.
"""

import numpy as np
import pytest

from backend.preprocessor.builders import create_rod, rod_to_mesh
from backend.solver.schemas import AntennaInput, VoltageSourceInput
from backend.solver.solver import (
    SolverConfiguration,
    solve_multi_antenna,
    solve_peec_frequency_sweep,
)
from backend.solver.system import VoltageSource

FREQ = 299_792_458.0  # λ = 1 m
A = 0.001
WITH_PLANE = SolverConfiguration(ground_plane=True, resistivity=1e-30)


def _monopole(n: int, height: float = 0.25, config=WITH_PLANE) -> complex:
    nodes = np.array([[0.0, 0.0, z] for z in np.linspace(0, height, n + 1)])
    edges = [[i + 1, i + 2] for i in range(n)]
    result = solve_peec_frequency_sweep(
        nodes, edges, np.full(n, A), np.array([FREQ]), [VoltageSource(0, 1, 1.0)], config=config
    )
    return result.frequency_solutions[0]


def _dipole(n_total: int, gap: float) -> complex:
    """λ/2 dipole whose gap equals the monopole's feed gap mirrored (2 × 2a)."""
    n = n_total // 2
    z_lower = np.linspace(-0.25, -gap / 2, n + 1)
    z_upper = np.linspace(gap / 2, 0.25, n + 1)
    nodes = np.array([[0.0, 0.0, z] for z in np.concatenate([z_lower, z_upper])])
    edges = [[i + 1, i + 2] for i in range(n)] + [[n + 2 + i, n + 3 + i] for i in range(n)]
    sources = [VoltageSource(0, n + 1, 0.5), VoltageSource(0, n + 2, -0.5)]
    result = solve_peec_frequency_sweep(
        nodes,
        edges,
        np.full(len(edges), A),
        np.array([FREQ]),
        sources,
        config=SolverConfiguration(resistivity=1e-30),
    )
    return result.frequency_solutions[0].input_impedance


@pytest.mark.solver
def test_monopole_is_half_a_dipole():
    z_mono = _monopole(20).input_impedance
    z_dip = _dipole(40, gap=4 * A)
    assert z_mono == pytest.approx(z_dip / 2, rel=0.05), f"{z_mono:.2f} vs {z_dip / 2:.2f}"


@pytest.mark.solver
def test_monopole_converges():
    z20, z40 = (_monopole(n).input_impedance for n in (20, 40))
    assert abs(z40 - z20) < 1.0, f"{z20:.2f} -> {z40:.2f}"


@pytest.mark.solver
def test_short_monopole_has_positive_stable_resistance():
    r = [_monopole(n, height=0.025).input_impedance.real for n in (3, 6)]
    assert 0.05 < r[0] < 0.3 and abs(r[1] - r[0]) < 0.1 * r[0], r
    no_plane = _monopole(6, height=0.025, config=SolverConfiguration(resistivity=1e-30))
    assert no_plane.input_impedance.real != pytest.approx(r[1], rel=0.5)


def test_geometry_below_the_plane_is_rejected():
    nodes = np.array([[0.0, 0.0, -0.1], [0.0, 0.0, 0.1]])
    with pytest.raises(ValueError, match="below the ground plane"):
        solve_peec_frequency_sweep(
            nodes,
            [[1, 2]],
            np.array([A]),
            np.array([FREQ]),
            [VoltageSource(0, 1, 1.0)],
            config=WITH_PLANE,
        )


def test_segment_too_short_for_the_feed_gap_is_explained():
    with pytest.raises(ValueError, match="too short for the .* feed gap"):
        _monopole(20, height=0.025)


def test_rod_over_ground_gets_no_ground_feed_warning():
    el = create_rod(
        length=0.25,
        segments=10,
        source={"type": "voltage", "amplitude": {"real": 1.0, "imag": 0.0}},
    )
    mesh = rod_to_mesh(el)
    antenna = AntennaInput(
        antenna_id="rod",
        nodes=mesh.nodes,
        edges=mesh.edges,
        radii=mesh.radii,
        voltage_sources=[
            VoltageSourceInput(node_start=s.node_start, node_end=s.node_end, value=s.amplitude)
            for s in el.sources
        ],
    )
    assert solve_multi_antenna([antenna], FREQ, WITH_PLANE)["warnings"] == []
    assert len(solve_multi_antenna([antenna], FREQ, SolverConfiguration())["warnings"]) == 1


@pytest.mark.solver
def test_far_field_over_ground():
    from backend.postprocessor.field import compute_directivity_from_pattern, compute_far_field
    from backend.postprocessor.ground_plane import add_images, lower_hemisphere

    n = 20
    sol = _monopole(n)
    nodes = np.array([[0.0, 0.0, z] for z in np.linspace(0, 0.25, n + 1)])
    edges = np.array([[i + 1, i + 2] for i in range(n)])
    currents = np.array([sol.branch_currents[:n]])
    theta = np.linspace(0, np.pi, 181)
    phi = np.linspace(0, 2 * np.pi, 72)

    nodes2, edges2, currents2 = add_images(nodes, edges, currents)
    E, _ = compute_far_field(np.array([FREQ]), currents2, nodes2, edges2, theta, phi)
    E[:, lower_hemisphere(theta)] = 0
    _, d_dbi, _, _ = compute_directivity_from_pattern(E[0, :, :, 0], E[0, :, :, 1], theta, phi)

    assert d_dbi == pytest.approx(5.15, abs=0.3)  # dipole 2.15 dBi + 3 dB
    assert np.all(E[0, theta > np.pi / 2 + 1e-9] == 0)
