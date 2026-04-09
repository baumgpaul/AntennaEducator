"""Tests for Dirichlet BC application and linear solvers.

Verifies:
1. Dirichlet elimination: zero rows/cols, diagonal = 1, RHS modified
2. Symmetry preserved after Dirichlet elimination
3. Direct solver (spsolve) on small SPD systems
4. CG solver convergence on SPD systems
"""

import numpy as np
import pytest
from scipy.sparse import csr_matrix

from backend.fem.solver.core.boundary import apply_dirichlet
from backend.fem.solver.core.solver import solve_system


class TestDirichletElimination:
    """Test Dirichlet BC application via row/column elimination."""

    @pytest.fixture
    def simple_system(self):
        """3×3 SPD system: K·u = f with known solution.

        K = [[2, -1,  0],
             [-1, 2, -1],
             [0, -1,  2]]
        f = [1, 0, 1]
        Exact: u = [1, 1, 1]
        """
        K = csr_matrix(
            np.array(
                [
                    [2.0, -1.0, 0.0],
                    [-1.0, 2.0, -1.0],
                    [0.0, -1.0, 2.0],
                ]
            )
        )
        f = np.array([1.0, 0.0, 1.0])
        return K, f

    def test_no_bcs(self, simple_system):
        """If no BCs specified, K and f should be unchanged."""
        K, f = simple_system
        K_mod, f_mod = apply_dirichlet(K, f, {})
        np.testing.assert_allclose(K_mod.toarray(), K.toarray())
        np.testing.assert_allclose(f_mod, f)

    def test_single_bc(self, simple_system):
        """Fix node 0 to value 5.0."""
        K, f = simple_system
        bc_dict = {0: 5.0}
        K_mod, f_mod = apply_dirichlet(K, f, bc_dict)

        K_dense = K_mod.toarray()
        # Row 0: should be [1, 0, 0]
        np.testing.assert_allclose(K_dense[0, :], [1.0, 0.0, 0.0])
        # Column 0: should be [1, 0, 0]
        np.testing.assert_allclose(K_dense[:, 0], [1.0, 0.0, 0.0])
        # RHS at node 0
        assert f_mod[0] == pytest.approx(5.0)
        # RHS at node 1: f[1] - K_orig[1,0]*5.0 = 0 - (-1)*5 = 5
        assert f_mod[1] == pytest.approx(5.0)

    def test_two_bcs(self, simple_system):
        """Fix node 0 = 0.0 and node 2 = 10.0."""
        K, f = simple_system
        bc_dict = {0: 0.0, 2: 10.0}
        K_mod, f_mod = apply_dirichlet(K, f, bc_dict)

        K_dense = K_mod.toarray()
        # Row/Col 0 and 2 eliminated
        assert K_dense[0, 0] == pytest.approx(1.0)
        assert K_dense[2, 2] == pytest.approx(1.0)
        assert f_mod[0] == pytest.approx(0.0)
        assert f_mod[2] == pytest.approx(10.0)

    def test_symmetry_preserved(self, simple_system):
        """Elimination must preserve symmetry."""
        K, f = simple_system
        bc_dict = {0: 1.0}
        K_mod, f_mod = apply_dirichlet(K, f, bc_dict)
        K_dense = K_mod.toarray()
        np.testing.assert_allclose(K_dense, K_dense.T, atol=1e-14)

    def test_solve_with_dirichlet(self, simple_system):
        """1D Laplace: u''=0, u(0)=0, u(2)=100 → u = [0, 50, 100]."""
        K = csr_matrix(
            np.array(
                [
                    [1.0, -1.0, 0.0],
                    [-1.0, 2.0, -1.0],
                    [0.0, -1.0, 1.0],
                ]
            )
        )
        f = np.zeros(3)
        bc_dict = {0: 0.0, 2: 100.0}

        K_mod, f_mod = apply_dirichlet(K, f, bc_dict)
        u = solve_system(K_mod, f_mod, method="direct")

        np.testing.assert_allclose(u, [0.0, 50.0, 100.0], atol=1e-10)


class TestSolveSystem:
    """Test linear system solvers."""

    @pytest.fixture
    def spd_system(self):
        """4×4 SPD system with known solution u = [1, 2, 3, 4]."""
        K = csr_matrix(
            np.array(
                [
                    [4.0, -1.0, 0.0, 0.0],
                    [-1.0, 4.0, -1.0, 0.0],
                    [0.0, -1.0, 4.0, -1.0],
                    [0.0, 0.0, -1.0, 4.0],
                ]
            )
        )
        u_exact = np.array([1.0, 2.0, 3.0, 4.0])
        f = K @ u_exact
        return K, f, u_exact

    def test_direct_solver(self, spd_system):
        """Direct solver (spsolve) should give exact result."""
        K, f, u_exact = spd_system
        u = solve_system(K, f, method="direct")
        np.testing.assert_allclose(u, u_exact, atol=1e-12)

    def test_cg_solver(self, spd_system):
        """CG solver should converge for SPD system."""
        K, f, u_exact = spd_system
        u = solve_system(K, f, method="cg", tol=1e-12)
        np.testing.assert_allclose(u, u_exact, atol=1e-10)

    def test_gmres_solver(self, spd_system):
        """GMRES solver should converge."""
        K, f, u_exact = spd_system
        u = solve_system(K, f, method="gmres", tol=1e-12)
        np.testing.assert_allclose(u, u_exact, atol=1e-10)

    def test_invalid_method(self, spd_system):
        """Unknown method should raise ValueError."""
        K, f, _ = spd_system
        with pytest.raises(ValueError, match="method"):
            solve_system(K, f, method="invalid")
