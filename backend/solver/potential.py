"""
Potential coefficient calculation functions for PEEC solver.

These formulas compute potential coefficients for wire segments
in the PEEC method, which are used to derive the capacitance matrix.

The potential coefficient matrix P relates charges to potentials:
V = P·Q

The capacitance matrix is then obtained as C = P⁻¹

References:
    - Ruehli, A. E. (1974). "Equivalent Circuit Models for Three-Dimensional 
      Multiconductor Systems". IEEE Trans. Microwave Theory and Techniques.
"""

import numpy as np
from typing import List, Optional, Tuple
from .geometry import EdgeGeometry, compute_distance
from .gauss_quadrature import get_gauss_points


# Physical constants
EPSILON_0 = 8.8541878176e-12  # Vacuum permittivity [F/m]
PI = np.pi


def compute_self_potential_coefficient(length: float, radius: float) -> float:
    """
    Compute self-potential coefficient of a straight wire segment.
    
    The self-potential coefficient represents the relationship between
    charge and potential on the same wire segment.
    
    Formula: P_self = (2/l) * [ln(l/r + sqrt(1 + (l/r)²)) - sqrt(1 + (r/l)²) + r/l]
    
    Args:
        length: Length of wire segment [m]
        radius: Wire radius [m]
        
    Returns:
        Self-potential coefficient [dimensionless]
        
    Raises:
        ValueError: If length or radius are non-positive
        
    Examples:
        >>> P = compute_self_potential_coefficient(1.0, 0.001)
        >>> # Used for diagonal elements before inversion
    """
    if length <= 0:
        raise ValueError(f"Length must be positive, got {length}")
    if radius <= 0:
        raise ValueError(f"Radius must be positive, got {radius}")
    if radius >= length:
        raise ValueError(f"Radius {radius} must be less than length {length}")

    
    l_over_r = length / radius
    r_over_l = radius / length
    
    aa = np.log(l_over_r + np.sqrt(1 + l_over_r**2))
    bb = np.sqrt(1 + r_over_l**2)
    cc = r_over_l
    
    P_self = (2.0 / length) * (aa - bb + cc)
    
    return P_self


