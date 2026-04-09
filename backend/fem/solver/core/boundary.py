"""Dirichlet boundary condition application via symmetric elimination.

Modifies K and f in-place-safe manner:
1. For each constrained DOF i with value φ₀:
   - Subtract K[:,i] * φ₀ from f (distribute known value to RHS)
   - Zero row i and column i
   - Set K[i,i] = 1, f[i] = φ₀
This preserves symmetry of K.
"""

from numpy import ndarray
from scipy.sparse import csr_matrix, lil_matrix


def apply_dirichlet(
    K: csr_matrix,
    f: ndarray,
    bc_dict: dict[int, float],
) -> tuple[csr_matrix, ndarray]:
    """Apply Dirichlet BCs via symmetric row/column elimination.

    Parameters
    ----------
    K : csr_matrix (n, n)
        Global stiffness matrix.
    f : ndarray (n,)
        Global load vector.
    bc_dict : dict[int, float]
        Maps DOF index → prescribed value.

    Returns
    -------
    K_mod : csr_matrix (n, n)
        Modified stiffness matrix.
    f_mod : ndarray (n,)
        Modified load vector.
    """
    if not bc_dict:
        return K, f.copy()

    # Work with LIL for efficient row/column modification
    K_lil = lil_matrix(K)
    f_mod = f.copy()
    n = K.shape[0]

    for dof, val in bc_dict.items():
        # Subtract contribution of known value from RHS
        for j in range(n):
            if j != dof:
                f_mod[j] -= K_lil[j, dof] * val

        # Zero row and column
        K_lil[dof, :] = 0.0
        K_lil[:, dof] = 0.0

        # Set diagonal and RHS
        K_lil[dof, dof] = 1.0
        f_mod[dof] = val

    return K_lil.tocsr(), f_mod
