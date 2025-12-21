"""
Tests for potential coefficient calculation functions.

These tests verify the PEEC potential coefficient calculations against:
1. Known properties (symmetry, positive definiteness)
2. Physical constraints
3. Expected numerical ranges for realistic geometries
"""

import numpy as np
import pytest

from backend.solver.potential import (
    compute_self_potential_coefficient,
    compute_mutual_potential_coefficient,
    assemble_potential_matrix,
    compute_capacitance_matrix,
    EPSILON_0,
    PI
)
from backend.solver.geometry import EdgeGeometry, build_edge_geometries
from backend.solver.gauss_quadrature import get_gauss_points


class TestSelfPotentialCoefficient:
    """Test self-potential coefficient calculation."""
    
    def test_typical_wire_segment(self):
        """Test self-potential coefficient of a 1m wire with 1mm radius."""
        P = compute_self_potential_coefficient(length=1.0, radius=0.001)
        
        # Should be positive
        assert P > 0
        assert isinstance(P, float)
    
    def test_longer_wire_has_lower_coefficient(self):
        """Test that longer wires have lower self-potential coefficient."""
        P1 = compute_self_potential_coefficient(length=1.0, radius=0.001)
        P2 = compute_self_potential_coefficient(length=2.0, radius=0.001)
        
        # Longer wire distributes charge better, lower potential per charge
        assert P2 < P1
    
    def test_thicker_wire_has_lower_coefficient(self):
        """Test that thicker wires have lower self-potential coefficient."""
        P1 = compute_self_potential_coefficient(length=1.0, radius=0.001)
        P2 = compute_self_potential_coefficient(length=1.0, radius=0.002)
        
        # Thicker wire has more surface area, lower potential
        assert P2 < P1
    
    def test_zero_length_raises_error(self):
        """Test that zero length raises ValueError."""
        with pytest.raises(ValueError, match="Length must be positive"):
            compute_self_potential_coefficient(length=0.0, radius=0.001)
    
    def test_zero_radius_raises_error(self):
        """Test that zero radius raises ValueError."""
        with pytest.raises(ValueError, match="Radius must be positive"):
            compute_self_potential_coefficient(length=1.0, radius=0.0)
    
    def test_radius_larger_than_length_raises_error(self):
        """Test that radius >= length raises ValueError."""
        with pytest.raises(ValueError, match="must be less than length"):
            compute_self_potential_coefficient(length=0.001, radius=0.001)


class TestMutualPotentialCoefficient:
    """Test mutual potential coefficient calculation."""
    
    def test_parallel_wires(self):
        """Test mutual potential coefficient of two parallel wires."""
        edge1 = EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0])
        edge2 = EdgeGeometry([0.0, 0.0, 0.01], [1.0, 0.0, 0.01])
        
        points, weights = get_gauss_points(10)
        
        P = compute_mutual_potential_coefficient(edge1, edge2, points, weights)
        
        # Should be positive (same orientation, coupling exists)
        assert P > 0
        assert isinstance(P, float)
    
    def test_perpendicular_wires_still_couple(self):
        """Test that perpendicular wires still have electrostatic coupling."""
        edge1 = EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0])
        edge2 = EdgeGeometry([0.5, 0.0, 0.0], [0.5, 1.0, 0.0])
        
        points, weights = get_gauss_points(10)
        
        P = compute_mutual_potential_coefficient(edge1, edge2, points, weights)
        
        # Electrostatic coupling exists regardless of orientation
        assert P > 0
    
    def test_distant_wires_weak_coupling(self):
        """Test that widely separated wires have very weak coupling."""
        edge1 = EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0])
        edge2 = EdgeGeometry([0.0, 0.0, 10.0], [1.0, 0.0, 10.0])
        
        points, weights = get_gauss_points(10)
        
        P_close = compute_mutual_potential_coefficient(
            edge1,
            EdgeGeometry([0.0, 0.0, 0.01], [1.0, 0.0, 0.01]),
            points, weights
        )
        P_far = compute_mutual_potential_coefficient(edge1, edge2, points, weights)
        
        # Distant coupling should be much weaker
        assert P_far < P_close
        assert P_far < 0.1 * P_close
    
    def test_higher_gauss_order_convergence(self):
        """Test that higher Gauss quadrature order gives similar results."""
        edge1 = EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0])
        edge2 = EdgeGeometry([0.0, 0.0, 0.01], [1.0, 0.0, 0.01])
        
        points_10, weights_10 = get_gauss_points(10)
        points_16, weights_16 = get_gauss_points(16)
        
        P_10 = compute_mutual_potential_coefficient(edge1, edge2, points_10, weights_10)
        P_16 = compute_mutual_potential_coefficient(edge1, edge2, points_16, weights_16)
        
        # Should agree to within a few percent
        assert np.isclose(P_10, P_16, rtol=0.05)


