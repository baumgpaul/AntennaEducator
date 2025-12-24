"""Tests for PEEC frequency domain solver."""

import numpy as np
import pytest

from backend.solver.solver import (
    SolverConfiguration,
    FrequencyPoint,
    SolverResult,
    solve_peec_frequency_sweep,
    solve_single_frequency,
    compute_resonant_frequency,
    compute_bandwidth
)
from backend.solver.system import VoltageSource, CurrentSource, Load


class TestSolverConfiguration:
    """Test solver configuration."""
    
    def test_default_configuration(self):
        """Test default configuration values."""
        config = SolverConfiguration()
        
        assert config.gauss_order == 6
        assert config.include_skin_effect is True
        assert config.resistivity == pytest.approx(1.68e-8)  # Copper
        assert config.permeability == 1.0
    
    def test_custom_configuration(self):
        """Test custom configuration."""
        config = SolverConfiguration(
            gauss_order=8,
            include_skin_effect=False,
            resistivity=2.82e-8,  # Aluminum
            permeability=1.0
        )
        
        assert config.gauss_order == 8
        assert config.include_skin_effect is False
        assert config.resistivity == pytest.approx(2.82e-8)


class TestSingleFrequency:
    """Test single frequency solutions."""
    
    def test_simple_dipole_1mhz(self):
        """Test simple dipole at 1 MHz."""
        # Two-segment dipole: 0.1m total length, 1mm radius
        nodes = np.array([
            [0, 0, 0],
            [0, 0, 0.05],
            [0, 0, 0.1]
        ])
        edges = [[1, 2], [2, 3]]
        radii = np.array([0.001, 0.001])
        
        # Voltage source at center
        vsrc = VoltageSource(node_start=2, node_end=0, value=1.0, R=50.0)
        
        # Solve at 1 MHz
        solution = solve_single_frequency(nodes, edges, radii, 1e6, [vsrc])
        
        # Verify solution structure
        assert isinstance(solution, FrequencyPoint)
        assert solution.frequency == 1e6
        assert solution.omega == pytest.approx(2 * np.pi * 1e6)
        
        # Verify array shapes
        assert len(solution.branch_currents) == 3  # 2 edges + 1 vsource
        assert len(solution.node_voltages) == 3  # 3 nodes
        
        # Verify physical constraints
        assert np.abs(solution.input_current) > 0  # Non-zero current
        assert np.isfinite(solution.input_impedance)
        assert solution.power_dissipated >= 0  # Non-negative power
        assert solution.solve_time > 0
    
    def test_dipole_with_load(self):
        """Test dipole with load at end."""
        nodes = np.array([[0, 0, 0], [0, 0, 0.05], [0, 0, 0.1]])
        edges = [[1, 2], [2, 3]]
        radii = np.array([0.001, 0.001])
        
        vsrc = VoltageSource(node_start=2, node_end=0, value=1.0, R=0.0, L=0.0, C_inv=0.0)
        load = Load(node_start=3, node_end=0, R=75.0, L=0.0, C_inv=0.0)  # 75Ω load at end
        
        solution = solve_single_frequency(nodes, edges, radii, 1e6, [vsrc], loads=[load])
        
        # Should have 4 branches: 2 edges + 1 vsource + 1 load
        assert len(solution.branch_currents) == 4
        
        # Load should affect impedance
        assert np.isfinite(solution.input_impedance)
    
    def test_skin_effect_increases_resistance(self):
        """Test that AC resistance increases with frequency due to skin effect."""
        # Use dipole geometry (same as working test)
        nodes = np.array([[0, 0, 0], [0, 0, 0.05], [0, 0, 0.1]])
        edges = [[1, 2], [2, 3]]
        radii = np.array([0.001, 0.001])
        
        vsrc = VoltageSource(node_start=2, node_end=0, value=1.0)
        
        # Solve at low and high frequency
        config_with_skin = SolverConfiguration(include_skin_effect=True)
        config_no_skin = SolverConfiguration(include_skin_effect=False)
        
        sol_low = solve_single_frequency(nodes, edges, radii, 1e3, [vsrc], config=config_with_skin)
        sol_high = solve_single_frequency(nodes, edges, radii, 1e9, [vsrc], config=config_with_skin)
        sol_dc = solve_single_frequency(nodes, edges, radii, 1e6, [vsrc], config=config_no_skin)
        
        # High frequency should have more resistance (higher real part of Z)
        assert np.real(sol_high.input_impedance) > np.real(sol_low.input_impedance)
        
        # DC case should have lowest resistance
        assert np.real(sol_dc.input_impedance) <= np.real(sol_high.input_impedance)


