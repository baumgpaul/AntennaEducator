"""Energy conservation of the PEEC solution: P_in = P_rad (lossless wires).

P_in is the port power 1/2 Re(V I*); P_rad integrates the far field of the PEEC
branch currents over the sphere. No external reference is needed, and it checks
two things the impedance alone does not:

- the absolute radiated power of the far-field chain (compute_far_field returns
  E at r = 1000 m; the intensity used to miss the r² and was 1e6 too small),
- the feed model: a balanced feed solved as two sources to node 0 (infinity)
  lets a common-mode current flow there in asymmetric surroundings, which shows
  up as power that the far field does not account for.
"""

import numpy as np
import pytest

from backend.postprocessor.field import FAR_FIELD_DISTANCE, compute_far_field
from backend.postprocessor.pattern import compute_radiation_intensity, compute_total_radiated_power
from backend.solver.solver import SolverConfiguration, solve_peec_frequency_sweep
from backend.solver.system import VoltageSource

A, F = 1e-3, 300e6
LOSSLESS = SolverConfiguration(include_skin_effect=False, resistivity=1e-20)


def _dipole(n=12, length=0.48, gap=0.005):
    lo = np.linspace(-(length - gap) / 2, -gap / 2, n + 1)
    hi = np.linspace(gap / 2, (length - gap) / 2, n + 1)
    z = np.r_[lo, hi]
    nodes = np.column_stack([0 * z, 0 * z, z])
    edges = [[i + 1, i + 2] for i in range(n)] + [[n + 2 + i, n + 3 + i] for i in range(n)]
    return nodes, edges, n + 1, n + 2


def _wire(x, z0, length, n):
    z = np.linspace(z0 - length / 2, z0 + length / 2, n + 1)
    return np.column_stack([np.full_like(z, x), 0 * z, z]), [[i + 1, i + 2] for i in range(n)]


def _powers(parasites, source_groups=None, n_theta=181, n_phi=360):
    nodes, edges, lo, up = _dipole()
    for p_nodes, p_edges in parasites:
        off = len(nodes)
        nodes = np.vstack([nodes, p_nodes])
        edges = edges + [[a + off, b + off] for a, b in p_edges]
    sources = [VoltageSource(0, lo, 0.5), VoltageSource(0, up, -0.5)]  # as stored
    sol = solve_peec_frequency_sweep(
        nodes,
        edges,
        np.full(len(edges), A),
        np.array([F]),
        sources,
        config=LOSSLESS,
        source_groups=source_groups,
    ).frequency_solutions[0]
    theta = np.linspace(0, np.pi, n_theta)
    phi = np.linspace(0, 2 * np.pi, n_phi + 1)  # both ends: trapezoid over the full circle
    currents = np.array([sol.branch_currents[: len(edges)]])
    E, _ = compute_far_field(np.array([F]), currents, nodes, edges, theta, phi)
    U = compute_radiation_intensity(E[0, :, :, 0], E[0, :, :, 1], distance=FAR_FIELD_DISTANCE)
    return sol.input_power, compute_total_radiated_power(U, theta, phi)


CASES = {
    "symmetric dipole": [],
    "reflector shifted 0.15 m along the axis": [_wire(-0.15, 0.15, 0.52, 26)],
    "offset 3-element Yagi": [_wire(-0.15, 0.1, 0.52, 26), _wire(0.12, 0.1, 0.44, 22)],
}


@pytest.mark.parametrize("name", list(CASES))
def test_input_power_is_radiated(name):
    p_in, p_rad = _powers(CASES[name])
    assert p_rad == pytest.approx(p_in, rel=0.02), f"P_in {p_in:.5f} W, P_rad {p_rad:.5f} W"


def test_the_balance_detects_a_common_mode_feed():
    """Control: the same structure with the balanced pair left as two sources to
    infinity (different source groups prevent the merge) breaks the balance, so
    the test above can fail."""
    p_in, p_rad = _powers(CASES["reflector shifted 0.15 m along the axis"], source_groups=[0, 1])
    assert abs(p_rad / p_in - 1) > 0.05


def test_far_field_power_is_absolute_not_relative():
    """Half-wave-ish dipole: P_rad = 1/2 R_in |I|² with R_in ≈ 60-90 Ohm, i.e. watts
    of the right size (it was 1e6 too small without r²)."""
    p_in, p_rad = _powers([])
    assert 1e-3 < p_rad < 1e-1


def test_far_field_service_reports_the_radiated_power():
    """The far-field endpoint's radiated_power equals the input power of the solve."""
    from backend.postprocessor.compute import far_field_result
    from backend.postprocessor.models import FarFieldRequest

    nodes, edges, lo, up = _dipole()
    sol = solve_peec_frequency_sweep(
        nodes,
        edges,
        np.full(len(edges), A),
        np.array([F]),
        [VoltageSource(0, lo, 0.5), VoltageSource(0, up, -0.5)],
        config=LOSSLESS,
    ).frequency_solutions[0]
    request = FarFieldRequest(
        frequencies=[F],
        branch_currents=[
            [{"real": c.real, "imag": c.imag} for c in sol.branch_currents[: len(edges)]]
        ],
        nodes=nodes.tolist(),
        edges=edges,
        radii=[A] * len(edges),
        theta_points=91,
        phi_points=73,
    )
    response = far_field_result(request)
    assert response.radiated_power == pytest.approx(sol.input_power, rel=0.03)