class TestPotentialMatrixAssembly:
    """Test full potential matrix assembly."""
    
    def test_simple_dipole(self):
        """Test potential matrix for simple two-segment dipole."""
        edges = [
            EdgeGeometry([0.0, 0.0, 0.0], [0.0, 0.0, 0.5]),
            EdgeGeometry([0.0, 0.0, 0.5], [0.0, 0.0, 1.0])
        ]
        radii = np.array([0.001, 0.001])
        
        P = assemble_potential_matrix(edges, radii, n_gauss=10)
        
        # Check shape
        assert P.shape == (2, 2)
        
        # Check symmetry
        assert np.allclose(P, P.T)
        
        # Check diagonal elements are positive
        assert P[0, 0] > 0
        assert P[1, 1] > 0
        
        # Check off-diagonal elements are positive (coupling exists)
        assert P[0, 1] > 0
        assert P[1, 0] > 0
        
        # Self-potential should be larger than mutual
        assert P[0, 0] > P[0, 1]
        assert P[1, 1] > P[1, 0]
    
    def test_matrix_positive_definite(self):
        """Test that potential matrix is positive definite."""
        edges = [
            EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0]),
            EdgeGeometry([1.0, 0.0, 0.0], [2.0, 0.0, 0.0]),
            EdgeGeometry([2.0, 0.0, 0.0], [3.0, 0.0, 0.0])
        ]
        radii = np.full(3, 0.001)
        
        P = assemble_potential_matrix(edges, radii, n_gauss=8)
        
        # Check all eigenvalues are positive (positive definite)
        eigenvalues = np.linalg.eigvalsh(P)
        assert np.all(eigenvalues > 0)
    
    def test_radii_wrong_shape_raises_error(self):
        """Test that wrong radii array shape raises ValueError."""
        edges = [
            EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0]),
            EdgeGeometry([1.0, 0.0, 0.0], [2.0, 0.0, 0.0])
        ]
        radii = np.array([0.001])  # Wrong length
        
        with pytest.raises(ValueError, match="Radii array has length"):
            assemble_potential_matrix(edges, radii)
    
    def test_physical_units(self):
        """Test that potential matrix has correct physical units."""
        # Simple 1m wire, 1mm radius
        edges = [EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0])]
        radii = np.array([0.001])
        
        P = assemble_potential_matrix(edges, radii, n_gauss=10)
        
        # P has units of Ω·m (potential per unit charge per unit length)
        # For a 1m wire, expect order of magnitude 10^9 to 10^11 Ω·m
        assert P[0, 0] > 1e8
        assert P[0, 0] < 1e12
    
    def test_adjacent_segments_stronger_coupling(self):
        """Test that adjacent segments have stronger coupling than distant ones."""
        # 10-segment dipole
        nodes = [[0.0, 0.0, i * 0.1] for i in range(11)]
        edges_list = [[i, i + 1] for i in range(10)]
        
        edges = build_edge_geometries(nodes, edges_list)
        radii = np.full(10, 0.001)
        
        P = assemble_potential_matrix(edges, radii, n_gauss=8)
        
        # Adjacent segments should have stronger coupling than distant ones
        # P[0,1] (adjacent) should be > P[0,9] (distant)
        assert P[0, 1] > P[0, 9]


