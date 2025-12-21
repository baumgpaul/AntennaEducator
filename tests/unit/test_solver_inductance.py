"""
Tests for inductance calculation functions.

These tests verify the PEEC inductance calculations against:
1. Known analytical formulas
2. Physical constraints (symmetry, positive definiteness)
3. Expected numerical ranges for realistic geometries
"""

import numpy as np
import pytest

from backend.solver.inductance import (
    compute_self_inductance,
    compute_mutual_inductance_1d,
    compute_distance_matrix,
    assemble_inductance_matrix
)
from backend.solver.geometry import EdgeGeometry, build_edge_geometries


class TestSelfInductance:
    """Test self-inductance calculation for straight wire segments."""
    
    def test_typical_wire_segment(self):
        """Test self-inductance of a 1m wire with 1mm radius."""
        # Standard test case
        L = compute_self_inductance(length=1.0, radius=0.001)
        
        # Expected value approximately 1.45 µH for this geometry
        # (from classical formula tables)
        assert L > 1.0e-6  # Greater than 1 µH
        assert L < 2.0e-6  # Less than 2 µH
        assert isinstance(L, float)
    
    def test_longer_wire_has_higher_inductance(self):
        """Test that longer wires have higher self-inductance."""
        L1 = compute_self_inductance(length=1.0, radius=0.001)
        L2 = compute_self_inductance(length=2.0, radius=0.001)
        
        # Inductance scales roughly linearly with length for thin wires
        assert L2 > L1
        assert L2 < 3 * L1  # But not quite 2x due to logarithmic term
    
    def test_thicker_wire_has_lower_inductance(self):
        """Test that thicker wires have lower self-inductance."""
        L1 = compute_self_inductance(length=1.0, radius=0.001)
        L2 = compute_self_inductance(length=1.0, radius=0.002)
        
        # Thicker wire means more internal flux, lower inductance
        assert L2 < L1
    
    def test_short_thick_wire(self):
        """Test wire segment with length/radius ratio of 10."""
        L = compute_self_inductance(length=0.01, radius=0.001)
        
        # Should still be positive
        assert L > 0
        # But much smaller than 1m wire
        assert L < 1e-7
    
    def test_zero_length_raises_error(self):
        """Test that zero length raises ValueError."""
        with pytest.raises(ValueError, match="Length must be positive"):
            compute_self_inductance(length=0.0, radius=0.001)
    
    def test_negative_length_raises_error(self):
        """Test that negative length raises ValueError."""
        with pytest.raises(ValueError, match="Length must be positive"):
            compute_self_inductance(length=-1.0, radius=0.001)
    
    def test_zero_radius_raises_error(self):
        """Test that zero radius raises ValueError."""
        with pytest.raises(ValueError, match="Radius must be positive"):
            compute_self_inductance(length=1.0, radius=0.0)
    
    def test_radius_larger_than_length_raises_error(self):
        """Test that radius >= length raises ValueError (thin wire assumption violated)."""
        with pytest.raises(ValueError, match="must be less than length"):
            compute_self_inductance(length=0.001, radius=0.001)


