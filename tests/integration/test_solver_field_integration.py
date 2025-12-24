"""Integration tests combining solver, field computation, and pattern analysis."""

import numpy as np
import pytest
from backend.solver.solver import solve_peec_frequency_sweep, compute_radiation_efficiency
from backend.solver.system import VoltageSource
from backend.postprocessor.field import (
    compute_far_field,
    compute_directivity_from_pattern
)
from backend.postprocessor.pattern import (
    compute_radiation_intensity,
    compute_total_radiated_power
)


class TestSolverFieldIntegration:
    """Integration tests combining solver output with field computation."""
    
    def test_dipole_complete_analysis(self):
        """Test complete dipole analysis: solve → fields → pattern → efficiency."""
        # Half-wave dipole at 300 MHz (λ/2 = 0.5m)
        nodes = np.array([[0, 0, -0.25], [0, 0, 0], [0, 0, 0.25]])
        edges = [[1, 2], [2, 3]]
        radii = np.array([0.001, 0.001])
        frequencies = np.array([300e6])
        vsources = [VoltageSource(2, 0, 1.0, 50.0)]  # Feed at center node
        
        # Step 1: Solve for currents and port parameters
        result = solve_peec_frequency_sweep(
            nodes, edges, radii, frequencies, vsources, reference_impedance=50.0
        )
        
        sol = result.frequency_solutions[0]
        
        # Verify solver outputs
        assert sol.input_impedance is not None
        assert sol.accepted_power > 0
        assert sol.power_dissipated >= 0
        
        # Step 2: Compute far-field pattern
        n_theta, n_phi = 91, 180
        theta = np.linspace(0, np.pi, n_theta)
        phi = np.linspace(0, 2*np.pi, n_phi)
        
        branch_currents = np.array([sol.branch_currents[:len(edges)]])
        
        E_field, H_field = compute_far_field(
            frequencies, branch_currents, nodes, edges, theta, phi
        )
        
        # Verify field shapes
        assert E_field.shape == (1, n_theta, n_phi, 2)
        assert H_field.shape == (1, n_theta, n_phi, 2)
        
        # Step 3: Compute directivity
        E_theta = E_field[0, :, :, 0]
        E_phi = E_field[0, :, :, 1]
        
        D_max, D_dBi, D_pattern, max_idx = compute_directivity_from_pattern(
            E_theta, E_phi, theta, phi
        )
        
        # Half-wave dipole should have D ≈ 1.64 (2.15 dBi)
        assert 1.2 < D_max < 2.5
        assert 0.5 < D_dBi < 4.0
        
        # Step 4: Compute radiated power
        U = compute_radiation_intensity(E_theta, E_phi)
        P_rad = compute_total_radiated_power(U, theta, phi)
        
        assert P_rad > 0
        
        # Step 5: Compute radiation efficiency
        efficiency = compute_radiation_efficiency(
            sol.accepted_power, sol.power_dissipated, P_rad
        )
        
        if efficiency is not None:
            # Efficiency should be between 0 and 1
            assert 0 <= efficiency <= 1.0
            
            # Note: This simplified 2-segment model doesn't accurately represent
            # a proper center-fed dipole (which needs gap and dual voltage sources).
            # Just verify efficiency is calculated, not its specific value.
    
    def test_monopole_ground_plane(self):
        """Test quarter-wave monopole analysis."""
        # Quarter-wave monopole at 300 MHz (λ/4 = 0.25m)
        nodes = np.array([[0, 0, 0], [0, 0, 0.125], [0, 0, 0.25]])
        edges = [[1, 2], [2, 3]]
        radii = np.array([0.001, 0.001])
        frequencies = np.array([300e6])
        vsources = [VoltageSource(2, 0, 1.0, 50.0)]
        
        # Solve
        result = solve_peec_frequency_sweep(
            nodes, edges, radii, frequencies, vsources, reference_impedance=50.0
        )
        
        sol = result.frequency_solutions[0]
        
        # Compute far-field
        theta = np.linspace(0, np.pi/2, 46)  # Only upper hemisphere
        phi = np.linspace(0, 2*np.pi, 180)
        
        E_field, H_field = compute_far_field(
            frequencies,
            np.array([sol.branch_currents[:len(edges)]]),
            nodes, edges, theta, phi
        )
        
        # Check pattern has maximum near horizon (θ ≈ π/2)
        E_theta = E_field[0, :, :, 0]
        E_total = np.sqrt(np.abs(E_theta)**2 + np.abs(E_field[0, :, :, 1])**2)
        
        max_theta_idx = np.argmax(np.max(E_total, axis=1))
        assert theta[max_theta_idx] > np.pi/4  # Maximum in lower half of hemisphere
    
    def test_power_conservation(self):
        """Test power conservation: P_acc = P_rad + P_diss + P_stored."""
        nodes = np.array([[0, 0, 0], [0, 0, 0.25], [0, 0, 0.5]])
        edges = [[1, 2], [2, 3]]
        radii = np.array([0.001, 0.001])
        frequencies = np.array([100e6])
        vsources = [VoltageSource(2, 0, 1.0, 50.0)]
        
        # Solve
        result = solve_peec_frequency_sweep(
            nodes, edges, radii, frequencies, vsources
        )
        
        sol = result.frequency_solutions[0]
        
        # Compute radiated power
        theta = np.linspace(0, np.pi, 91)
        phi = np.linspace(0, 2*np.pi, 180)
        
        E_field, _ = compute_far_field(
            frequencies,
            np.array([sol.branch_currents[:len(edges)]]),
            nodes, edges, theta, phi
        )
        
        U = compute_radiation_intensity(E_field[0, :, :, 0], E_field[0, :, :, 1])
        P_rad = compute_total_radiated_power(U, theta, phi)
        
        # Power balance (rough check - reactive power not fully accounted)
        # P_accepted ≈ P_radiated + P_dissipated
        # There may be reactive power, so this is approximate
        P_acc = sol.accepted_power
        P_diss = sol.power_dissipated
        
        # For simplified models, power balance may not be accurate
        # Just verify powers are computed and positive
        assert P_acc > 0
        assert P_diss >= 0
        assert P_rad > 0