def compute_mutual_potential_coefficient(
    edge1: EdgeGeometry,
    edge2: EdgeGeometry,
    gauss_points: np.ndarray,
    gauss_weights: np.ndarray
) -> float:
    """
    Compute mutual potential coefficient between two wire segments.
    
    This represents the electrostatic coupling between two segments.
    Uses numerical integration with Gaussian quadrature over both segments.
    
    The algorithm:
    1. Divide each edge into two half-segments (am and mb)
    2. Compute Gauss points on each half-segment of observer (edge1)
    3. For each Gauss point, compute distances to source segment nodes (edge2)
    4. Integrate logarithmic potential contribution
    
    Args:
        edge1: Observer wire segment (where potential is measured)
        edge2: Source wire segment (where charge is located)
        gauss_points: Gaussian quadrature points in [-1, 1]
        gauss_weights: Gaussian quadrature weights
        
    Returns:
        Mutual potential coefficient [dimensionless]
        
    Examples:
        >>> edge1 = EdgeGeometry([0, 0, 0], [1, 0, 0])
        >>> edge2 = EdgeGeometry([0, 0.01, 0], [1, 0.01, 0])
        >>> points, weights = get_gauss_points(10)
        >>> P = compute_mutual_potential_coefficient(edge1, edge2, points, weights)
    """
    # Small epsilon to avoid division by zero
    eps = edge2.length / 1e6
    
    # Divide edge1 into two half-segments
    # X: edge1 = [x1, x2, x3] where x2 = midpoint
    x1 = edge1.node1
    x3 = edge1.node2
    x2 = edge1.midpoint
    
    # Compute lengths of half-segments
    l_X_am = compute_distance(x1, x2)  # First half
    l_X_mb = compute_distance(x2, x3)  # Second half
    
    # Divide edge2 into two half-segments
    # Y: edge2 = [y1, y2, y3] where y2 = midpoint
    y1 = edge2.node1
    y3 = edge2.node2
    y2 = edge2.midpoint
    
    # Compute lengths of half-segments
    l_Y_am = compute_distance(y1, y2)  # First half
    l_Y_mb = compute_distance(y2, y3)  # Second half
    
    # Center points of each half-segment of edge1
    X_center_am = (x1 + x2) * 0.5  # Center of first half
    X_center_mb = (x2 + x3) * 0.5  # Center of second half
    
    # Vectors from center to end of each half-segment
    vec1 = x2 - X_center_am
    vec2 = x3 - X_center_mb
    
    # Compute Gauss integration points along each half-segment of edge1
    # P0_am = X_center_am + gauss_points * vec1
    P0_am = X_center_am[np.newaxis, :] + gauss_points[:, np.newaxis] * vec1[np.newaxis, :]
    P0_mb = X_center_mb[np.newaxis, :] + gauss_points[:, np.newaxis] * vec2[np.newaxis, :]
    
    n_gauss = len(gauss_points)
    
    # For each Gauss point on edge1, compute distances to edge2 nodes
    # Distances from P0_am to y1, y2, y3
    Y1_am = np.sqrt(np.sum((P0_am - y1[np.newaxis, :])**2, axis=1) + eps)
    Y2_am = np.sqrt(np.sum((P0_am - y2[np.newaxis, :])**2, axis=1) + eps)
    Y3_am = np.sqrt(np.sum((P0_am - y3[np.newaxis, :])**2, axis=1) + eps)
    
    # Distances from P0_mb to y1, y2, y3
    Y1_mb = np.sqrt(np.sum((P0_mb - y1[np.newaxis, :])**2, axis=1) + eps)
    Y2_mb = np.sqrt(np.sum((P0_mb - y2[np.newaxis, :])**2, axis=1) + eps)
    Y3_mb = np.sqrt(np.sum((P0_mb - y3[np.newaxis, :])**2, axis=1) + eps)
    
    # Compute logarithmic potential contributions
    # f_1: from am segment to y1-y2 edge
    epsilon1 = l_Y_am / (Y1_am + Y2_am)
    f_1 = np.log((1 + epsilon1) / (1 - epsilon1))
    
    # f_2: from mb segment to y1-y2 edge
    epsilon2 = l_Y_am / (Y1_mb + Y2_mb)
    f_2 = np.log((1 + epsilon2) / (1 - epsilon2))
    
    # f_3: from am segment to y2-y3 edge
    epsilon3 = l_Y_mb / (Y2_am + Y3_am)
    f_3 = np.log((1 + epsilon3) / (1 - epsilon3))
    
    # f_4: from mb segment to y2-y3 edge
    epsilon4 = l_Y_mb / (Y2_mb + Y3_mb)
    f_4 = np.log((1 + epsilon4) / (1 - epsilon4))
    
    # Integrate using Gaussian quadrature
    f_13_p_w = np.sum((f_1 + f_3) * gauss_weights)
    f_24_p_w = np.sum((f_2 + f_4) * gauss_weights)
    
    # Final potential coefficient
    # Pcoeff = 1/((l_Y_am+l_Y_mb)*(l_X_am+l_X_mb))*(0.5*l_X_am*f_13_p_w+0.5*l_X_mb*f_24_p_w)
    total_length_X = l_X_am + l_X_mb
    total_length_Y = l_Y_am + l_Y_mb
    
    Pcoeff = (1.0 / (total_length_Y * total_length_X)) * \
             (0.5 * l_X_am * f_13_p_w + 0.5 * l_X_mb * f_24_p_w)
    
    return Pcoeff