class TestMutualInductance:
    """Test mutual inductance calculation between wire segments."""
    
    def test_parallel_coaxial_wires(self):
        """Test mutual inductance of two parallel aligned wires."""
        # Two parallel 1m wires separated by 1cm in z-direction
        edge1 = EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0])
        edge2 = EdgeGeometry([0.0, 0.0, 0.01], [1.0, 0.0, 0.01])
        
        # Use 10-point Gauss quadrature
        gauss_points, gauss_weights = np.polynomial.legendre.leggauss(10)
        
        M = compute_mutual_inductance_1d(edge1, edge2, gauss_points, gauss_weights)
        
        # Should be positive (parallel, same direction)
        assert M > 0
        # Reasonable range for this geometry (1m wires, 1cm separation)
        assert M > 1e-7
        assert M < 2e-6  # Can be close to self-inductance for nearby wires
    
    def test_perpendicular_wires_low_coupling(self):
        """Test that perpendicular wires have near-zero mutual inductance."""
        # One wire along x-axis, one along y-axis
        edge1 = EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0])
        edge2 = EdgeGeometry([0.5, 0.0, 0.0], [0.5, 1.0, 0.0])
        
        gauss_points, gauss_weights = np.polynomial.legendre.leggauss(10)
        
        M = compute_mutual_inductance_1d(edge1, edge2, gauss_points, gauss_weights)
        
        # Should be very small (perpendicular)
        # cos(90°) = 0, so M should be near zero
        assert abs(M) < 1e-9
    
    def test_antiparallel_wires_negative_coupling(self):
        """Test that antiparallel wires have negative mutual inductance."""
        # Two wires, opposite directions
        edge1 = EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0])
        edge2 = EdgeGeometry([1.0, 0.0, 0.01], [0.0, 0.0, 0.01])  # Reversed
        
        gauss_points, gauss_weights = np.polynomial.legendre.leggauss(10)
        
        M = compute_mutual_inductance_1d(edge1, edge2, gauss_points, gauss_weights)
        
        # Should be negative (opposite current directions)
        assert M < 0
    
    def test_distant_wires_weak_coupling(self):
        """Test that widely separated wires have very weak coupling."""
        edge1 = EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0])
        edge2 = EdgeGeometry([0.0, 0.0, 10.0], [1.0, 0.0, 10.0])  # 10m apart
        
        gauss_points, gauss_weights = np.polynomial.legendre.leggauss(10)
        
        M = compute_mutual_inductance_1d(edge1, edge2, gauss_points, gauss_weights)
        
        # Should be very small (orders of magnitude less than nearby wires)
        assert abs(M) < 3e-8  # ~20 nH for 1m wires 10m apart
    
    def test_higher_gauss_order_convergence(self):
        """Test that higher Gauss quadrature order gives similar results."""
        edge1 = EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0])
        edge2 = EdgeGeometry([0.0, 0.0, 0.01], [1.0, 0.0, 0.01])
        
        # Compare 10-point vs 20-point quadrature
        points_10, weights_10 = np.polynomial.legendre.leggauss(10)
        points_20, weights_20 = np.polynomial.legendre.leggauss(20)
        
        M_10 = compute_mutual_inductance_1d(edge1, edge2, points_10, weights_10)
        M_20 = compute_mutual_inductance_1d(edge1, edge2, points_20, weights_20)
        
        # Should agree to within 1%
        assert np.isclose(M_10, M_20, rtol=0.01)


class TestDistanceMatrix:
    """Test distance matrix computation for edge geometries."""
    
    def test_simple_three_edges(self):
        """Test distance matrix for three parallel edges."""
        edges = [
            EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0]),
            EdgeGeometry([0.0, 1.0, 0.0], [1.0, 1.0, 0.0]),
            EdgeGeometry([0.0, 2.0, 0.0], [1.0, 2.0, 0.0])
        ]
        
        D = compute_distance_matrix(edges)
        
        # Check shape
        assert D.shape == (3, 3)
        
        # Check diagonal is zero
        assert np.allclose(np.diag(D), 0.0)
        
        # Check symmetry
        assert np.allclose(D, D.T)
        
        # Check specific distances
        assert np.isclose(D[0, 1], 1.0)  # 1m apart in y
        assert np.isclose(D[0, 2], 2.0)  # 2m apart in y
        assert np.isclose(D[1, 2], 1.0)  # 1m apart in y
    
    def test_single_edge(self):
        """Test distance matrix for single edge."""
        edges = [EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0])]
        
        D = compute_distance_matrix(edges)
        
        assert D.shape == (1, 1)
        assert D[0, 0] == 0.0
    
    def test_two_edges_diagonal(self):
        """Test distance between two edges at different orientations."""
        edges = [
            EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0]),
            EdgeGeometry([2.0, 3.0, 4.0], [3.0, 3.0, 4.0])
        ]
        
        D = compute_distance_matrix(edges)
        
        # Midpoint of edge1: [0.5, 0, 0]
        # Midpoint of edge2: [2.5, 3, 4]
        # Distance: sqrt(2² + 3² + 4²) = sqrt(29)
        expected = np.sqrt(4 + 9 + 16)
        
        assert np.isclose(D[0, 1], expected)
        assert np.isclose(D[1, 0], expected)