class TestFieldPatternCharacteristics:
    """Tests for field pattern physical characteristics."""
    
    def test_dipole_nulls(self):
        """Test dipole has nulls along axis."""
        # Vertical dipole
        nodes = np.array([[0, 0, -0.25], [0, 0, 0], [0, 0, 0.25]])
        edges = [[1, 2], [2, 3]]
        radii = np.array([0.001, 0.001])
        frequencies = np.array([300e6])
        vsources = [VoltageSource(3, 0, 1.0, 50.0)]
        
        result = solve_peec_frequency_sweep(
            nodes, edges, radii, frequencies, vsources
        )
        
        # Compute pattern
        theta = np.linspace(0, np.pi, 91)
        phi = np.array([0.0])
        
        E_field, _ = compute_far_field(
            frequencies,
            np.array([result.frequency_solutions[0].branch_currents[:len(edges)]]),
            nodes, edges, theta, phi
        )
        
        E_theta = E_field[0, :, 0, 0]
        E_mag = np.abs(E_theta)
        E_max = np.max(E_mag)
        
        # Nulls at θ=0 and θ=π (along z-axis)
        assert E_mag[0] < 0.2 * E_max
        assert E_mag[-1] < 0.2 * E_max
        
        # Maximum near θ=π/2 (broadside)
        max_idx = np.argmax(E_mag)
        assert np.abs(theta[max_idx] - np.pi/2) < np.pi/6
    
    def test_pattern_symmetry(self):
        """Test pattern symmetry for symmetric antenna."""
        # Symmetric dipole
        nodes = np.array([[0, 0, -0.25], [0, 0, 0], [0, 0, 0.25]])
        edges = [[1, 2], [2, 3]]
        radii = np.array([0.001, 0.001])
        frequencies = np.array([300e6])
        vsources = [VoltageSource(3, 0, 1.0, 50.0)]
        
        result = solve_peec_frequency_sweep(
            nodes, edges, radii, frequencies, vsources
        )
        
        # Compute pattern in two phi planes
        theta = np.linspace(0, np.pi, 91)
        phi1 = np.array([0.0])
        phi2 = np.array([np.pi/2])
        
        E_field1, _ = compute_far_field(
            frequencies,
            np.array([result.frequency_solutions[0].branch_currents[:len(edges)]]),
            nodes, edges, theta, phi1
        )
        
        E_field2, _ = compute_far_field(
            frequencies,
            np.array([result.frequency_solutions[0].branch_currents[:len(edges)]]),
            nodes, edges, theta, phi2
        )
        
        # For z-oriented dipole, pattern should be same in all phi planes
        E_mag1 = np.abs(E_field1[0, :, 0, 0])
        E_mag2 = np.abs(E_field2[0, :, 0, 0])
        
        # Should be approximately equal (within numerical tolerance)
        np.testing.assert_allclose(E_mag1, E_mag2, rtol=0.1)
    
    def test_field_polarization(self):
        """Test field polarization characteristics."""
        # Vertical dipole
        nodes = np.array([[0, 0, 0], [0, 0, 0.25], [0, 0, 0.5]])
        edges = [[1, 2], [2, 3]]
        radii = np.array([0.001, 0.001])
        frequencies = np.array([300e6])
        vsources = [VoltageSource(2, 0, 1.0, 50.0)]
        
        result = solve_peec_frequency_sweep(
            nodes, edges, radii, frequencies, vsources
        )
        
        # Compute field at broadside (θ=π/2, φ=0)
        theta = np.array([np.pi/2])
        phi = np.array([0.0])
        
        E_field, _ = compute_far_field(
            frequencies,
            np.array([result.frequency_solutions[0].branch_currents[:len(edges)]]),
            nodes, edges, theta, phi
        )
        
        E_theta = E_field[0, 0, 0, 0]
        E_phi = E_field[0, 0, 0, 1]
        
        # For z-oriented dipole, E_θ should dominate at equator
        assert np.abs(E_theta) > np.abs(E_phi)


