"""Tests for Gauss quadrature rules (triangles and quadrilaterals).

Verifies:
1. Weights sum to reference-domain area (1/2 for tri, 4 for quad)
2. Points lie within the reference domain
3. Polynomial exactness: rule of order p integrates polynomials up to degree p exactly
4. Correct number of quadrature points per order
"""

import numpy as np
import pytest

from backend.fem.solver.core.quadrature import (
    get_quadrature_rule,
)


class TestTriangleQuadrature:
    """Gauss rules for the reference triangle {(0,0),(1,0),(0,1)}."""

    @pytest.mark.parametrize("order", [1, 2, 3, 5])
    def test_weights_sum_to_area(self, order):
        """Weights must sum to reference triangle area = 1/2."""
        points, weights = get_quadrature_rule("triangle", order)
        assert weights.sum() == pytest.approx(0.5)

    @pytest.mark.parametrize("order", [1, 2, 3, 5])
    def test_points_inside_domain(self, order):
        """All quadrature points must lie within the reference triangle."""
        points, weights = get_quadrature_rule("triangle", order)
        for xi, eta in points:
            assert xi >= -1e-15, f"xi={xi} < 0"
            assert eta >= -1e-15, f"eta={eta} < 0"
            assert xi + eta <= 1.0 + 1e-15, f"xi+eta={xi + eta} > 1"

    @pytest.mark.parametrize("order", [1, 2, 5])
    def test_positive_weights(self, order):
        """All weights must be positive (order 3 excluded — has negative center weight)."""
        _, weights = get_quadrature_rule("triangle", order)
        assert np.all(weights > 0)

    def test_order1_single_point(self):
        """Order 1 should use 1 point (centroid)."""
        points, weights = get_quadrature_rule("triangle", 1)
        assert len(points) == 1
        assert len(weights) == 1
        np.testing.assert_allclose(points[0], [1 / 3, 1 / 3], atol=1e-14)

    def test_order2_three_points(self):
        """Order 2 should use 3 points."""
        points, weights = get_quadrature_rule("triangle", 2)
        assert len(points) == 3

    def test_order3_four_points(self):
        """Order 3 should use 4 points."""
        points, weights = get_quadrature_rule("triangle", 3)
        assert len(points) == 4

    def test_order5_seven_points(self):
        """Order 5 should use 7 points."""
        points, weights = get_quadrature_rule("triangle", 5)
        assert len(points) == 7

    def test_integrate_constant(self):
        """∫∫ 1 dA = 1/2 (area of reference triangle)."""
        points, weights = get_quadrature_rule("triangle", 1)
        result = np.sum(weights)
        assert result == pytest.approx(0.5)

    def test_integrate_linear(self):
        r"""∫∫ ξ dA over reference triangle = 1/6."""
        points, weights = get_quadrature_rule("triangle", 1)
        result = np.sum(weights * points[:, 0])
        assert result == pytest.approx(1.0 / 6.0)

    def test_integrate_quadratic_with_order2(self):
        r"""∫∫ ξ² dA over reference triangle = 1/12."""
        points, weights = get_quadrature_rule("triangle", 2)
        result = np.sum(weights * points[:, 0] ** 2)
        assert result == pytest.approx(1.0 / 12.0)

    def test_integrate_cubic_with_order3(self):
        r"""∫∫ ξ²η dA over reference triangle = 1/60."""
        points, weights = get_quadrature_rule("triangle", 3)
        result = np.sum(weights * points[:, 0] ** 2 * points[:, 1])
        assert result == pytest.approx(1.0 / 60.0)

    def test_integrate_quintic_with_order5(self):
        r"""∫∫ ξ³η² dA over reference triangle.

        Analytical: ∫₀¹ ∫₀^{1-η} ξ³η² dξ dη = 1/420
        (via Beta function: 1/4 · B(3,5) = 1/4 · 2!·4!/7! = 1/420)
        """
        points, weights = get_quadrature_rule("triangle", 5)
        result = np.sum(weights * points[:, 0] ** 3 * points[:, 1] ** 2)
        assert result == pytest.approx(1 / 420, rel=1e-12)


