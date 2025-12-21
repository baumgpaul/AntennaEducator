"""
Gauss-Legendre quadrature points and weights.

This module contains precomputed Gauss-Legendre quadrature points and weights

These quadrature rules are used for numerical integration of inductance and
potential coefficient calculations in the PEEC method. The points are defined
on the interval [-1, 1] with weights that sum to 2.

Usage:
    >>> from backend.solver.gauss_quadrature import get_gauss_points
    >>> points, weights = get_gauss_points(10)  # 10-point quadrature
    >>> # Use for integration: integral ≈ Σ(weights[i] * f(points[i]))
"""

import numpy as np
from typing import Tuple


# Precomputed Gauss-Legendre quadrature points and weights
# Points are on interval [-1, 1], weights sum to 2
GAUSS_LEGENDRE_DATA = {
    1: {
        'points': np.array([0.0]),
        'weights': np.array([2.0])
    },
    2: {
        'points': np.array([-0.57735027, 0.57735027]),
        'weights': np.array([1.0, 1.0])
    },
    3: {
        'points': np.array([-0.77459667, 0.0, 0.77459667]),
        'weights': np.array([0.55555556, 0.88888889, 0.55555556])
    },
    4: {
        'points': np.array([-0.86113631, -0.33998104, 0.33998104, 0.86113631]),
        'weights': np.array([0.34785485, 0.65214516, 0.65214516, 0.34785485])
    },
    5: {
        'points': np.array([-0.90617985, -0.53846931, 0.0, 0.53846931, 0.90617985]),
        'weights': np.array([0.23692689, 0.47862867, 0.56888889, 0.47862867, 0.23692689])
    },
    6: {
        'points': np.array([-0.93246951, -0.66120939, -0.23861919, 0.23861919, 0.66120939, 0.93246951]),
        'weights': np.array([0.17132449, 0.36076157, 0.46791394, 0.46791394, 0.36076157, 0.17132449])
    },
    7: {
        'points': np.array([-0.94910791, -0.74153119, -0.40584515, 0.0, 0.40584515, 0.74153119, 0.94910791]),
        'weights': np.array([0.12948497, 0.27970539, 0.38183005, 0.41795918, 0.38183005, 0.27970539, 0.12948497])
    },
    8: {
        'points': np.array([-0.96028986, -0.79666648, -0.52553241, -0.18343464, 0.18343464, 0.52553241, 0.79666648, 0.96028986]),
        'weights': np.array([0.10122854, 0.22238103, 0.31370665, 0.36268378, 0.36268378, 0.31370665, 0.22238103, 0.10122854])
    },
    10: {
        'points': np.array([-0.97390653, -0.86506337, -0.67940957, -0.43339539, -0.14887434, 0.14887434, 0.43339539, 0.67940957, 0.86506337, 0.97390653]),
        'weights': np.array([0.06667134, 0.14945135, 0.21908636, 0.26926672, 0.29552422, 0.29552422, 0.26926672, 0.21908636, 0.14945135, 0.06667134])
    },
    12: {
        'points': np.array([-0.98156063, -0.90411726, -0.76990267, -0.58731795, -0.36783150, -0.12523341, 0.12523341, 0.36783150, 0.58731795, 0.76990267, 0.90411726, 0.98156063]),
        'weights': np.array([0.04717534, 0.10693933, 0.16007833, 0.20316743, 0.23349254, 0.24914705, 0.24914705, 0.23349254, 0.20316743, 0.16007833, 0.10693933, 0.04717534])
    },
    14: {
        'points': np.array([-0.98628381, -0.92843488, -0.82720132, -0.68729290, -0.51524864, -0.31911237, -0.10805495, 0.10805495, 0.31911237, 0.51524864, 0.68729290, 0.82720132, 0.92843488, 0.98628381]),
        'weights': np.array([0.03511946, 0.08015809, 0.12151857, 0.15720317, 0.18553840, 0.20519846, 0.21526385, 0.21526385, 0.20519846, 0.18553840, 0.15720317, 0.12151857, 0.08015809, 0.03511946])
    },
    16: {
        'points': np.array([-0.98940093, -0.94457502, -0.86563120, -0.75540441, -0.61787624, -0.45801678, -0.28160355, -0.09501251, 0.09501251, 0.28160355, 0.45801678, 0.61787624, 0.75540441, 0.86563120, 0.94457502, 0.98940093]),
        'weights': np.array([0.02715246, 0.06225352, 0.09515851, 0.12462897, 0.14959599, 0.16915652, 0.18260342, 0.18945061, 0.18945061, 0.18260342, 0.16915652, 0.14959599, 0.12462897, 0.09515851, 0.06225352, 0.02715246])
    },
    18: {
        'points': np.array([-0.99156517, -0.95582395, -0.89260247, -0.80370496, -0.69168704, -0.55977083, -0.41175116, -0.25188623, -0.08477501, 0.08477501, 0.25188623, 0.41175116, 0.55977083, 0.69168704, 0.80370496, 0.89260247, 0.95582395, 0.99156517]),
        'weights': np.array([0.02161601, 0.04971455, 0.07642573, 0.10094204, 0.12255521, 0.14064291, 0.15468468, 0.16427648, 0.16914238, 0.16914238, 0.16427648, 0.15468468, 0.14064291, 0.12255521, 0.10094204, 0.07642573, 0.04971455, 0.02161601])
    },
    20: {
        'points': np.array([-0.99312860, -0.96397193, -0.91223443, -0.83911697, -0.74633191, -0.63605368, -0.51086700, -0.37370609, -0.22778585, -0.07652652, 0.07652652, 0.22778585, 0.37370609, 0.51086700, 0.63605368, 0.74633191, 0.83911697, 0.91223443, 0.96397193, 0.99312860]),
        'weights': np.array([0.01761401, 0.04060143, 0.06267205, 0.08327674, 0.10193012, 0.11819453, 0.13168864, 0.14209611, 0.14917299, 0.15275339, 0.15275339, 0.14917299, 0.14209611, 0.13168864, 0.11819453, 0.10193012, 0.08327674, 0.06267205, 0.04060143, 0.01761401])
    }
}


