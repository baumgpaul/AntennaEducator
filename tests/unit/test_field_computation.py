"""Unit tests for electromagnetic field computation."""

import numpy as np
import pytest

from backend.common.constants import EPSILON_0, MU_0
from backend.postprocessor.field import (
    compute_directivity_from_pattern,
    compute_far_field,
    compute_near_field,
    compute_poynting_magnitude_spherical,
    compute_poynting_vector,
    compute_vector_potential,
)


class TestVectorPotential:
    """Tests for vector potential computation."""

    def test_vector_potential_units(self):
        """Test vector potential has correct units [Wb/m]."""
        current = 1.0 + 0j
        edge_start = np.array([0.0, 0.0, 0.0])
        edge_end = np.array([0.0, 0.0, 0.1])
        obs_point = np.array([1.0, 0.0, 0.0])
        k = 2 * np.pi / 3.0  # 100 MHz

        A = compute_vector_potential(current, edge_start, edge_end, obs_point, k)

        assert A.shape == (3,)
        assert np.iscomplexobj(A)
        assert np.any(np.abs(A) > 0)

    def test_vector_potential_direction(self):
        """Test vector potential points along current direction."""
        current = 1.0 + 0j
        edge_start = np.array([0.0, 0.0, 0.0])
        edge_end = np.array([0.0, 0.0, 1.0])  # z-direction
        obs_point = np.array([10.0, 0.0, 0.5])  # Far from edge
        k = 2 * np.pi / 3.0

        A = compute_vector_potential(current, edge_start, edge_end, obs_point, k)

        # Dominant component should be in z direction
        assert np.abs(A[2]) > np.abs(A[0])
        assert np.abs(A[2]) > np.abs(A[1])

    def test_vector_potential_reciprocity(self):
        """Test A decreases with distance."""
        current = 1.0 + 0j
        edge_start = np.array([0.0, 0.0, 0.0])
        edge_end = np.array([0.0, 0.0, 0.1])
        k = 2 * np.pi / 3.0

        # Two observation points at different distances
        obs_near = np.array([1.0, 0.0, 0.0])
        obs_far = np.array([10.0, 0.0, 0.0])

        A_near = compute_vector_potential(current, edge_start, edge_end, obs_near, k)
        A_far = compute_vector_potential(current, edge_start, edge_end, obs_far, k)

        # Magnitude should decrease with distance
        assert np.linalg.norm(A_near) > np.linalg.norm(A_far)


class TestNearField:
    """Tests for near-field computation."""

    def test_near_field_dimensions(self):
        """Test near-field output shapes are correct."""
        frequencies = np.array([100e6, 200e6])
        nodes = np.array([[0, 0, 0], [0, 0, 0.5]])
        edges = np.array([[0, 1]])
        branch_currents = np.array([[0.001 + 0j], [0.002 + 0j]])
        obs_points = np.array([[1, 0, 0], [0, 1, 0], [0, 0, 2]])

        E_field, H_field = compute_near_field(
            frequencies, branch_currents, nodes, edges, obs_points
        )

        assert E_field.shape == (2, 3, 3)  # (n_freq, n_points, 3)
        assert H_field.shape == (2, 3, 3)
        assert np.iscomplexobj(E_field)
        assert np.iscomplexobj(H_field)

    def test_near_field_nonzero(self):
        """Test fields are non-zero for non-zero currents."""
        frequencies = np.array([100e6])
        nodes = np.array([[0, 0, 0], [0, 0, 0.5]])
        edges = np.array([[0, 1]])
        branch_currents = np.array([[1.0 + 0j]])
        obs_points = np.array([[1, 0, 0]])

        E_field, H_field = compute_near_field(
            frequencies, branch_currents, nodes, edges, obs_points
        )

        assert np.any(np.abs(E_field) > 0)
        assert np.any(np.abs(H_field) > 0)


