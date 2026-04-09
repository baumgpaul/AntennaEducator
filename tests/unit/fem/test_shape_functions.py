"""Tests for FEM shape functions (Tri3, Tri6, Quad4).

Verifies the fundamental mathematical properties that shape functions
must satisfy for a correct FEM formulation:
1. Partition of unity: sum of all N_i = 1 at every point
2. Kronecker delta: N_i(node_j) = delta_ij
3. Derivative consistency: analytical vs finite-difference gradients
4. Correct array shapes
"""

import numpy as np
import pytest

from backend.fem.solver.core.shape_functions import (
    quad4_shape,
    tri3_shape,
    tri6_shape,
)

# --------------------------------------------------------------------------
# Tri3: reference triangle {(0,0), (1,0), (0,1)}
# --------------------------------------------------------------------------


class TestTri3Shape:
    """Linear triangle (3 nodes)."""

    # Node coordinates in reference space
    NODES = np.array([[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]])

    def test_return_shapes(self):
        N, dN = tri3_shape(0.25, 0.25)
        assert N.shape == (3,)
        assert dN.shape == (3, 2)

    def test_partition_of_unity_at_centroid(self):
        N, _ = tri3_shape(1 / 3, 1 / 3)
        assert N.sum() == pytest.approx(1.0)

    def test_partition_of_unity_at_nodes(self):
        for xi, eta in self.NODES:
            N, _ = tri3_shape(xi, eta)
            assert N.sum() == pytest.approx(1.0)

    def test_partition_of_unity_random_points(self):
        rng = np.random.default_rng(42)
        for _ in range(20):
            xi = rng.random()
            eta = rng.random() * (1.0 - xi)
            N, _ = tri3_shape(xi, eta)
            assert N.sum() == pytest.approx(1.0)

    def test_kronecker_delta(self):
        for i, (xi, eta) in enumerate(self.NODES):
            N, _ = tri3_shape(xi, eta)
            for j in range(3):
                expected = 1.0 if i == j else 0.0
                assert N[j] == pytest.approx(
                    expected
                ), f"N_{j}(node_{i}) should be {expected}, got {N[j]}"

    def test_derivatives_constant(self):
        """Tri3 derivatives are constant (linear functions)."""
        _, dN1 = tri3_shape(0.1, 0.2)
        _, dN2 = tri3_shape(0.5, 0.3)
        np.testing.assert_allclose(dN1, dN2)

    def test_derivative_values(self):
        """Known analytical derivatives for Tri3."""
        _, dN = tri3_shape(0.0, 0.0)
        # dN/dxi = [-1, 1, 0]
        np.testing.assert_allclose(dN[:, 0], [-1.0, 1.0, 0.0])
        # dN/deta = [-1, 0, 1]
        np.testing.assert_allclose(dN[:, 1], [-1.0, 0.0, 1.0])

    def test_derivative_sum_zero(self):
        """Partition-of-unity implies sum of derivatives = 0."""
        _, dN = tri3_shape(0.4, 0.1)
        np.testing.assert_allclose(dN.sum(axis=0), [0.0, 0.0], atol=1e-14)


# --------------------------------------------------------------------------
# Tri6: quadratic triangle (6 nodes)
# --------------------------------------------------------------------------


class TestTri6Shape:
    """Quadratic triangle (6 nodes)."""

    # Corner nodes + midside nodes
    NODES = np.array(
        [
            [0.0, 0.0],  # node 0 (corner)
            [1.0, 0.0],  # node 1 (corner)
            [0.0, 1.0],  # node 2 (corner)
            [0.5, 0.0],  # node 3 (midside 0-1)
            [0.5, 0.5],  # node 4 (midside 1-2)
            [0.0, 0.5],  # node 5 (midside 2-0)
        ]
    )

    def test_return_shapes(self):
        N, dN = tri6_shape(0.25, 0.25)
        assert N.shape == (6,)
        assert dN.shape == (6, 2)

    def test_partition_of_unity_at_centroid(self):
        N, _ = tri6_shape(1 / 3, 1 / 3)
        assert N.sum() == pytest.approx(1.0)

    def test_partition_of_unity_at_nodes(self):
        for xi, eta in self.NODES:
            N, _ = tri6_shape(xi, eta)
            assert N.sum() == pytest.approx(1.0)

    def test_partition_of_unity_random_points(self):
        rng = np.random.default_rng(42)
        for _ in range(20):
            xi = rng.random()
            eta = rng.random() * (1.0 - xi)
            N, _ = tri6_shape(xi, eta)
            assert N.sum() == pytest.approx(1.0)

    def test_kronecker_delta(self):
        for i, (xi, eta) in enumerate(self.NODES):
            N, _ = tri6_shape(xi, eta)
            for j in range(6):
                expected = 1.0 if i == j else 0.0
                assert N[j] == pytest.approx(
                    expected, abs=1e-14
                ), f"N_{j}(node_{i}) should be {expected}, got {N[j]}"

    def test_derivative_sum_zero(self):
        """Partition-of-unity implies sum of derivatives = 0."""
        _, dN = tri6_shape(0.3, 0.2)
        np.testing.assert_allclose(dN.sum(axis=0), [0.0, 0.0], atol=1e-13)

    def test_derivative_finite_difference(self):
        """Compare analytical derivatives with finite differences."""
        xi0, eta0 = 0.3, 0.2
        h = 1e-7
        N0, dN = tri6_shape(xi0, eta0)

        # d/dxi
        N_plus, _ = tri6_shape(xi0 + h, eta0)
        fd_dxi = (N_plus - N0) / h
        np.testing.assert_allclose(dN[:, 0], fd_dxi, atol=1e-5)

        # d/deta
        N_plus, _ = tri6_shape(xi0, eta0 + h)
        fd_deta = (N_plus - N0) / h
        np.testing.assert_allclose(dN[:, 1], fd_deta, atol=1e-5)


