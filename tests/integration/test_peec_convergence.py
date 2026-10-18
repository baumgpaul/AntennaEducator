"""Mesh convergence of the PEEC dipole impedance (issue #71).

λ/2 dipole, a = λ/1000, thin balanced gap. Before the reduced thin-wire kernel
was used for the mutual L and P terms, the reactance fell from +31 to -0.3 Ohm
between 40 and 320 segments instead of converging.

Reference: an independent Hallén integral-equation MoM (centre delta-gap,
pulse basis, reduced kernel) gives 88-89 + j49-50 Ohm for this dipole; the
PEEC values converge to about 86.5 + j44 Ohm. The textbook 73 + j42.5 Ohm is the
infinitely thin limit (a -> 0).
"""

import numpy as np
import pytest

from backend.solver.solver import solve_peec_frequency_sweep
from backend.solver.system import VoltageSource

LAMBDA = 1.0
FREQ = 299_792_458.0 / LAMBDA
RADIUS = LAMBDA / 1000
GAP = LAMBDA / 1000


def _dipole_impedance(
    n_total: int, gap: float = GAP, length: float = LAMBDA / 2, radius: float = RADIUS
) -> complex:
    n = n_total // 2
    z_lower = np.linspace(-length / 2, -gap / 2, n + 1)
    z_upper = np.linspace(gap / 2, length / 2, n + 1)
    nodes = np.array([[0.0, 0.0, z] for z in np.concatenate([z_lower, z_upper])])
    edges = [[i + 1, i + 2] for i in range(n)] + [[n + 2 + i, n + 3 + i] for i in range(n)]
    sources = [
        VoltageSource(node_start=0, node_end=n + 1, value=0.5),
        VoltageSource(node_start=0, node_end=n + 2, value=-0.5),
    ]
    result = solve_peec_frequency_sweep(
        nodes, edges, np.full(len(edges), radius), np.array([FREQ]), voltage_sources=sources
    )
    return result.frequency_solutions[0].input_impedance


@pytest.fixture(scope="module")
def z_coarse():
    return _dipole_impedance(40)


@pytest.fixture(scope="module")
def z_fine():
    return _dipole_impedance(160)


@pytest.mark.solver
def test_reactance_converges_with_refinement(z_coarse, z_fine):
    assert abs(z_fine.imag - z_coarse.imag) < 3.0, f"{z_coarse:.2f} -> {z_fine:.2f}"
    assert abs(z_fine.real - z_coarse.real) < 2.0, f"{z_coarse:.2f} -> {z_fine:.2f}"


@pytest.mark.solver
def test_impedance_close_to_hallen_reference(z_fine):
    assert 80.0 < z_fine.real < 92.0, f"R = {z_fine.real:.2f} Ohm"
    assert 38.0 < z_fine.imag < 52.0, f"X = {z_fine.imag:.2f} Ohm"


@pytest.mark.solver
def test_wider_gap_shortens_the_dipole(z_fine):
    """A wider gap removes conductor length, so the reactance must drop."""
    z_wide = _dipole_impedance(160, gap=LAMBDA / 200)
    assert z_wide.imag < z_fine.imag - 5.0, f"{z_wide:.2f} vs {z_fine:.2f}"


@pytest.mark.solver
def test_short_dipole_radiation_resistance():
    """L = 0.05 λ: R_rad ≈ 20π²(L/λ)² ≈ 0.49 Ohm for an ideal thin dipole; the
    gap capacitance of the delta-gap feed lowers R_in to ~0.36 Ohm (an
    independent Hallén MoM gives 0.37-0.43). Without the exact first-order
    retardation term on the diagonal, PEEC gave ~4 Ohm."""
    z20, z40 = (_dipole_impedance(n, gap=0.0025, length=0.05, radius=0.0005) for n in (20, 40))
    assert 0.25 < z40.real < 0.5, f"R = {z40.real:.3f} Ohm"
    assert abs(z40.real - z20.real) < 0.05 * z40.real, f"{z20:.3f} -> {z40:.3f}"


def _solve_lossy(resistivity: float, n: int = 40):
    from backend.solver.solver import SolverConfiguration

    z_lower = np.linspace(-LAMBDA / 4, -GAP / 2, n + 1)
    z_upper = np.linspace(GAP / 2, LAMBDA / 4, n + 1)
    nodes = np.array([[0.0, 0.0, z] for z in np.concatenate([z_lower, z_upper])])
    edges = [[i + 1, i + 2] for i in range(n)] + [[n + 2 + i, n + 3 + i] for i in range(n)]
    sources = [
        VoltageSource(node_start=0, node_end=n + 1, value=0.5),
        VoltageSource(node_start=0, node_end=n + 2, value=-0.5),
    ]
    config = SolverConfiguration(resistivity=resistivity, include_skin_effect=False)
    return solve_peec_frequency_sweep(
        nodes,
        edges,
        np.full(len(edges), RADIUS),
        np.array([FREQ]),
        voltage_sources=sources,
        config=config,
    ).frequency_solutions[0]


@pytest.mark.solver
def test_dissipated_power_balances_input_power():
    """Issue #72: P_in = P_loss + P_rad with both powers as 1/2 Re(...) of peak
    phasors. A very resistive wire loses ~10 % of the input; the missing 1/2
    doubled that and broke the balance by ~10 %."""
    r_rad = _solve_lossy(1e-30).input_impedance.real
    sol = _solve_lossy(1e-4)
    p_rad = 0.5 * r_rad * abs(sol.input_current) ** 2
    imbalance = (sol.input_power - sol.power_dissipated - p_rad) / sol.input_power
    assert sol.power_dissipated > 0.05 * sol.input_power
    assert abs(imbalance) < 0.01, f"imbalance {imbalance:+.4f}"
