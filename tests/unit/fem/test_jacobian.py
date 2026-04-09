"""Tests for isoparametric Jacobian mapping.

Verifies:
1. Unit reference triangle maps correctly (identity Jacobian)
2. Scaled/translated triangles produce correct det(J) = 2*area
3. Quad: unit square mapping
4. Physical-space shape-function gradients dN/dx via inverse Jacobian
"""

import numpy as np
import pytest

from backend.fem.solver.core.jacobian import compute_dN_dx, compute_jacobian


class TestTriJacobian:
    """Jacobian for triangular elements."""

    def test_unit_triangle_jacobian(self):
        """Reference triangle maps to itself — J = I(2x2)."""
        # Physical coords = reference coords
        node_coords = np.array([[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]])
        # Tri3 dN/dxi (constant)
        dN_dxi = np.array([[-1.0, -1.0], [1.0, 0.0], [0.0, 1.0]])

        J, det_J, inv_J = compute_jacobian(node_coords, dN_dxi)

        np.testing.assert_allclose(J, np.eye(2), atol=1e-14)
        assert det_J == pytest.approx(1.0)
        np.testing.assert_allclose(inv_J, np.eye(2), atol=1e-14)

    def test_scaled_triangle(self):
        """Triangle with side length 2: area = 2, det(J) = 2."""
        node_coords = np.array([[0.0, 0.0], [2.0, 0.0], [0.0, 2.0]])
        dN_dxi = np.array([[-1.0, -1.0], [1.0, 0.0], [0.0, 1.0]])

        J, det_J, inv_J = compute_jacobian(node_coords, dN_dxi)

        np.testing.assert_allclose(J, 2.0 * np.eye(2), atol=1e-14)
        assert det_J == pytest.approx(4.0)

    def test_translated_triangle(self):
        """Translation doesn't affect Jacobian."""
        node_coords = np.array([[5.0, 3.0], [6.0, 3.0], [5.0, 4.0]])
        dN_dxi = np.array([[-1.0, -1.0], [1.0, 0.0], [0.0, 1.0]])

        J, det_J, inv_J = compute_jacobian(node_coords, dN_dxi)

        np.testing.assert_allclose(J, np.eye(2), atol=1e-14)
        assert det_J == pytest.approx(1.0)

    def test_rotated_triangle(self):
        r"""45° rotated right triangle.

        Nodes: (0,0), (1/√2, 1/√2), (-1/√2, 1/√2)
        The Jacobian should be the rotation matrix, det = 1.
        """
        s = 1.0 / np.sqrt(2)
        node_coords = np.array([[0.0, 0.0], [s, s], [-s, s]])
        dN_dxi = np.array([[-1.0, -1.0], [1.0, 0.0], [0.0, 1.0]])

        J, det_J, inv_J = compute_jacobian(node_coords, dN_dxi)

        assert det_J == pytest.approx(1.0, abs=1e-14)
        # J @ J^T should be identity (orthogonal)
        np.testing.assert_allclose(J @ J.T, np.eye(2), atol=1e-14)

    def test_non_unit_triangle_area(self):
        """General triangle: det(J) / 2 = area of triangle."""
        node_coords = np.array([[1.0, 0.0], [3.0, 1.0], [2.0, 4.0]])
        dN_dxi = np.array([[-1.0, -1.0], [1.0, 0.0], [0.0, 1.0]])

        _, det_J, _ = compute_jacobian(node_coords, dN_dxi)

        # Shoelface formula for area:
        # A = 0.5 * |x1(y2-y3) + x2(y3-y1) + x3(y1-y2)|
        x, y = node_coords[:, 0], node_coords[:, 1]
        area = 0.5 * abs(x[0] * (y[1] - y[2]) + x[1] * (y[2] - y[0]) + x[2] * (y[0] - y[1]))
        # area_physical = |det(J)| * area_ref = |det(J)| * 0.5
        assert area == pytest.approx(abs(det_J) * 0.5)