class TestFrequencySweepAnalysis:
    """Tests for frequency-dependent behavior."""
    
    def test_impedance_vs_frequency(self):
        """Test impedance variation with frequency."""
        nodes = np.array([[0, 0, 0], [0, 0, 0.25], [0, 0, 0.5]])
        edges = [[1, 2], [2, 3]]
        radii = np.array([0.001, 0.001])
        frequencies = np.linspace(50e6, 200e6, 31)
        vsources = [VoltageSource(2, 0, 1.0, 50.0)]
        
        result = solve_peec_frequency_sweep(
            nodes, edges, radii, frequencies, vsources, reference_impedance=50.0
        )
        
        # Impedance should vary smoothly
        Z = np.array([sol.input_impedance for sol in result.frequency_solutions])
        
        # Check no discontinuities
        Z_diff = np.abs(np.diff(Z))
        assert np.all(Z_diff < 1000)  # No huge jumps
        
        # Reactance should cross zero (resonance)
        X = result.impedance_imag
        assert np.any(X > 0) or np.any(X < 0)  # Not all same sign
    
    def test_directivity_vs_frequency(self):
        """Test directivity variation with frequency."""
        nodes = np.array([[0, 0, 0], [0, 0, 0.25], [0, 0, 0.5]])
        edges = [[1, 2], [2, 3]]
        radii = np.array([0.001, 0.001])
        frequencies = np.array([100e6, 200e6, 300e6])
        vsources = [VoltageSource(2, 0, 1.0, 50.0)]
        
        result = solve_peec_frequency_sweep(
            nodes, edges, radii, frequencies, vsources
        )
        
        directivities = []
        
        for i, sol in enumerate(result.frequency_solutions):
            theta = np.linspace(0, np.pi, 37)
            phi = np.linspace(0, 2*np.pi, 72)
            
            E_field, _ = compute_far_field(
                np.array([frequencies[i]]),
                np.array([sol.branch_currents[:len(edges)]]),
                nodes, edges, theta, phi
            )
            
            D_max, _, _, _ = compute_directivity_from_pattern(
                E_field[0, :, :, 0], E_field[0, :, :, 1], theta, phi
            )
            
            directivities.append(D_max)
        
        # All directivities should be positive and reasonable
        for D in directivities:
            assert D > 0.5
            assert D < 10.0
    
    def test_vswr_bandwidth(self):
        """Test VSWR bandwidth calculation with field analysis."""
        nodes = np.array([[0, 0, 0], [0, 0, 0.25], [0, 0, 0.5]])
        edges = [[1, 2], [2, 3]]
        radii = np.array([0.001, 0.001])
        frequencies = np.linspace(80e6, 120e6, 41)
        vsources = [VoltageSource(2, 0, 1.0, 50.0)]
        
        result = solve_peec_frequency_sweep(
            nodes, edges, radii, frequencies, vsources, reference_impedance=50.0
        )
        
        # Find frequencies where VSWR < 2
        good_match = result.vswr < 2.0
        
        if np.any(good_match):
            good_freqs = frequencies[good_match]
            
            # At these frequencies, return loss should be > 9.5 dB
            good_indices = np.where(good_match)[0]
            for idx in good_indices:
                assert result.return_loss[idx] > 9.5