def get_gauss_points(n: int) -> Tuple[np.ndarray, np.ndarray]:
    """
    Get Gauss-Legendre quadrature points and weights.
    
    Returns precomputed quadrature points and weights for numerical integration
    on the interval [-1, 1]. 
    
    Args:
        n: Number of quadrature points (1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, or 20)
        
    Returns:
        Tuple of (points, weights) where:
        - points: Array of n quadrature points on [-1, 1]
        - weights: Array of n weights (sum to 2)
        
    Raises:
        ValueError: If n is not a supported quadrature order
        
    Examples:
        >>> points, weights = get_gauss_points(5)
        >>> # Integrate f(x) = x^2 over [-1, 1]
        >>> result = sum(weights * points**2)
        >>> # Should give approximately 2/3 * 2 = 1.333...
        
        >>> # Use with inductance calculation
        >>> points, weights = get_gauss_points(10)
        >>> M = compute_mutual_inductance_1d(edge1, edge2, points, weights)
    """
    if n not in GAUSS_LEGENDRE_DATA:
        available = sorted(GAUSS_LEGENDRE_DATA.keys())
        raise ValueError(
            f"Unsupported quadrature order: {n}. "
            f"Available orders: {available}"
        )
    
    data = GAUSS_LEGENDRE_DATA[n]
    return data['points'].copy(), data['weights'].copy()


def get_available_orders() -> list:
    """
    Get list of available Gauss-Legendre quadrature orders.
    
    Returns:
        Sorted list of available quadrature orders
        
    Example:
        >>> orders = get_available_orders()
        >>> print(orders)
        [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20]
    """
    return sorted(GAUSS_LEGENDRE_DATA.keys())


def verify_quadrature(n: int, verbose: bool = False) -> bool:
    """
    Verify that quadrature rule is correctly normalized.
    
    Checks that:
    1. Weights sum to 2 (integration interval length)
    2. Points are symmetric about 0
    3. Weights are symmetric
    
    Args:
        n: Quadrature order to verify
        verbose: If True, print verification details
        
    Returns:
        True if all checks pass
        
    Example:
        >>> verify_quadrature(10, verbose=True)
        Verifying 10-point Gauss-Legendre quadrature:
          Sum of weights: 2.0000 (expected: 2)
          Points symmetric: True
          Weights symmetric: True
        True
    """
    points, weights = get_gauss_points(n)
    
    # Check sum of weights (should be 2 for interval [-1, 1])
    weight_sum = np.sum(weights)
    weight_ok = np.isclose(weight_sum, 2.0, rtol=1e-6)
    
    # Check symmetry of points
    points_symmetric = np.allclose(points, -np.flip(points), rtol=1e-6)
    
    # Check symmetry of weights
    weights_symmetric = np.allclose(weights, np.flip(weights), rtol=1e-6)
    
    if verbose:
        print(f"Verifying {n}-point Gauss-Legendre quadrature:")
        print(f"  Sum of weights: {weight_sum:.4f} (expected: 2)")
        print(f"  Points symmetric: {points_symmetric}")
        print(f"  Weights symmetric: {weights_symmetric}")
    
    return weight_ok and points_symmetric and weights_symmetric