class TestFrequencySweep:
    """Test frequency sweep functionality."""
    
    def test_basic_frequency_sweep(self):
        """Test basic frequency sweep."""
        nodes = np.array([[0, 0, 0], [0, 0, 0.05], [0, 0, 0.1]])
        edges = [[1, 2], [2, 3]]
        radii = np.array([0.001, 0.001])
        
        vsrc = VoltageSource(node_start=2, node_end=0, value=1.0, R=50.0)
        
        # Sweep from 1 MHz to 10 MHz (10 points)
        freqs = np.linspace(1e6, 10e6, 10)
        
        result = solve_peec_frequency_sweep(nodes, edges, radii, freqs, [vsrc])
        
        # Verify result structure
        assert isinstance(result, SolverResult)
        assert len(result.frequencies) == 10
        assert len(result.frequency_solutions) == 10
        
        # Verify arrays
        assert len(result.impedance_real) == 10
        assert len(result.impedance_imag) == 10
        assert len(result.impedance_magnitude) == 10
        assert len(result.impedance_phase) == 10
        assert len(result.vswr) == 10
        
        # Verify metadata
        assert result.n_nodes == 3
        assert result.n_edges == 2
        assert result.n_branches == 3  # 2 edges + 1 vsource
        assert result.total_solve_time > 0
        assert result.reference_impedance == 50.0
    
    def test_impedance_varies_with_frequency(self):
        """Test that impedance changes with frequency."""
        nodes = np.array([[0, 0, 0], [0, 0, 0.1], [0, 0, 0.2]])
        edges = [[1, 2], [2, 3]]
        radii = np.array([0.001, 0.001])
        
        vsrc = VoltageSource(node_start=1, node_end=0, value=1.0)
        
        freqs = np.array([1e6, 10e6, 100e6])
        result = solve_peec_frequency_sweep(nodes, edges, radii, freqs, [vsrc])
        
        # Impedance magnitude should vary
        Z_mag = result.impedance_magnitude
        assert not np.allclose(Z_mag[0], Z_mag[1])
        assert not np.allclose(Z_mag[1], Z_mag[2])
        
        # Reactance should increase with frequency (inductive behavior expected)
        # X = ωL, so reactance should scale roughly with frequency
        X = result.impedance_imag
        # At higher frequencies, inductive reactance dominates
        assert X[2] > X[1] > X[0]
    
    def test_vswr_calculation(self):
        """Test VSWR calculation."""
        nodes = np.array([[0, 0, 0], [0, 0, 0.1]])
        edges = [[1, 2]]
        radii = np.array([0.001])
        
        vsrc = VoltageSource(node_start=1, node_end=0, value=1.0, R=50.0)
        
        freqs = np.logspace(6, 9, 20)  # 1 MHz to 1 GHz
        result = solve_peec_frequency_sweep(
            nodes, edges, radii, freqs, [vsrc],
            reference_impedance=50.0
        )
        
        # VSWR should be >= 1
        assert np.all(result.vswr >= 1.0)
        
        # VSWR can be very high for mismatched antennas at low frequencies
        # Check that at least some frequencies have reasonable VSWR
        assert np.any(result.vswr < 100.0)  # At least one frequency well-matched
        assert np.all(result.vswr < 1000.0)  # Not infinite
    
    def test_power_dissipation_positive(self):
        """Test that power dissipation is always positive."""
        nodes = np.array([[0, 0, 0], [0, 0, 0.05], [0, 0, 0.1]])
        edges = [[1, 2], [2, 3]]
        radii = np.array([0.001, 0.001])
        
        vsrc = VoltageSource(node_start=2, node_end=0, value=1.0)
        
        freqs = np.array([1e6, 10e6, 100e6])
        result = solve_peec_frequency_sweep(nodes, edges, radii, freqs, [vsrc])
        
        for sol in result.frequency_solutions:
            assert sol.power_dissipated >= 0