def assemble_potential_matrix(
    edges: List[EdgeGeometry],
    radii: np.ndarray,
    gauss_points: Optional[np.ndarray] = None,
    gauss_weights: Optional[np.ndarray] = None,
    n_gauss: int = 10
) -> np.ndarray:
    """
    Assemble the full potential coefficient matrix P for a mesh.
    
    The potential coefficient matrix relates charges to potentials:
    V = P·Q
    
    The matrix includes:
    - Self-potential coefficients on diagonal (after 2x2 inversion for each segment)
    - Mutual potential coefficients on off-diagonal
    - Scaled by 1/(4πε₀) for physical units
    
    Args:
        edges: List of edge geometries for all mesh segments
        radii: Wire radius for each edge [m], shape (n_edges,)
        gauss_points: Optional Gaussian quadrature points in [-1, 1]
        gauss_weights: Optional Gaussian quadrature weights
        n_gauss: Number of Gaussian points if not provided (default: 10)
        
    Returns:
        Potential coefficient matrix P of shape (n_edges, n_edges) [Ω·m]
        P is symmetric and positive definite
        
    Raises:
        ValueError: If radii array has wrong shape
        
    Notes:
        For each diagonal element, a 2x2 local potential matrix is computed
        and inverted, then the inverse elements are summed to get the self
        potential coefficient. This accounts for the subdivision of each
        segment.
        
    Examples:
        >>> edges = build_edge_geometries(nodes, edge_list)
        >>> radii = np.full(len(edges), 0.001)  # 1mm radius
        >>> P = assemble_potential_matrix(edges, radii)
        >>> # Capacitance matrix: C = inv(P)
    """
    n_edges = len(edges)
    
    if len(radii) != n_edges:
        raise ValueError(f"Radii array has length {len(radii)}, expected {n_edges}")
    
    # Use MATLAB-compatible Gaussian quadrature if not provided
    if gauss_points is None or gauss_weights is None:
        gauss_points, gauss_weights = get_gauss_points(n_gauss)
    
    # Initialize potential matrix
    P = np.zeros((n_edges, n_edges))
    
    # Physical constant scaling factor
    scale_factor = 1.0 / (4.0 * PI * EPSILON_0)
    
    # Compute each element
    for i in range(n_edges):
        # For diagonal: compute self-potential with 2x2 inversion
        # Divide edge into two half-segments
        edge = edges[i]
        x1 = edge.node1
        x2 = edge.midpoint
        x3 = edge.node2
        
        # Lengths of half-segments (assuming uniform radius)
        l_a = compute_distance(x1, x2)
        l_b = compute_distance(x2, x3)
        
        # Self-potential coefficients for each half
        Paa = compute_self_potential_coefficient(l_a, radii[i])
        Pbb = compute_self_potential_coefficient(l_b, radii[i])
        
        # Mutual potential between the two halves
        edge_am = EdgeGeometry(x1, x2)
        edge_mb = EdgeGeometry(x2, x3)
        Pab = compute_mutual_potential_coefficient(edge_am, edge_mb, gauss_points, gauss_weights)
        
        # Build 2x2 local matrix
        M_in = np.array([[Paa, Pab],
                         [Pab, Pbb]])
        
        # Invert 2x2 matrix
        M_out = np.linalg.inv(M_in)
        
        # Sum all elements of inverse for self-potential coefficient
        # P(ii,ii) = (1/(4*pi*eps_0)) / (Mout(1,1)+Mout(1,2)+Mout(2,1)+Mout(2,2))
        P[i, i] = scale_factor / np.sum(M_out)
        
        # Mutual potential coefficients on off-diagonal (symmetric)
        for j in range(i + 1, n_edges):
            P_ij = compute_mutual_potential_coefficient(
                edges[i], edges[j],
                gauss_points, gauss_weights
            )
            P[i, j] = scale_factor * P_ij
            P[j, i] = P[i, j]  # Symmetry
    
    return P


def compute_capacitance_matrix(P: np.ndarray) -> np.ndarray:
    """
    Compute capacitance matrix from potential coefficient matrix.
    
    The capacitance matrix is the inverse of the potential coefficient matrix:
    C = P⁻¹
    
    This relates charges to voltages:
    Q = C·V
    
    Args:
        P: Potential coefficient matrix [Ω·m]
        
    Returns:
        Capacitance matrix C [F]
        
    Examples:
        >>> P = assemble_potential_matrix(edges, radii)
        >>> C = compute_capacitance_matrix(P)
        >>> # C is used in PEEC system matrix
    """
    return np.linalg.inv(P)
