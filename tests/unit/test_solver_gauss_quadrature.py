"""
Tests for Gauss-Legendre quadrature module.

These tests verify the extracted quadrature points and weights from the
MATLAB PEEC solver match expected properties.
"""

import numpy as np
import pytest

from backend.solver.gauss_quadrature import (
    get_gauss_points,
    get_available_orders,
    verify_quadrature,
    GAUSS_LEGENDRE_DATA
)


class TestGaussQuadrature:
    """Test Gauss-Legendre quadrature points and weights."""
    
    def test_available_orders(self):
        """Test that we have expected quadrature orders."""
        orders = get_available_orders()
        
        # Should have these common orders
        assert 1 in orders
        assert 2 in orders
        assert 5 in orders
        assert 10 in orders
        assert 20 in orders
        
        # Should be sorted
        assert orders == sorted(orders)
    
    def test_get_2_point_quadrature(self):
        """Test 2-point Gauss-Legendre quadrature."""
        points, weights = get_gauss_points(2)
        
        # Check shape
        assert len(points) == 2
        assert len(weights) == 2
        
        # Check symmetry
        assert np.isclose(points[0], -points[1])
        assert np.isclose(weights[0], weights[1])
        
        # Check specific values
        expected_point = 1.0 / np.sqrt(3)
        assert np.isclose(abs(points[0]), expected_point, rtol=1e-6)
        assert np.isclose(weights[0], 1.0)
    
    def test_get_10_point_quadrature(self):
        """Test 10-point Gauss-Legendre quadrature (commonly used)."""
        points, weights = get_gauss_points(10)
        
        # Check shape
        assert len(points) == 10
        assert len(weights) == 10
        
        # Check all points in [-1, 1]
        assert np.all(points >= -1)
        assert np.all(points <= 1)
        
        # Check weights are positive
        assert np.all(weights > 0)
    
    def test_weights_sum_to_two(self):
        """Test that weights sum to 2 (interval length) for all orders."""
        for n in get_available_orders():
            points, weights = get_gauss_points(n)
            weight_sum = np.sum(weights)
            assert np.isclose(weight_sum, 2.0, rtol=1e-6), \
                f"Order {n}: weights sum to {weight_sum}, expected 2"
    
    def test_points_symmetric(self):
        """Test that points are symmetric about zero."""
        for n in get_available_orders():
            points, weights = get_gauss_points(n)
            # Points should be symmetric: p[i] = -p[n-1-i]
            assert np.allclose(points, -np.flip(points), rtol=1e-6), \
                f"Order {n}: points not symmetric"
    
    def test_weights_symmetric(self):
        """Test that weights are symmetric."""
        for n in get_available_orders():
            points, weights = get_gauss_points(n)
            # Weights should be symmetric: w[i] = w[n-1-i]
            assert np.allclose(weights, np.flip(weights), rtol=1e-6), \
                f"Order {n}: weights not symmetric"
    
    def test_invalid_order_raises_error(self):
        """Test that unsupported order raises ValueError."""
        with pytest.raises(ValueError, match="Unsupported quadrature order"):
            get_gauss_points(9)  # Not in our list
        
        with pytest.raises(ValueError, match="Unsupported quadrature order"):
            get_gauss_points(100)
    
    def test_returns_copies_not_references(self):
        """Test that get_gauss_points returns copies, not references."""
        points1, weights1 = get_gauss_points(5)
        points2, weights2 = get_gauss_points(5)
        
        # Modify first return
        points1[0] = 999.0
        weights1[0] = 999.0
        
        # Second return should be unaffected
        assert points2[0] != 999.0
        assert weights2[0] != 999.0
    
    def test_integrate_constant_function(self):
        """Test integration of f(x) = 1 over [-1, 1]."""
        for n in [2, 5, 10]:
            points, weights = get_gauss_points(n)
            result = np.sum(weights * 1.0)
            expected = 2.0  # Integral of 1 over [-1, 1]
            assert np.isclose(result, expected, rtol=1e-6), \
                f"Order {n}: integral of 1 = {result}, expected {expected}"
    
    def test_integrate_linear_function(self):
        """Test integration of f(x) = x over [-1, 1] (should be 0)."""
        for n in [2, 5, 10]:
            points, weights = get_gauss_points(n)
            result = np.sum(weights * points)
            assert np.isclose(result, 0.0, atol=1e-10), \
                f"Order {n}: integral of x = {result}, expected 0"
    
    def test_integrate_quadratic_function(self):
        """Test integration of f(x) = x² over [-1, 1]."""
        for n in [2, 5, 10]:
            points, weights = get_gauss_points(n)
            result = np.sum(weights * points**2)
            expected = 2.0 / 3.0  # ∫x²dx from -1 to 1 = 2/3 (not times 2!)
            assert np.isclose(result, expected, rtol=1e-6), \
                f"Order {n}: integral of x² = {result}, expected {expected}"
    
    def test_integrate_polynomial(self):
        """Test exact integration of polynomials up to degree 2n-1."""
        # 5-point rule integrates exactly up to degree 9
        n = 5
        points, weights = get_gauss_points(n)
        
        # Test x^4 (degree 4 < 9)
        result = np.sum(weights * points**4)
        expected = 2.0 / 5.0  # ∫x⁴dx from -1 to 1 = 2/5
        assert np.isclose(result, expected, rtol=1e-6)
        
        # Test x^6 (degree 6 < 9)
        result = np.sum(weights * points**6)
        expected = 2.0 / 7.0  # ∫x⁶dx from -1 to 1 = 2/7
        assert np.isclose(result, expected, rtol=1e-6)
    
    def test_verify_quadrature_all_orders(self):
        """Test that all quadrature rules pass verification."""
        for n in get_available_orders():
            assert verify_quadrature(n), f"Order {n} failed verification"
    
    def test_verify_quadrature_verbose(self, capsys):
        """Test verbose output of verify_quadrature."""
        result = verify_quadrature(10, verbose=True)
        
        assert result is True
        
        captured = capsys.readouterr()
        assert "10-point" in captured.out
        assert "Sum of weights" in captured.out
        assert "symmetric" in captured.out
    
    def test_data_structure_complete(self):
        """Test that all data entries have required fields."""
        for n, data in GAUSS_LEGENDRE_DATA.items():
            assert 'points' in data
            assert 'weights' in data
            
            points = data['points']
            weights = data['weights']
            
            # Same length
            assert len(points) == len(weights)
            assert len(points) == n
            
            # Correct types
            assert isinstance(points, np.ndarray)
            assert isinstance(weights, np.ndarray)
    
    def test_comparison_with_numpy(self):
        """Compare with numpy's Gauss-Legendre implementation."""
        # Note: numpy uses different normalization (weights sum to 2 in ours)
        for n in [2, 3, 5, 8]:
            our_points, our_weights = get_gauss_points(n)
            np_points, np_weights = np.polynomial.legendre.leggauss(n)
            
            # Points should match exactly
            assert np.allclose(our_points, np_points, rtol=1e-6), \
                f"Order {n}: points differ from numpy"
            
            # Weights match after scaling (numpy weights sum to 2 by default)
            assert np.allclose(our_weights, np_weights, rtol=1e-6), \
                f"Order {n}: weights differ from numpy"