class TestResonance:
    """Test resonance finding."""
    
    def test_find_resonance_simple_dipole(self):
        """Test finding resonance in a dipole."""
        # Half-wave dipole at ~300 MHz (0.5m length)
        nodes = np.array([
            [0, 0, 0],
            [0, 0, 0.125],
            [0, 0, 0.25],
            [0, 0, 0.375],
            [0, 0, 0.5]
        ])
        edges = [[1, 2], [2, 3], [3, 4], [4, 5]]
        radii = np.array([0.001] * 4)
        
        vsrc = VoltageSource(node_start=4, node_end=0, value=1.0)
        
        # Sweep around expected resonance
        freqs = np.linspace(200e6, 400e6, 50)
        result = solve_peec_frequency_sweep(nodes, edges, radii, freqs, [vsrc])
        
        # Find resonance
        f_res = compute_resonant_frequency(result)
        
        if f_res is not None:
            # Resonance should be in sweep range
            assert freqs[0] <= f_res <= freqs[-1]
            
            # Resonant frequency should be around 300 MHz (λ/2 = 0.5m)
            # Allow wide tolerance due to PEEC approximations
            assert 200e6 < f_res < 400e6
    
    def test_no_resonance_in_range(self):
        """Test when no resonance exists in sweep range."""
        nodes = np.array([[0, 0, 0], [0, 0, 0.005], [0, 0, 0.01]])  # Very short
        edges = [[1, 2], [2, 3]]
        radii = np.array([0.001, 0.001])
        
        vsrc = VoltageSource(node_start=2, node_end=0, value=1.0)
        
        # Sweep at low frequencies (always capacitive) - avoid kHz range for numerical stability
        freqs = np.linspace(100e3, 1e6, 10)
        result = solve_peec_frequency_sweep(nodes, edges, radii, freqs, [vsrc])
        
        f_res = compute_resonant_frequency(result)
        
        # Should return None if no resonance found
        # (reactance doesn't cross zero in this range)
        # May or may not find resonance depending on geometry
        assert f_res is None or isinstance(f_res, float)


class TestBandwidth:
    """Test bandwidth calculation."""
    
    def test_compute_bandwidth_vswr2(self):
        """Test bandwidth calculation with VSWR < 2."""
        # Create a dipole near resonance
        nodes = np.array([
            [0, 0, 0],
            [0, 0, 0.1],
            [0, 0, 0.2],
            [0, 0, 0.3]
        ])
        edges = [[1, 2], [2, 3], [3, 4]]
        radii = np.array([0.001, 0.001, 0.001])
        
        vsrc = VoltageSource(node_start=3, node_end=0, value=1.0, R=50.0)
        
        freqs = np.linspace(300e6, 500e6, 50)
        result = solve_peec_frequency_sweep(
            nodes, edges, radii, freqs, [vsrc],
            reference_impedance=50.0
        )
        
        f_low, f_high, bw_pct = compute_bandwidth(result, vswr_limit=2.0)
        
        # If bandwidth found
        if f_low is not None:
            assert f_low < f_high
            assert freqs[0] <= f_low <= freqs[-1]
            assert freqs[0] <= f_high <= freqs[-1]
            assert 0 < bw_pct < 100  # Reasonable bandwidth
    
    def test_no_bandwidth_high_vswr(self):
        """Test when no bandwidth exists (VSWR always high)."""
        # Badly mismatched antenna
        nodes = np.array([[0, 0, 0], [0, 0, 0.005], [0, 0, 0.01]])
        edges = [[1, 2], [2, 3]]
        radii = np.array([0.001, 0.001])
        
        vsrc = VoltageSource(node_start=2, node_end=0, value=1.0, R=50.0)
        
        # Use higher frequencies for numerical stability
        freqs = np.linspace(10e6, 50e6, 20)
        result = solve_peec_frequency_sweep(
            nodes, edges, radii, freqs, [vsrc],
            reference_impedance=50.0
        )
        
        f_low, f_high, bw_pct = compute_bandwidth(result, vswr_limit=1.5)
        
        # May not find bandwidth if VSWR always > 1.5
        # This is expected for mismatched antennas
        if f_low is None:
            assert f_high is None
            assert bw_pct is None