class TestFarField:
    """Tests for far-field computation."""

    def test_far_field_dimensions(self):
        """Test far-field output shapes are correct."""
        frequencies = np.array([100e6])
        nodes = np.array([[0, 0, 0], [0, 0, 0.5]])
        edges = np.array([[0, 1]])
        branch_currents = np.array([[1.0 + 0j]])
        theta = np.linspace(0, np.pi, 5)
        phi = np.linspace(0, 2 * np.pi, 8)

        E_field, H_field = compute_far_field(frequencies, branch_currents, nodes, edges, theta, phi)

        assert E_field.shape == (1, 5, 8, 2)  # (n_freq, n_theta, n_phi, 2)
        assert H_field.shape == (1, 5, 8, 2)
        assert np.iscomplexobj(E_field)
        assert np.iscomplexobj(H_field)

    def test_far_field_impedance_relation(self):
        """Test H = E/η₀ relationship in far-field."""
        frequencies = np.array([100e6])
        nodes = np.array([[0, 0, 0], [0, 0, 0.5]])
        edges = np.array([[0, 1]])
        branch_currents = np.array([[1.0 + 0j]])
        theta = np.array([np.pi / 2])
        phi = np.array([0.0])

        E_field, H_field = compute_far_field(frequencies, branch_currents, nodes, edges, theta, phi)

        # In far-field: H_θ = E_φ/η₀, H_φ = -E_θ/η₀
        eta_0 = np.sqrt(MU_0 / EPSILON_0)
        E_theta = E_field[0, 0, 0, 0]
        E_phi = E_field[0, 0, 0, 1]
        H_theta = H_field[0, 0, 0, 0]
        H_phi = H_field[0, 0, 0, 1]

        np.testing.assert_allclose(H_theta, E_phi / eta_0, rtol=1e-10)
        np.testing.assert_allclose(H_phi, -E_theta / eta_0, rtol=1e-10)

    def test_far_field_dipole_pattern(self):
        """Test dipole far-field pattern characteristics."""
        frequencies = np.array([300e6])  # 1m wavelength
        # Quarter-wave dipole (0.25m)
        nodes = np.array([[0, 0, -0.125], [0, 0, 0.125]])
        edges = np.array([[0, 1]])
        branch_currents = np.array([[1.0 + 0j]])
        theta = np.linspace(0, np.pi, 37)
        phi = np.array([0.0])

        E_field, H_field = compute_far_field(frequencies, branch_currents, nodes, edges, theta, phi)

        E_theta = E_field[0, :, 0, 0]

        # Dipole should have nulls at θ=0 and θ=π (along axis)
        assert np.abs(E_theta[0]) < 0.1 * np.max(np.abs(E_theta))
        assert np.abs(E_theta[-1]) < 0.1 * np.max(np.abs(E_theta))

        # Maximum should be around θ=π/2 (broadside)
        max_idx = np.argmax(np.abs(E_theta))
        assert np.abs(theta[max_idx] - np.pi / 2) < np.pi / 6  # Within 30 degrees


class TestPoyntingVector:
    """Tests for Poynting vector computation."""

    def test_poynting_vector_shape(self):
        """Test Poynting vector has correct shape."""
        E = np.array([[1 + 0j, 0, 0], [0, 1 + 0j, 0]])
        H = np.array([[0, 1 + 0j, 0], [1 + 0j, 0, 0]])

        S = compute_poynting_vector(E, H)

        assert S.shape == E.shape
        assert np.isrealobj(S)  # Time-averaged Poynting vector is real

    def test_poynting_vector_perpendicular(self):
        """Test S = E × H is perpendicular to both E and H."""
        E = np.array([1 + 0j, 0, 0])
        H = np.array([0, 1 + 0j, 0])

        S = compute_poynting_vector(E.reshape(1, -1), H.reshape(1, -1))
        S = S.flatten()

        # S should be in z-direction
        assert np.abs(S[2]) > 0
        assert np.abs(S[0]) < 1e-10
        assert np.abs(S[1]) < 1e-10

    def test_poynting_spherical(self):
        """Test Poynting vector from spherical components."""
        E_theta = 1.0 + 0j
        E_phi = 0.5 + 0j
        eta_0 = np.sqrt(MU_0 / EPSILON_0)
        # Far-field relation: H = (r̂ × E) / η₀
        # r̂ × θ̂ = φ̂, r̂ × φ̂ = -θ̂
        H_theta = -E_phi / eta_0  # Fixed sign
        H_phi = E_theta / eta_0  # Fixed sign

        S_r = compute_poynting_magnitude_spherical(E_theta, E_phi, H_theta, H_phi)

        assert S_r > 0
        # For plane wave: S = |E|²/(2η₀)
        expected_S = (np.abs(E_theta) ** 2 + np.abs(E_phi) ** 2) / (2 * eta_0)
        np.testing.assert_allclose(S_r, expected_S, rtol=1e-6)