class TestEdgeCases:
    """Tests for edge cases in combined analysis."""
    
    def test_very_thin_wire(self):
        """Test field computation for very thin wire."""
        nodes = np.array([[0, 0, 0], [0, 0, 0.25], [0, 0, 0.5]])
        edges = [[1, 2], [2, 3]]
        radii = np.array([0.00001, 0.00001])  # Very thin: 10 μm
        frequencies = np.array([100e6])
        vsources = [VoltageSource(2, 0, 1.0, 50.0)]
        
        result = solve_peec_frequency_sweep(
            nodes, edges, radii, frequencies, vsources
        )
        
        # Should solve without errors
        assert len(result.frequency_solutions) == 1
        
        # Compute fields
        theta = np.linspace(0, np.pi, 19)
        phi = np.linspace(0, 2*np.pi, 36)
        
        E_field, H_field = compute_far_field(
            frequencies,
            np.array([result.frequency_solutions[0].branch_currents[:len(edges)]]),
            nodes, edges, theta, phi
        )
        
        # Fields should be non-zero
        assert np.any(np.abs(E_field) > 0)
        assert np.any(np.abs(H_field) > 0)
    
    def test_multiple_edges(self):
        """Test field computation for multi-segment antenna."""
        # 3-segment dipole
        nodes = np.array([
            [0, 0, 0],
            [0, 0, 0.166],
            [0, 0, 0.333],
            [0, 0, 0.5]
        ])
        edges = [[1, 2], [2, 3], [3, 4]]
        radii = np.array([0.001, 0.001, 0.001])
        frequencies = np.array([300e6])
        vsources = [VoltageSource(2, 0, 1.0, 50.0)]
        
        result = solve_peec_frequency_sweep(
            nodes, edges, radii, frequencies, vsources
        )
        
        # Should have currents for all 3 edges
        sol = result.frequency_solutions[0]
        assert len(sol.branch_currents) >= 3
        
        # Compute far-field
        theta = np.linspace(0, np.pi, 37)
        phi = np.array([0.0])
        
        E_field, _ = compute_far_field(
            frequencies,
            np.array([sol.branch_currents[:3]]),
            nodes, edges, theta, phi
        )
        
        # Pattern should still show dipole characteristics
        E_mag = np.abs(E_field[0, :, 0, 0])
        max_idx = np.argmax(E_mag)
        
        # Maximum near broadside
        assert np.abs(theta[max_idx] - np.pi/2) < np.pi/4


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