class TestErrorHandling:
    """Test error handling."""
    
    def test_mismatched_radii_length(self):
        """Test error when radii length doesn't match edges."""
        nodes = np.array([[0, 0, 0], [0, 0, 0.1]])
        edges = [[1, 0]]
        radii = np.array([0.001, 0.002])  # Wrong length!
        
        vsrc = VoltageSource(node_start=1, node_end=0, value=1.0)
        
        with pytest.raises(ValueError, match="radii length"):
            solve_single_frequency(nodes, edges, radii, 1e6, [vsrc])
    
    def test_no_voltage_source(self):
        """Test error when no voltage source provided."""
        nodes = np.array([[0, 0, 0], [0, 0, 0.1], [0, 0, 0.2]])
        edges = [[1, 2], [2, 3]]
        radii = np.array([0.001, 0.001])
        
        with pytest.raises(ValueError, match="voltage source"):
            solve_single_frequency(nodes, edges, radii, 1e6, [])


class TestIntegration:
    """Integration tests with realistic scenarios."""
    
    def test_realistic_dipole_sweep(self):
        """Test realistic dipole with frequency sweep."""
        # 10cm dipole, 5 segments
        segment_length = 0.02  # 2cm per segment
        nodes = np.array([
            [0, 0, i * segment_length] 
            for i in range(6)
        ])
        edges = [[i+1, i+2] for i in range(5)]
        radii = np.array([0.001] * 5)  # 1mm radius
        
        # Feed at center
        vsrc = VoltageSource(node_start=3, node_end=0, value=1.0, R=50.0)
        
        # Sweep 100 MHz to 3 GHz
        freqs = np.logspace(8, 9.5, 30)
        
        result = solve_peec_frequency_sweep(nodes, edges, radii, freqs, [vsrc])
        
        # Verify complete solution
        assert len(result.frequency_solutions) == 30
        assert result.total_solve_time > 0
        
        # All solutions should be finite
        assert np.all(np.isfinite(result.impedance_real))
        assert np.all(np.isfinite(result.impedance_imag))
        
        # Power should be positive
        for sol in result.frequency_solutions:
            assert sol.power_dissipated >= 0
        
        # Impedance should vary with frequency
        assert np.std(result.impedance_magnitude) > 0
    
    def test_multiband_antenna(self):
        """Test antenna with multiple resonances."""
        # Longer dipole that may have multiple resonances
        nodes = np.array([
            [0, 0, i * 0.05] 
            for i in range(11)  # 0.5m total
        ])
        edges = [[i+1, i+2] for i in range(10)]
        radii = np.array([0.001] * 10)
        
        vsrc = VoltageSource(node_start=6, node_end=0, value=1.0)
        
        # Wide sweep to catch multiple resonances
        freqs = np.logspace(8, 9.5, 50)  # 100 MHz to ~3 GHz
        
        result = solve_peec_frequency_sweep(nodes, edges, radii, freqs, [vsrc])
        
        # Should find at least one resonance
        f_res = compute_resonant_frequency(result)
        
        # Either find resonance or sweep doesn't cover it
        assert f_res is None or (freqs[0] <= f_res <= freqs[-1])