class TestQuadQuadrature:
    """Gauss rules for the reference quad {(-1,-1),(1,-1),(1,1),(-1,1)}."""

    @pytest.mark.parametrize("order", [2, 3])
    def test_weights_sum_to_area(self, order):
        """Weights must sum to reference quad area = 4."""
        points, weights = get_quadrature_rule("quad", order)
        assert weights.sum() == pytest.approx(4.0)

    @pytest.mark.parametrize("order", [2, 3])
    def test_points_inside_domain(self, order):
        """All quadrature points must lie within [-1,1]²."""
        points, weights = get_quadrature_rule("quad", order)
        for xi, eta in points:
            assert abs(xi) <= 1.0 + 1e-15
            assert abs(eta) <= 1.0 + 1e-15

    @pytest.mark.parametrize("order", [2, 3])
    def test_positive_weights(self, order):
        """All weights must be positive."""
        _, weights = get_quadrature_rule("quad", order)
        assert np.all(weights > 0)

    def test_order2_four_points(self):
        """2×2 Gauss-Legendre = 4 points."""
        points, weights = get_quadrature_rule("quad", 2)
        assert len(points) == 4

    def test_order3_nine_points(self):
        """3×3 Gauss-Legendre = 9 points."""
        points, weights = get_quadrature_rule("quad", 3)
        assert len(points) == 9

    def test_integrate_constant(self):
        """∫∫ 1 dA = 4 (area of reference quad)."""
        points, weights = get_quadrature_rule("quad", 2)
        result = np.sum(weights)
        assert result == pytest.approx(4.0)

    def test_integrate_linear(self):
        r"""∫∫ ξ dA over [-1,1]² = 0 (odd function on symmetric domain)."""
        points, weights = get_quadrature_rule("quad", 2)
        result = np.sum(weights * points[:, 0])
        assert result == pytest.approx(0.0, abs=1e-14)

    def test_integrate_quadratic(self):
        r"""∫∫ ξ² dA over [-1,1]² = 4/3."""
        points, weights = get_quadrature_rule("quad", 2)
        result = np.sum(weights * points[:, 0] ** 2)
        assert result == pytest.approx(4.0 / 3.0)

    def test_integrate_cubic_with_order2(self):
        r"""∫∫ ξ³ dA over [-1,1]² = 0 (exact for 2×2 Gauss, degree 3)."""
        points, weights = get_quadrature_rule("quad", 2)
        result = np.sum(weights * points[:, 0] ** 3)
        assert result == pytest.approx(0.0, abs=1e-14)

    def test_integrate_quintic_with_order3(self):
        r"""∫∫ ξ²η³ dA over [-1,1]² = 0 (odd in η)."""
        points, weights = get_quadrature_rule("quad", 3)
        result = np.sum(weights * points[:, 0] ** 2 * points[:, 1] ** 3)
        assert result == pytest.approx(0.0, abs=1e-14)

    def test_integrate_biquadratic_with_order2(self):
        r"""∫∫ ξ²η² dA over [-1,1]² = 4/9.

        This is degree 4 — exact with 2×2 Gauss (integrates up to degree 3,
        but ξ²η² is a product of 1D polynomials each of degree 2 which is
        exact with 2-point 1D Gauss).
        """
        points, weights = get_quadrature_rule("quad", 2)
        result = np.sum(weights * points[:, 0] ** 2 * points[:, 1] ** 2)
        assert result == pytest.approx(4.0 / 9.0)


class TestQuadratureErrors:
    """Test error handling."""

    def test_invalid_domain(self):
        with pytest.raises(ValueError, match="domain"):
            get_quadrature_rule("hexahedron", 2)

    def test_invalid_order_triangle(self):
        with pytest.raises(ValueError, match="order"):
            get_quadrature_rule("triangle", 99)

    def test_invalid_order_quad(self):
        with pytest.raises(ValueError, match="order"):
            get_quadrature_rule("quad", 99)