class TestCapacitanceMatrix:
    """Test capacitance matrix computation."""
    
    def test_capacitance_is_inverse(self):
        """Test that capacitance matrix is inverse of potential matrix."""
        edges = [
            EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0]),
            EdgeGeometry([1.0, 0.0, 0.0], [2.0, 0.0, 0.0])
        ]
        radii = np.full(2, 0.001)
        
        P = assemble_potential_matrix(edges, radii, n_gauss=10)
        C = compute_capacitance_matrix(P)
        
        # C * P should be identity
        product = C @ P
        assert np.allclose(product, np.eye(2), rtol=1e-10)
    
    def test_capacitance_units(self):
        """Test that capacitance matrix has correct physical units."""
        # Simple 1m wire
        edges = [EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0])]
        radii = np.array([0.001])
        
        P = assemble_potential_matrix(edges, radii, n_gauss=10)
        C = compute_capacitance_matrix(P)
        
        # C has units of Farads
        # For a 1m wire, expect order of magnitude 10^-11 to 10^-10 F (pF range)
        assert C[0, 0] > 1e-13
        assert C[0, 0] < 1e-9
    
    def test_capacitance_matrix_properties(self):
        """Test that capacitance matrix maintains expected properties."""
        edges = [
            EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0]),
            EdgeGeometry([1.0, 0.0, 0.0], [2.0, 0.0, 0.0]),
            EdgeGeometry([2.0, 0.0, 0.0], [3.0, 0.0, 0.0])
        ]
        radii = np.full(3, 0.001)
        
        P = assemble_potential_matrix(edges, radii, n_gauss=8)
        C = compute_capacitance_matrix(P)
        
        # Should be symmetric
        assert np.allclose(C, C.T)
        
        # Should be positive definite
        eigenvalues = np.linalg.eigvalsh(C)
        assert np.all(eigenvalues > 0)
        
        # Diagonal elements should be positive
        assert np.all(np.diag(C) > 0)


class TestIntegration:
    """Integration tests for potential/capacitance calculations."""
    
    def test_realistic_dipole_mesh(self):
        """Test potential and capacitance for realistic dipole antenna."""
        # 1-meter dipole divided into 10 segments
        nodes = [[0.0, 0.0, i * 0.1] for i in range(11)]
        edges_list = [[i, i + 1] for i in range(10)]
        
        edges = build_edge_geometries(nodes, edges_list)
        radii = np.full(10, 0.001)
        
        P = assemble_potential_matrix(edges, radii, n_gauss=10)
        C = compute_capacitance_matrix(P)
        
        # Verify round-trip
        identity = P @ C
        assert np.allclose(identity, np.eye(10), rtol=1e-8)
        
        # Total capacitance (sum of all elements)
        # For dipole, expect order of pF
        total_cap = np.sum(C)
        assert total_cap > 0
        assert total_cap < 1e-9  # Less than 1 nF
    
    def test_compare_different_radii(self):
        """Test that thicker wires have higher capacitance."""
        edges = [EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0])]
        
        # Thin wire
        P_thin = assemble_potential_matrix(edges, np.array([0.001]), n_gauss=10)
        C_thin = compute_capacitance_matrix(P_thin)
        
        # Thick wire
        P_thick = assemble_potential_matrix(edges, np.array([0.002]), n_gauss=10)
        C_thick = compute_capacitance_matrix(P_thick)
        
        # Thicker wire should have higher capacitance (lower P, higher C)
        assert P_thick[0, 0] < P_thin[0, 0]
        assert C_thick[0, 0] > C_thin[0, 0]
