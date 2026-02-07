"""Unit tests for radiation pattern analysis."""

import numpy as np
import pytest

from backend.postprocessor.pattern import (
    compute_beamwidth,
    compute_directivity,
    compute_radiation_intensity,
    compute_total_radiated_power,
)


class TestRadiationIntensity:
    """Tests for radiation intensity computation."""

    def test_radiation_intensity_units(self):
        """Test radiation intensity has correct units [W/sr]."""
        E_theta = np.array([[1.0 + 0j, 2.0 + 0j]])
        E_phi = np.array([[0.5 + 0j, 1.0 + 0j]])

        U = compute_radiation_intensity(E_theta, E_phi)

        assert U.shape == E_theta.shape
        assert np.all(U >= 0)  # Intensity is non-negative
        assert np.isrealobj(U)  # Intensity is real

    def test_radiation_intensity_proportional_to_field_squared(self):
        """Test U ∝ |E|²."""
        E_theta1 = np.array([[1.0 + 0j]])
        E_phi1 = np.array([[0.0 + 0j]])

        E_theta2 = np.array([[2.0 + 0j]])
        E_phi2 = np.array([[0.0 + 0j]])

        U1 = compute_radiation_intensity(E_theta1, E_phi1)
        U2 = compute_radiation_intensity(E_theta2, E_phi2)

        # U2 should be 4× U1
        np.testing.assert_allclose(U2 / U1, 4.0, rtol=1e-6)

    def test_radiation_intensity_zero_field(self):
        """Test zero field gives zero intensity."""
        E_theta = np.zeros((3, 3), dtype=complex)
        E_phi = np.zeros((3, 3), dtype=complex)

        U = compute_radiation_intensity(E_theta, E_phi)

        np.testing.assert_allclose(U, 0.0, atol=1e-15)


class TestTotalRadiatedPower:
    """Tests for total radiated power computation."""

    def test_radiated_power_positive(self):
        """Test radiated power is positive for non-zero pattern."""
        n_theta, n_phi = 19, 36
        theta = np.linspace(0, np.pi, n_theta)
        phi = np.linspace(0, 2 * np.pi, n_phi)

        # Uniform intensity
        U = np.ones((n_theta, n_phi))

        P_rad = compute_total_radiated_power(U, theta, phi)

        assert P_rad > 0

    def test_radiated_power_isotropic(self):
        """Test isotropic radiator integrates to 4πU₀."""
        n_theta, n_phi = 91, 180
        theta = np.linspace(0, np.pi, n_theta)
        phi = np.linspace(0, 2 * np.pi, n_phi)

        U0 = 10.0  # W/sr
        U = np.full((n_theta, n_phi), U0)

        P_rad = compute_total_radiated_power(U, theta, phi)

        # For isotropic: P = ∫∫ U₀ sin(θ) dθ dφ = 4πU₀
        expected = 4 * np.pi * U0
        np.testing.assert_allclose(P_rad, expected, rtol=0.05)

    def test_radiated_power_scaling(self):
        """Test radiated power scales linearly with intensity."""
        n_theta, n_phi = 19, 36
        theta = np.linspace(0, np.pi, n_theta)
        phi = np.linspace(0, 2 * np.pi, n_phi)

        U = np.random.rand(n_theta, n_phi)

        P1 = compute_total_radiated_power(U, theta, phi)
        P2 = compute_total_radiated_power(2 * U, theta, phi)

        np.testing.assert_allclose(P2 / P1, 2.0, rtol=0.01)