class TestQuadJacobian:
    """Jacobian for quadrilateral elements."""

    def test_unit_square(self):
        """[-1,1]² quad mapped to [0,1]² → J = 0.5*I."""
        node_coords = np.array([[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]])
        # dN/dxi at center (0,0)
        dN_dxi = np.array(
            [
                [-0.25, -0.25],
                [0.25, -0.25],
                [0.25, 0.25],
                [-0.25, 0.25],
            ]
        )

        J, det_J, inv_J = compute_jacobian(node_coords, dN_dxi)

        np.testing.assert_allclose(J, 0.5 * np.eye(2), atol=1e-14)
        assert det_J == pytest.approx(0.25)

    def test_scaled_rectangle(self):
        """Rectangle [0,4] x [0,2]: J = diag(2, 1), det = 2."""
        node_coords = np.array([[0.0, 0.0], [4.0, 0.0], [4.0, 2.0], [0.0, 2.0]])
        dN_dxi = np.array(
            [
                [-0.25, -0.25],
                [0.25, -0.25],
                [0.25, 0.25],
                [-0.25, 0.25],
            ]
        )

        J, det_J, inv_J = compute_jacobian(node_coords, dN_dxi)

        np.testing.assert_allclose(J, np.diag([2.0, 1.0]), atol=1e-14)
        assert det_J == pytest.approx(2.0)


class TestDNdx:
    """Test physical-space shape function gradients."""

    def test_tri3_unit_triangle(self):
        """On the unit reference triangle, dN/dx = dN/dxi."""
        node_coords = np.array([[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]])
        dN_dxi = np.array([[-1.0, -1.0], [1.0, 0.0], [0.0, 1.0]])

        dN_dx, det_J = compute_dN_dx(node_coords, dN_dxi)

        np.testing.assert_allclose(dN_dx, dN_dxi, atol=1e-14)
        assert det_J == pytest.approx(1.0)

    def test_tri3_scaled_triangle(self):
        """Scaled triangle: gradients should be 1/scale of reference."""
        scale = 3.0
        node_coords = np.array([[0.0, 0.0], [scale, 0.0], [0.0, scale]])
        dN_dxi = np.array([[-1.0, -1.0], [1.0, 0.0], [0.0, 1.0]])

        dN_dx, det_J = compute_dN_dx(node_coords, dN_dxi)

        expected_dN_dx = dN_dxi / scale
        np.testing.assert_allclose(dN_dx, expected_dN_dx, atol=1e-14)

    def test_partition_of_unity_gradient(self):
        """Sum of physical-space gradients must be zero (partition of unity)."""
        node_coords = np.array([[1.0, 0.0], [3.0, 1.0], [2.0, 4.0]])
        dN_dxi = np.array([[-1.0, -1.0], [1.0, 0.0], [0.0, 1.0]])

        dN_dx, _ = compute_dN_dx(node_coords, dN_dxi)

        np.testing.assert_allclose(dN_dx.sum(axis=0), [0.0, 0.0], atol=1e-14)

    def test_linear_field_gradient(self):
        """Gradient of a linear field φ = 2x + 3y is (2, 3)."""
        node_coords = np.array([[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]])
        dN_dxi = np.array([[-1.0, -1.0], [1.0, 0.0], [0.0, 1.0]])
        # φ at nodes: φ(0,0)=0, φ(1,0)=2, φ(0,1)=3
        phi = np.array([0.0, 2.0, 3.0])

        dN_dx, _ = compute_dN_dx(node_coords, dN_dxi)
        grad_phi = dN_dx.T @ phi  # (2, n_nodes) @ (n_nodes,) → (2,)

        np.testing.assert_allclose(grad_phi, [2.0, 3.0], atol=1e-14)

    def test_quad4_linear_field(self):
        """Gradient of φ = 5x - 2y on a unit square at center."""
        node_coords = np.array([[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]])
        dN_dxi = np.array(
            [
                [-0.25, -0.25],
                [0.25, -0.25],
                [0.25, 0.25],
                [-0.25, 0.25],
            ]
        )
        # φ at nodes: φ(0,0)=0, φ(1,0)=5, φ(1,1)=3, φ(0,1)=-2
        phi = np.array([0.0, 5.0, 3.0, -2.0])

        dN_dx, _ = compute_dN_dx(node_coords, dN_dxi)
        grad_phi = dN_dx.T @ phi

        np.testing.assert_allclose(grad_phi, [5.0, -2.0], atol=1e-14)
