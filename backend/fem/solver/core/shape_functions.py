"""Shape functions and their derivatives for 2-D reference elements.

Each function takes (xi, eta) in reference coordinates and returns:
    N:  ndarray of shape (n_nodes,)       — shape function values
    dN: ndarray of shape (n_nodes, 2)     — derivatives [dN/dxi, dN/deta]

Reference domains:
    Tri3/Tri6 : {(0,0), (1,0), (0,1)}
    Quad4     : {(-1,-1), (1,-1), (1,1), (-1,1)}
"""

import numpy as np
from numpy import ndarray


def tri3_shape(xi: float, eta: float) -> tuple[ndarray, ndarray]:
    """Linear triangle — 3 nodes.

    N1 = 1 - xi - eta
    N2 = xi
    N3 = eta
    """
    N = np.array([1.0 - xi - eta, xi, eta])

    dN = np.array(
        [
            [-1.0, -1.0],
            [1.0, 0.0],
            [0.0, 1.0],
        ]
    )
    return N, dN


def tri6_shape(xi: float, eta: float) -> tuple[ndarray, ndarray]:
    """Quadratic triangle — 6 nodes.

    Corner nodes:
        N1 = (1-xi-eta)(1-2xi-2eta)
        N2 = xi(2xi-1)
        N3 = eta(2eta-1)
    Midside nodes:
        N4 = 4xi(1-xi-eta)
        N5 = 4xi*eta
        N6 = 4eta(1-xi-eta)
    """
    lam = 1.0 - xi - eta  # barycentric coordinate lambda_1

    N = np.array(
        [
            lam * (2.0 * lam - 1.0),
            xi * (2.0 * xi - 1.0),
            eta * (2.0 * eta - 1.0),
            4.0 * xi * lam,
            4.0 * xi * eta,
            4.0 * eta * lam,
        ]
    )

    dN = np.array(
        [
            # dN/dxi               dN/deta
            [4.0 * xi + 4.0 * eta - 3.0, 4.0 * xi + 4.0 * eta - 3.0],
            [4.0 * xi - 1.0, 0.0],
            [0.0, 4.0 * eta - 1.0],
            [4.0 - 8.0 * xi - 4.0 * eta, -4.0 * xi],
            [4.0 * eta, 4.0 * xi],
            [-4.0 * eta, 4.0 - 4.0 * xi - 8.0 * eta],
        ]
    )
    return N, dN


def quad4_shape(xi: float, eta: float) -> tuple[ndarray, ndarray]:
    r"""Bilinear quadrilateral — 4 nodes.

    N_i = 1/4 (1 + xi_i * xi)(1 + eta_i * eta)

    Node ordering: (-1,-1), (1,-1), (1,1), (-1,1)
    """
    xi_nodes = np.array([-1.0, 1.0, 1.0, -1.0])
    eta_nodes = np.array([-1.0, -1.0, 1.0, 1.0])

    N = 0.25 * (1.0 + xi_nodes * xi) * (1.0 + eta_nodes * eta)

    dN_dxi = 0.25 * xi_nodes * (1.0 + eta_nodes * eta)
    dN_deta = 0.25 * (1.0 + xi_nodes * xi) * eta_nodes

    dN = np.column_stack([dN_dxi, dN_deta])
    return N, dN