class TestDirectivity:
    """Tests for directivity computation."""

    def test_directivity_isotropic(self):
        """Test directivity of isotropic radiator is 1 (0 dBi)."""
        n_theta, n_phi = 37, 72
        theta = np.linspace(0, np.pi, n_theta)
        phi = np.linspace(0, 2 * np.pi, n_phi)

        # Uniform intensity
        U = np.ones((n_theta, n_phi))

        D_max, max_direction = compute_directivity(U, theta, phi)

        # Isotropic: D = 4πU_max / P_rad = 4π / 4π = 1
        np.testing.assert_allclose(D_max, 1.0, rtol=0.05)

    def test_directivity_maximum_location(self):
        """Test directivity correctly identifies maximum direction."""
        n_theta, n_phi = 37, 72
        theta = np.linspace(0, np.pi, n_theta)
        phi = np.linspace(0, 2 * np.pi, n_phi)

        # Create pattern with known maximum at θ=π/2, φ=0
        theta_grid, phi_grid = np.meshgrid(theta, phi, indexing="ij")

        # Gaussian beam pointing at (π/2, 0)
        sigma = 0.3
        U = np.exp(-((theta_grid - np.pi / 2) ** 2 + (phi_grid - 0) ** 2) / (2 * sigma**2))

        D_max, (theta_max, phi_max) = compute_directivity(U, theta, phi)

        # Maximum should be near (π/2, 0)
        np.testing.assert_allclose(theta_max, np.pi / 2, atol=0.1)
        np.testing.assert_allclose(phi_max, 0.0, atol=0.1)

    def test_directivity_greater_than_one(self):
        """Test directivity is >= 1 for any pattern."""
        n_theta, n_phi = 19, 36
        theta = np.linspace(0, np.pi, n_theta)
        phi = np.linspace(0, 2 * np.pi, n_phi)

        # Random pattern
        np.random.seed(42)
        U = np.random.rand(n_theta, n_phi) + 0.1

        D_max, _ = compute_directivity(U, theta, phi)

        assert D_max >= 1.0


class TestBeamwidth:
    """Tests for beamwidth computation."""

    def test_beamwidth_narrow_beam(self):
        """Test beamwidth for narrow beam pattern."""
        n_angles = 181
        angles = np.linspace(0, np.pi, n_angles)

        # Narrow Gaussian beam centered at π/2
        sigma = 0.1
        pattern = np.exp(-((angles - np.pi / 2) ** 2) / (2 * sigma**2))

        beamwidth = compute_beamwidth(pattern, angles, threshold_db=-3.0)

        assert beamwidth is not None, "Beamwidth should be found for Gaussian beam"

        # For Gaussian, FWHM ≈ 2.355*σ
        expected_bw = 2.355 * sigma
        np.testing.assert_allclose(beamwidth, expected_bw, rtol=0.2)

    def test_beamwidth_omnidirectional(self):
        """Test beamwidth for omnidirectional pattern."""
        n_angles = 91
        angles = np.linspace(0, np.pi, n_angles)

        # Flat pattern
        pattern = np.ones(n_angles)

        beamwidth = compute_beamwidth(pattern, angles, threshold_db=-3.0)

        # Omnidirectional pattern has no -3dB points (all points are at 0 dB)
        # So beamwidth should be None or full range
        assert beamwidth is None or np.isclose(beamwidth, np.pi, rtol=0.1)

    def test_beamwidth_no_nulls(self):
        """Test pattern without -3dB points."""
        n_angles = 91
        angles = np.linspace(0, np.pi, n_angles)

        # Very narrow beam (no -3dB points in sampled data)
        pattern = np.zeros(n_angles)
        pattern[45] = 1.0  # Single point

        beamwidth = compute_beamwidth(pattern, angles, threshold_db=-3.0)

        # Should return None if no valid beamwidth found
        assert beamwidth is None or beamwidth > 0


