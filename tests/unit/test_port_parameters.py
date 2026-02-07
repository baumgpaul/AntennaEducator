"""Test port parameter calculations (S11, return loss, power, etc)."""

import numpy as np

from backend.solver.solver import (
    compute_antenna_gain,
    compute_q_factor,
    compute_radiation_efficiency,
    solve_peec_frequency_sweep,
)
from backend.solver.system import VoltageSource


def test_port_parameters_simple_dipole():
    """Test that port parameters are computed correctly for a simple dipole."""

    # Simple dipole: 3 nodes, 2 edges
    nodes = np.array([[0.0, 0.0, 0.0], [0.0, 0.0, 0.25], [0.0, 0.0, 0.5]])

    edges = [[1, 2], [2, 3]]
    radii = np.array([0.001, 0.001])

    # Single frequency
    frequencies = np.array([100e6])

    # Voltage source with 50Ω impedance (connected to middle node and ground)
    voltage_sources = [VoltageSource(node_start=2, node_end=0, value=1.0, R=50.0, L=0.0, C_inv=0.0)]

    # Solve
    result = solve_peec_frequency_sweep(
        nodes=nodes,
        edges=edges,
        radii=radii,
        frequencies=frequencies,
        voltage_sources=voltage_sources,
        reference_impedance=50.0,
    )

    # Check that new parameters exist
    assert len(result.frequency_solutions) == 1
    sol = result.frequency_solutions[0]

    # Check reflection coefficient
    assert hasattr(sol, "reflection_coefficient")
    gamma = sol.reflection_coefficient
    assert isinstance(gamma, (complex, np.complexfloating))

    # Check return loss
    assert hasattr(sol, "return_loss")
    rl = sol.return_loss
    assert isinstance(rl, (float, np.floating))
    assert rl >= 0.0, "Return loss should be positive"

    # Verify relationship: RL = -20*log10(|Γ|)
    # Note: Return loss is clipped to [0, 100] dB for numerical stability
    gamma_mag = abs(gamma)
    if gamma_mag > 1e-5:  # Only check if reflection is measurable
        expected_rl = -20.0 * np.log10(gamma_mag)
        expected_rl = min(expected_rl, 100.0)  # Apply same clipping
        assert abs(rl - expected_rl) < 0.1, "Return loss doesn't match reflection coefficient"
    else:
        # For very small reflections, RL should be clipped to 100 dB
        assert rl >= 20.0, "Return loss should be high for good match"

    # Check power quantities
    assert hasattr(sol, "input_power")
    assert hasattr(sol, "reflected_power")
    assert hasattr(sol, "accepted_power")

    assert sol.input_power >= 0.0
    assert sol.reflected_power >= 0.0
    assert sol.accepted_power >= 0.0

    # Power balance: P_accepted = P_input - P_reflected
    assert abs(sol.accepted_power - (sol.input_power - sol.reflected_power)) < 1e-9

    # Reflected power should match |Γ|² * P_input
    expected_reflected = gamma_mag**2 * sol.input_power
    assert abs(sol.reflected_power - expected_reflected) < 1e-9

    # Check result-level parameters
    assert hasattr(result, "return_loss")
    assert hasattr(result, "reflection_coefficient")
    assert hasattr(result, "mismatch_loss")

    assert len(result.return_loss) == 1
    assert len(result.reflection_coefficient) == 1
    assert len(result.mismatch_loss) == 1

    # Mismatch loss: ML = -10*log10(1 - |Γ|²)
    ml = result.mismatch_loss[0]
    expected_ml = -10.0 * np.log10(1.0 - gamma_mag**2)
    assert abs(ml - expected_ml) < 0.1


def test_reflection_coefficient_limits():
    """Test reflection coefficient at perfect match and open circuit."""

    # Create simple structure
    nodes = np.array([[0, 0, 0], [0, 0, 0.1], [0, 0, 0.2]])
    edges = [[1, 2], [2, 3]]
    radii = np.array([0.001, 0.001])
    frequencies = np.array([100e6])

    # Test with 50Ω reference (connected to tip node and ground)
    voltage_sources = [VoltageSource(node_start=2, node_end=0, value=1.0, R=50.0, L=0.0, C_inv=0.0)]

    result = solve_peec_frequency_sweep(
        nodes=nodes,
        edges=edges,
        radii=radii,
        frequencies=frequencies,
        voltage_sources=voltage_sources,
        reference_impedance=50.0,
    )

    sol = result.frequency_solutions[0]
    gamma = sol.reflection_coefficient

    # |Γ| should be between 0 and 1
    gamma_mag = abs(gamma)
    assert 0.0 <= gamma_mag <= 1.0, f"Reflection coefficient magnitude {gamma_mag} out of range"

    # If impedance is close to 50Ω, reflection should be small
    Z = sol.input_impedance
    if abs(Z - 50.0) < 10.0:  # Within 10Ω of 50Ω
        assert gamma_mag < 0.3, "Expected small reflection for near-matched impedance"


def test_utility_functions():
    """Test utility functions for efficiency, gain, and Q-factor."""

    # Test radiation efficiency
    eta = compute_radiation_efficiency(
        accepted_power=10.0, power_dissipated=1.0, radiated_power=9.0
    )
    assert eta is not None
    assert 0.0 <= eta <= 1.0
    assert abs(eta - 0.9) < 1e-6

    # Test without radiated power
    eta_none = compute_radiation_efficiency(
        accepted_power=10.0, power_dissipated=1.0, radiated_power=None
    )
    assert eta_none is None

    # Test antenna gain
    gain = compute_antenna_gain(directivity=6.0, efficiency=0.8)
    assert abs(gain - 4.8) < 1e-6

    # Test Q-factor
    q = compute_q_factor(f_resonant=100e6, bandwidth=10e6)
    assert abs(q - 10.0) < 1e-6

    # Test infinite Q for zero bandwidth
    q_inf = compute_q_factor(f_resonant=100e6, bandwidth=1e-10)
    assert np.isinf(q_inf)


if __name__ == "__main__":
    test_port_parameters_simple_dipole()
    test_reflection_coefficient_limits()
    test_utility_functions()
    print("All port parameter tests passed!")
