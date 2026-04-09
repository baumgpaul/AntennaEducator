"""Gauss quadrature rules for 2-D reference elements.

Provides pre-tabulated quadrature points and weights for:
    - Triangles: Dunavant rules (orders 1, 2, 3, 5)
    - Quadrilaterals: tensor-product Gauss-Legendre (orders 2, 3)

Usage:
    points, weights = get_quadrature_rule("triangle", 2)
    # points: ndarray (n_pts, 2) — coordinates in reference space
    # weights: ndarray (n_pts,) — quadrature weights (include area factor)
"""

import numpy as np
from numpy import ndarray

# ---------------------------------------------------------------------------
# Triangle rules — Dunavant points on {(0,0),(1,0),(0,1)}, area = 1/2
# Weights include the 1/2 area factor.
# ---------------------------------------------------------------------------

_TRI_RULES: dict[int, tuple[list[list[float]], list[float]]] = {
    # Order 1: 1 point (centroid), exact for degree 1
    1: (
        [[1 / 3, 1 / 3]],
        [1 / 2],
    ),
    # Order 2: 3 points, exact for degree 2
    2: (
        [
            [1 / 6, 1 / 6],
            [2 / 3, 1 / 6],
            [1 / 6, 2 / 3],
        ],
        [1 / 6, 1 / 6, 1 / 6],
    ),
    # Order 3: 4 points, exact for degree 3
    3: (
        [
            [1 / 3, 1 / 3],
            [1 / 5, 1 / 5],
            [3 / 5, 1 / 5],
            [1 / 5, 3 / 5],
        ],
        [-27 / 96, 25 / 96, 25 / 96, 25 / 96],
    ),
    # Order 5: 7 points, exact for degree 5
    5: (
        [
            [1 / 3, 1 / 3],
            [0.059715871789770, 0.470142064105115],
            [0.470142064105115, 0.059715871789770],
            [0.470142064105115, 0.470142064105115],
            [0.797426985353087, 0.101286507323456],
            [0.101286507323456, 0.797426985353087],
            [0.101286507323456, 0.101286507323456],
        ],
        [
            0.1125,
            0.066197076394253,
            0.066197076394253,
            0.066197076394253,
            0.062969590272414,
            0.062969590272414,
            0.062969590272414,
        ],
    ),
}

# ---------------------------------------------------------------------------
# Quad rules — tensor-product Gauss-Legendre on [-1,1]², area = 4
# ---------------------------------------------------------------------------

# 1-D Gauss-Legendre points and weights on [-1,1]
_GL_1D: dict[int, tuple[list[float], list[float]]] = {
    2: (
        [-1 / np.sqrt(3), 1 / np.sqrt(3)],
        [1.0, 1.0],
    ),
    3: (
        [-np.sqrt(3 / 5), 0.0, np.sqrt(3 / 5)],
        [5 / 9, 8 / 9, 5 / 9],
    ),
}


def _build_quad_rule(order: int) -> tuple[ndarray, ndarray]:
    """Build 2-D tensor-product rule from 1-D Gauss-Legendre."""
    pts_1d, wts_1d = _GL_1D[order]
    points = []
    weights = []
    for i, xi in enumerate(pts_1d):
        for j, eta in enumerate(pts_1d):
            points.append([xi, eta])
            weights.append(wts_1d[i] * wts_1d[j])
    return np.array(points), np.array(weights)


_QUAD_RULES: dict[int, tuple[ndarray, ndarray]] = {
    order: _build_quad_rule(order) for order in _GL_1D
}


def get_quadrature_rule(domain: str, order: int) -> tuple[ndarray, ndarray]:
    """Return quadrature points and weights for the given reference domain.

    Parameters
    ----------
    domain : str
        Either "triangle" or "quad".
    order : int
        Quadrature order (polynomial degree of exactness).

    Returns
    -------
    points : ndarray (n_pts, 2)
        Quadrature point coordinates in the reference element.
    weights : ndarray (n_pts,)
        Quadrature weights (including area/Jacobian of the reference element).

    Raises
    ------
    ValueError
        If the domain is unknown or the order is not available.
    """
    if domain == "triangle":
        if order not in _TRI_RULES:
            available = sorted(_TRI_RULES.keys())
            raise ValueError(
                f"Triangle quadrature order {order} not available. "
                f"Supported orders: {available}"
            )
        pts, wts = _TRI_RULES[order]
        return np.array(pts), np.array(wts)

    if domain == "quad":
        if order not in _QUAD_RULES:
            available = sorted(_QUAD_RULES.keys())
            raise ValueError(
                f"Quad quadrature order {order} not available. " f"Supported orders: {available}"
            )
        return _QUAD_RULES[order]

    raise ValueError(f"Unknown quadrature domain '{domain}'. " f"Supported: 'triangle', 'quad'")