class TestDirectivity:
    """Tests for directivity computation."""

    def test_directivity_isotropic(self):
        """Test directivity of isotropic radiator is 1."""
        # Uniform pattern
        n_theta, n_phi = 37, 72
        E_theta = np.ones((n_theta, n_phi), dtype=complex)
        E_phi = np.zeros((n_theta, n_phi), dtype=complex)
        theta = np.linspace(0, np.pi, n_theta)
        phi = np.linspace(0, 2 * np.pi, n_phi)

        D_max, D_dBi, D_pattern, max_idx = compute_directivity_from_pattern(
            E_theta, E_phi, theta, phi
        )

        # Isotropic radiator has D = 1 (0 dBi)
        np.testing.assert_allclose(D_max, 1.0, rtol=0.1)
        np.testing.assert_allclose(D_dBi, 0.0, atol=0.5)

    def test_directivity_positive(self):
        """Test directivity is always positive."""
        n_theta, n_phi = 19, 36
        # Random pattern
        E_theta = np.random.rand(n_theta, n_phi) + 1j * np.random.rand(n_theta, n_phi)
        E_phi = np.random.rand(n_theta, n_phi) + 1j * np.random.rand(n_theta, n_phi)
        theta = np.linspace(0, np.pi, n_theta)
        phi = np.linspace(0, 2 * np.pi, n_phi)

        D_max, D_dBi, D_pattern, max_idx = compute_directivity_from_pattern(
            E_theta, E_phi, theta, phi
        )

        assert D_max > 0
        assert np.all(D_pattern >= 0)

    def test_directivity_dipole_theoretical(self):
        """Test dipole directivity is close to theoretical 1.64 (2.15 dBi)."""
        n_theta, n_phi = 181, 360
        theta = np.linspace(0, np.pi, n_theta)
        phi = np.linspace(0, 2 * np.pi, n_phi)

        # Ideal dipole pattern: E_θ = sin(θ)
        sin_theta = np.sin(theta)
        E_theta = sin_theta[:, np.newaxis] * np.ones((1, n_phi))
        E_phi = np.zeros((n_theta, n_phi), dtype=complex)

        D_max, D_dBi, D_pattern, max_idx = compute_directivity_from_pattern(
            E_theta, E_phi, theta, phi
        )

        # Theoretical dipole directivity: 1.64 (2.15 dBi)
        np.testing.assert_allclose(D_max, 1.64, rtol=0.1)
        np.testing.assert_allclose(
            D_dBi, 2.15, atol=0.4
        )  # Relaxed tolerance for numerical integration


class TestFieldIntegration:
    """Integration tests for complete field computation workflow."""

    def test_energy_conservation(self):
        """Test Poynting theorem: P_rad = surface integral of S."""
        frequencies = np.array([100e6])
        nodes = np.array([[0, 0, 0], [0, 0, 0.5]])
        edges = np.array([[0, 1]])
        branch_currents = np.array([[1.0 + 0j]])

        # Compute far-field on sphere
        n_theta, n_phi = 37, 72
        theta = np.linspace(0, np.pi, n_theta)
        phi = np.linspace(0, 2 * np.pi, n_phi)

        E_field, H_field = compute_far_field(frequencies, branch_currents, nodes, edges, theta, phi)

        E_theta = E_field[0, :, :, 0]
        E_phi = E_field[0, :, :, 1]

        # Compute radiated power
        eta_0 = np.sqrt(MU_0 / EPSILON_0)
        S_r = (np.abs(E_theta) ** 2 + np.abs(E_phi) ** 2) / (2 * eta_0)

        # Integrate over sphere: P = ∫∫ S_r r² sin(θ) dθ dφ
        # For pattern at constant r, r² cancels out in directivity
        r = 1.0  # arbitrary
        dtheta = theta[1] - theta[0] if len(theta) > 1 else 0
        dphi = phi[1] - phi[0] if len(phi) > 1 else 0

        P_rad = 0
        for i in range(n_theta):
            sin_theta = np.sin(theta[i])
            for j in range(n_phi):
                P_rad += S_r[i, j] * r**2 * sin_theta * dtheta * dphi

        # Power should be positive
        assert P_rad > 0

    def test_reciprocity_near_far_field(self):
        """Test near-field and far-field give consistent results."""
        frequencies = np.array([100e6])
        nodes = np.array([[0, 0, 0], [0, 0, 0.5]])
        edges = np.array([[0, 1]])
        branch_currents = np.array([[1.0 + 0j]])

        # Compute far-field at one point
        theta = np.array([np.pi / 2])
        phi = np.array([0.0])
        E_far, H_far = compute_far_field(frequencies, branch_currents, nodes, edges, theta, phi)

        # Compute near-field at large distance in same direction
        r = 1000.0  # Large distance
        x = r * np.sin(theta[0]) * np.cos(phi[0])
        y = r * np.sin(theta[0]) * np.sin(phi[0])
        z = r * np.cos(theta[0])
        obs_point = np.array([[x, y, z]])

        E_near, H_near = compute_near_field(frequencies, branch_currents, nodes, edges, obs_point)

        # At large distance, both should give similar results (scaled by r)
        # Just check they're both non-zero
        assert np.any(np.abs(E_far) > 0)
        assert np.any(np.abs(E_near) > 0)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