class TestInductanceMatrixAssembly:
    """Test full inductance matrix assembly."""
    
    def test_simple_dipole(self):
        """Test inductance matrix for simple two-segment dipole."""
        # Two segments forming a dipole
        edges = [
            EdgeGeometry([0.0, 0.0, 0.0], [0.0, 0.0, 0.5]),
            EdgeGeometry([0.0, 0.0, 0.5], [0.0, 0.0, 1.0])
        ]
        radii = np.array([0.001, 0.001])  # 1mm radius
        
        L = assemble_inductance_matrix(edges, radii, n_gauss=10)
        
        # Check shape
        assert L.shape == (2, 2)
        
        # Check symmetry
        assert np.allclose(L, L.T)
        
        # Check diagonal elements (self-inductance) are positive
        assert L[0, 0] > 0
        assert L[1, 1] > 0
        
        # Check off-diagonal (mutual inductance) is positive (parallel segments)
        assert L[0, 1] > 0
        assert L[1, 0] > 0
        
        # Self-inductance should be larger than mutual
        assert L[0, 0] > L[0, 1]
        assert L[1, 1] > L[1, 0]
    
    def test_matrix_positive_definite(self):
        """Test that inductance matrix is positive definite."""
        # Create a simple 3-segment structure
        edges = [
            EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0]),
            EdgeGeometry([1.0, 0.0, 0.0], [2.0, 0.0, 0.0]),
            EdgeGeometry([2.0, 0.0, 0.0], [3.0, 0.0, 0.0])
        ]
        radii = np.full(3, 0.001)
        
        L = assemble_inductance_matrix(edges, radii, n_gauss=8)
        
        # Check all eigenvalues are positive (positive definite)
        eigenvalues = np.linalg.eigvalsh(L)
        assert np.all(eigenvalues > 0)
    
    def test_radii_wrong_shape_raises_error(self):
        """Test that wrong radii array shape raises ValueError."""
        edges = [
            EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0]),
            EdgeGeometry([1.0, 0.0, 0.0], [2.0, 0.0, 0.0])
        ]
        radii = np.array([0.001])  # Wrong length
        
        with pytest.raises(ValueError, match="Radii array has length"):
            assemble_inductance_matrix(edges, radii)
    
    def test_custom_gauss_points(self):
        """Test using custom Gaussian quadrature points."""
        edges = [
            EdgeGeometry([0.0, 0.0, 0.0], [1.0, 0.0, 0.0]),
            EdgeGeometry([0.0, 1.0, 0.0], [1.0, 1.0, 0.0])
        ]
        radii = np.full(2, 0.001)
        
        # Provide custom quadrature
        points, weights = np.polynomial.legendre.leggauss(15)
        
        L = assemble_inductance_matrix(
            edges, radii,
            gauss_points=points,
            gauss_weights=weights
        )
        
        # Should still produce valid matrix
        assert L.shape == (2, 2)
        assert np.allclose(L, L.T)
        assert np.all(np.linalg.eigvalsh(L) > 0)
    
    def test_realistic_dipole_mesh(self):
        """Test inductance matrix for realistic dipole antenna mesh."""
        # 1-meter dipole divided into 10 segments
        nodes = [[0.0, 0.0, i * 0.1] for i in range(11)]
        edges_list = [[i, i + 1] for i in range(10)]
        
        edges = build_edge_geometries(nodes, edges_list)
        radii = np.full(10, 0.001)  # 1mm radius
        
        L = assemble_inductance_matrix(edges, radii, n_gauss=10)
        
        # Check shape
        assert L.shape == (10, 10)
        
        # Check symmetry
        assert np.allclose(L, L.T)
        
        # Check positive definite
        eigenvalues = np.linalg.eigvalsh(L)
        assert np.all(eigenvalues > 0)
        
        # Adjacent segments should have stronger coupling than distant ones
        # L[0,1] (adjacent) should be > L[0,9] (distant)
        assert L[0, 1] > abs(L[0, 9])
        
        # All self-inductances should be similar (same length segments)
        self_inductances = np.diag(L)
        assert np.std(self_inductances) / np.mean(self_inductances) < 0.1  # <10% variation