class TestPatternMetrics:
    """Integration tests for complete pattern analysis."""

    def test_dipole_pattern_metrics(self):
        """Test complete pattern analysis for ideal dipole."""
        n_theta, n_phi = 91, 180
        theta = np.linspace(0, np.pi, n_theta)
        phi = np.linspace(0, 2 * np.pi, n_phi)

        # Ideal dipole pattern: E_θ = sin(θ)
        sin_theta = np.sin(theta)
        E_theta = sin_theta[:, np.newaxis] * np.ones((1, n_phi))
        E_phi = np.zeros((n_theta, n_phi))

        # Compute radiation intensity
        U = compute_radiation_intensity(E_theta, E_phi)

        # Total radiated power
        P_rad = compute_total_radiated_power(U, theta, phi)
        assert P_rad > 0

        # Directivity
        D_max, (theta_max, phi_max) = compute_directivity(U, theta, phi)

        # Dipole directivity should be ~1.64
        np.testing.assert_allclose(D_max, 1.64, rtol=0.1)

        # Maximum should be at θ = π/2 (broadside)
        np.testing.assert_allclose(theta_max, np.pi / 2, atol=0.05)

    def test_pattern_normalization(self):
        """Test pattern normalization and dB conversion."""
        n_theta, n_phi = 19, 36
        theta = np.linspace(0, np.pi, n_theta)
        phi = np.linspace(0, 2 * np.pi, n_phi)

        # Random pattern
        np.random.seed(123)
        E_theta = np.random.rand(n_theta, n_phi) + 1j * np.random.rand(n_theta, n_phi)
        E_phi = np.random.rand(n_theta, n_phi) + 1j * np.random.rand(n_theta, n_phi)

        U = compute_radiation_intensity(E_theta, E_phi)

        # Normalize to max
        U_norm = U / np.max(U)
        assert np.max(U_norm) == 1.0

        # Convert to dB
        U_dB = 10 * np.log10(U_norm + 1e-10)
        assert np.max(U_dB) <= 1e-6  # Max should be ~0 dB (within numerical precision)

    def test_front_to_back_ratio(self):
        """Test computation of front-to-back ratio."""
        n_theta, n_phi = 37, 72
        theta = np.linspace(0, np.pi, n_theta)
        phi = np.linspace(0, 2 * np.pi, n_phi)

        # Pattern with strong forward direction
        theta_grid, phi_grid = np.meshgrid(theta, phi, indexing="ij")

        # Forward lobe at θ=0, back lobe at θ=π
        U = 10 * np.exp(-((theta_grid - 0) ** 2) / 0.2) + np.exp(-((theta_grid - np.pi) ** 2) / 0.3)

        # Front-to-back ratio
        U_front = U[0, 0]  # θ=0
        U_back = U[-1, 0]  # θ=π

        FB_ratio_dB = 10 * np.log10(U_front / U_back)

        # Should be positive (front stronger than back)
        assert FB_ratio_dB > 0


class TestPatternIntegration:
    """Integration tests combining multiple pattern metrics."""

    def test_pattern_conservation(self):
        """Test that pattern integration conserves power."""
        n_theta, n_phi = 37, 72
        theta = np.linspace(0, np.pi, n_theta)
        phi = np.linspace(0, 2 * np.pi, n_phi)

        # Create arbitrary pattern
        np.random.seed(42)
        E_theta = np.random.rand(n_theta, n_phi) + 1j * np.random.rand(n_theta, n_phi)
        E_phi = np.random.rand(n_theta, n_phi) + 1j * np.random.rand(n_theta, n_phi)

        U = compute_radiation_intensity(E_theta, E_phi)
        P_rad = compute_total_radiated_power(U, theta, phi)
        D_max, _ = compute_directivity(U, theta, phi)

        # Verify D = 4π U_max / P_rad
        U_max = np.max(U)
        D_expected = 4 * np.pi * U_max / P_rad

        np.testing.assert_allclose(D_max, D_expected, rtol=0.01)

    def test_gain_efficiency_relationship(self):
        """Test relationship between gain, directivity, and efficiency."""
        # This test verifies the formula: G = η * D

        directivity = 5.0  # dimensionless
        efficiency = 0.8  # 80%

        # From solver utility
        from backend.solver.solver import compute_antenna_gain

        gain = compute_antenna_gain(directivity, efficiency)

        expected_gain = directivity * efficiency
        np.testing.assert_allclose(gain, expected_gain, rtol=1e-10)

        # In dB: G_dB = 10*log10(η) + D_dB
        gain_dB = 10 * np.log10(gain)
        efficiency_dB = 10 * np.log10(efficiency)
        directivity_dB = 10 * np.log10(directivity)

        np.testing.assert_allclose(gain_dB, efficiency_dB + directivity_dB, rtol=1e-6)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
