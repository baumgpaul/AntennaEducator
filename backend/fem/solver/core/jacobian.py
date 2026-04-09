"""Isoparametric Jacobian mapping: reference ↔ physical coordinates.

The Jacobian matrix J maps differentials from reference (ξ,η) to physical (x,y):

    J = ∂x/∂ξ = Σ (∂Nᵢ/∂ξ) · xᵢ   →   J[k,l] = Σᵢ dN_dxi[i,l] * coords[i,k]

Physical-space gradients: dN/dx = dN/dξ · J⁻¹ᵀ  (or equivalently J⁻ᵀ · dN/dξᵀ)
"""

import numpy as np
from numpy import ndarray


def compute_jacobian(
    node_coords: ndarray,
    dN_dxi: ndarray,
) -> tuple[ndarray, float, ndarray]:
    """Compute the Jacobian matrix, its determinant, and inverse.

    Parameters
    ----------
    node_coords : ndarray (n_nodes, 2)
        Physical coordinates of the element nodes.
    dN_dxi : ndarray (n_nodes, 2)
        Shape function derivatives w.r.t. reference coordinates [dN/dξ, dN/dη].

    Returns
    -------
    J : ndarray (2, 2)
        Jacobian matrix.
    det_J : float
        Determinant of J (must be positive for valid elements).
    inv_J : ndarray (2, 2)
        Inverse of J.
    """
    # J[k,l] = Σᵢ coords[i,k] * dN_dxi[i,l]  →  J = coords^T @ dN_dxi
    J = node_coords.T @ dN_dxi

    det_J = float(np.linalg.det(J))
    inv_J = np.linalg.inv(J)

    return J, det_J, inv_J


def compute_dN_dx(
    node_coords: ndarray,
    dN_dxi: ndarray,
) -> tuple[ndarray, float]:
    """Compute shape function gradients in physical coordinates.

    Parameters
    ----------
    node_coords : ndarray (n_nodes, 2)
        Physical coordinates of the element nodes.
    dN_dxi : ndarray (n_nodes, 2)
        Shape function derivatives w.r.t. reference coordinates.

    Returns
    -------
    dN_dx : ndarray (n_nodes, 2)
        Shape function derivatives w.r.t. physical coordinates [dN/dx, dN/dy].
    det_J : float
        Determinant of the Jacobian.
    """
    J, det_J, inv_J = compute_jacobian(node_coords, dN_dxi)

    # dN/dx = dN/dξ · J⁻¹
    dN_dx = dN_dxi @ inv_J

    return dN_dx, det_J