# --------------------------------------------------------------------------
# Quad4: bilinear quadrilateral {(-1,-1), (1,-1), (1,1), (-1,1)}
# --------------------------------------------------------------------------


class TestQuad4Shape:
    """Bilinear quadrilateral (4 nodes)."""

    NODES = np.array(
        [
            [-1.0, -1.0],
            [1.0, -1.0],
            [1.0, 1.0],
            [-1.0, 1.0],
        ]
    )

    def test_return_shapes(self):
        N, dN = quad4_shape(0.0, 0.0)
        assert N.shape == (4,)
        assert dN.shape == (4, 2)

    def test_partition_of_unity_at_center(self):
        N, _ = quad4_shape(0.0, 0.0)
        assert N.sum() == pytest.approx(1.0)
        # All equal at center of bilinear quad
        np.testing.assert_allclose(N, [0.25, 0.25, 0.25, 0.25])

    def test_partition_of_unity_at_nodes(self):
        for xi, eta in self.NODES:
            N, _ = quad4_shape(xi, eta)
            assert N.sum() == pytest.approx(1.0)

    def test_partition_of_unity_random_points(self):
        rng = np.random.default_rng(42)
        for _ in range(20):
            xi = rng.uniform(-1, 1)
            eta = rng.uniform(-1, 1)
            N, _ = quad4_shape(xi, eta)
            assert N.sum() == pytest.approx(1.0)

    def test_kronecker_delta(self):
        for i, (xi, eta) in enumerate(self.NODES):
            N, _ = quad4_shape(xi, eta)
            for j in range(4):
                expected = 1.0 if i == j else 0.0
                assert N[j] == pytest.approx(
                    expected
                ), f"N_{j}(node_{i}) should be {expected}, got {N[j]}"

    def test_derivative_sum_zero(self):
        """Partition-of-unity implies sum of derivatives = 0."""
        _, dN = quad4_shape(0.3, -0.5)
        np.testing.assert_allclose(dN.sum(axis=0), [0.0, 0.0], atol=1e-14)

    def test_derivative_finite_difference(self):
        """Compare analytical derivatives with finite differences."""
        xi0, eta0 = 0.3, -0.5
        h = 1e-7
        N0, dN = quad4_shape(xi0, eta0)

        # d/dxi
        N_plus, _ = quad4_shape(xi0 + h, eta0)
        fd_dxi = (N_plus - N0) / h
        np.testing.assert_allclose(dN[:, 0], fd_dxi, atol=1e-5)

        # d/deta
        N_plus, _ = quad4_shape(xi0, eta0 + h)
        fd_deta = (N_plus - N0) / h
        np.testing.assert_allclose(dN[:, 1], fd_deta, atol=1e-5)

    def test_derivative_at_center(self):
        """Known analytical derivatives at center (0,0)."""
        _, dN = quad4_shape(0.0, 0.0)
        # dN/dxi: [-1/4*(1+eta_i)] at eta=0 → [-1/4, 1/4, 1/4, -1/4]
        np.testing.assert_allclose(dN[:, 0], [-0.25, 0.25, 0.25, -0.25])
        # dN/deta: [1/4*(1+xi_i)] at xi=0 → [-1/4, -1/4, 1/4, 1/4]
        np.testing.assert_allclose(dN[:, 1], [-0.25, -0.25, 0.25, 0.25])
