"""
Inductance calculation functions for PEEC solver.

These formulas compute partial inductances for wire segments in the PEEC method.

References:
    - Ruehli, A. E. (1974). "Equivalent Circuit Models for Three-Dimensional 
      Multiconductor Systems". IEEE Trans. Microwave Theory and Techniques.
"""

import numpy as np
from typing import List, Optional
from .geometry import EdgeGeometry, compute_distance
from .gauss_quadrature import get_gauss_points


def compute_self_inductance(length: float, radius: float) -> float:
    """
    Compute self-inductance of a straight wire segment.
    
    Uses the classical formula matching the reference PEEC implementation:
    L_self = (μ₀/(2π)) * 2*l * [ln(l/r + sqrt((l/r)² + 1)) - sqrt(1 + (r/l)²) + r/l]
    
    Where μ₀/(2π) = 2×10⁻⁷ H/m
    
    This is derived from Neumann's formula assuming uniform current distribution.
    Valid for l >> r (thin wire approximation).
    
    Args:
        length: Length of wire segment [m]
        radius: Wire radius [m]
        
    Returns:
        Self-inductance [H]
        
    Raises:
        ValueError: If length or radius are non-positive
        
    Examples:
        >>> # Wire segment: 1m long, 1mm radius
        >>> L = compute_self_inductance(1.0, 0.001)
        >>> # Result is approximately 1.45 µH
    """
    if length <= 0:
        raise ValueError(f"Length must be positive, got {length}")
    if radius <= 0:
        raise ValueError(f"Radius must be positive, got {radius}")
    if radius >= length:
        raise ValueError(f"Radius {radius} must be less than length {length} (thin wire approximation)")

    # Reference: L = 10^-7 * 2 * Length * (aa - bb + cc)
    # Where 10^-7 = μ₀/(4π), so 10^-7 * 2 = μ₀/(2π) = 2e-7
    
    l_over_r = length / radius
    r_over_l = radius / length
    
    aa = np.log(l_over_r + np.sqrt(l_over_r**2 + 1))
    bb = np.sqrt(1 + r_over_l**2)
    cc = r_over_l
    
    # Reference PEEC: 10^-7 * 2 * Length * (aa - bb + cc)
    L_self = 1e-7 * 2 * length * (aa - bb + cc)
    
    return L_self


def compute_mutual_inductance_1d(
    edge1: EdgeGeometry,
    edge2: EdgeGeometry,
    gauss_points: np.ndarray,
    gauss_weights: np.ndarray
) -> float:
    """
    Compute mutual inductance between two wire segments using Gaussian quadrature.
    
    Implements the Neumann formula for mutual inductance between two straight wire
    segments using numerical integration with Gaussian quadrature.
    
    M = (μ₀/(2π)) * cos(θ) * l_Y/2 * Σ[w_i * |A(ξ_i)|]
    
    where:
    - θ is the angle between the two segments
    - l_Y is the length of the source (field) segment
    - w_i are Gaussian quadrature weights
    - A(ξ_i) is the vector potential at Gaussian point ξ_i
    
    Args:
        edge1: Observer wire segment
        edge2: Source wire segment
        gauss_points: Gaussian quadrature points in [-1, 1], shape (n,)
        gauss_weights: Gaussian quadrature weights, shape (n,)
        
    Returns:
        Mutual inductance [H]
        
    Examples:
        >>> # Two parallel wires 1cm apart
        >>> edge1 = EdgeGeometry([0, 0, 0], [1, 0, 0])
        >>> edge2 = EdgeGeometry([0, 0.01, 0], [1, 0.01, 0])
        >>> # Use 10-point Gauss quadrature
        >>> points, weights = np.polynomial.legendre.leggauss(10)
        >>> M = compute_mutual_inductance_1d(edge1, edge2, points, weights)
    """
    # Reference PEEC: Lcoeff = 10^-7 * cos_e * l_Y * 0.5 * Gauss.w' * Aabs
    mu_0_over_4pi = 1e-7
    
    eps = edge2.length / 1e6
    
    # Compute cos(θ) between edge directions
    cos_theta = np.dot(edge1.direction, edge2.direction)
    
    # Map Gaussian points from [-1, 1] to actual positions along edge2
    # P0(ξ) = Y_center + ξ * (Y_end - Y_center) where ξ ∈ [-1, 1]
    Y_center = edge2.midpoint
    half_vec = (edge2.node2 - Y_center)  # Vector from center to end
    
    # Compute Gaussian integration points along edge2
    gauss_positions = Y_center[np.newaxis, :] + gauss_points[:, np.newaxis] * half_vec[np.newaxis, :]
    
    # For each Gaussian point, compute the vector potential contribution
    # A = ln[(1+ε)/(1-ε)] * t̂
    # where ε = L / (r_i + r_f)
    
    xi, yi, zi = edge1.node1  # Start of observer segment
    xf, yf, zf = edge1.node2  # End of observer segment
    
    L = edge1.length
    tx, ty, tz = edge1.direction  # Unit vector along observer segment
    
    A_abs = np.zeros(len(gauss_points))
    
    for i, P0 in enumerate(gauss_positions):
        # Distance from start of observer to Gaussian point
        ri_vec = np.array([xi, yi, zi]) - P0
        ri = np.sqrt(np.sum(ri_vec**2) + eps)
        
        # Distance from end of observer to Gaussian point
        rf_vec = np.array([xf, yf, zf]) - P0
        rf = np.sqrt(np.sum(rf_vec**2) + eps)
        
        # Compute epsilon parameter
        epsilon = L / (ri + rf)
        
        # Vector potential magnitude (logarithmic term)
        Am = np.log((1 + epsilon) / (1 - epsilon))
        
        # Vector potential components
        Ax = Am * tx
        Ay = Am * ty
        Az = Am * tz
        
        # Magnitude of vector potential
        A_abs[i] = np.sqrt(Ax**2 + Ay**2 + Az**2)
    
    # Numerical integration using Gaussian quadrature
    integral = np.sum(gauss_weights * A_abs)
    
    # Final mutual inductance - reference PEEC: 10^-7 * cos_e * l_Y * 0.5 * integral
    M = mu_0_over_4pi * cos_theta * edge2.length * 0.5 * integral
    
    return M


def compute_distance_matrix(edges: List[EdgeGeometry]) -> np.ndarray:
    """
    Compute center-to-center distance matrix for all edge pairs.
    
    The distance matrix D[i,j] contains the Euclidean distance between
    the midpoints of edge i and edge j. This is used in inductance
    calculations and coupling analysis.
    
    Args:
        edges: List of edge geometries
        
    Returns:
        Distance matrix of shape (n_edges, n_edges) where D[i,j] is the
        distance between midpoint of edge i and midpoint of edge j [m].
        Diagonal elements are zero.
        
    Examples:
        >>> edges = [
        ...     EdgeGeometry([0, 0, 0], [1, 0, 0]),
        ...     EdgeGeometry([0, 1, 0], [1, 1, 0]),
        ...     EdgeGeometry([0, 2, 0], [1, 2, 0])
        ... ]
        >>> D = compute_distance_matrix(edges)
        >>> # D[0,1] is distance between first two edges (should be 1.0)
        >>> # D[0,2] is distance between first and third (should be 2.0)
    """
    n_edges = len(edges)
    dist_matrix = np.zeros((n_edges, n_edges))
    
    for i in range(n_edges):
        # Diagonal is zero (distance from edge to itself)
        dist_matrix[i, i] = 0.0
        
        # Compute upper triangle (symmetric matrix)
        for j in range(i + 1, n_edges):
            distance = edges[i].distance_to(edges[j])
            dist_matrix[i, j] = distance
            dist_matrix[j, i] = distance  # Symmetry
    
    return dist_matrix


def assemble_inductance_matrix(
    edges: List[EdgeGeometry],
    radii: np.ndarray,
    gauss_points: Optional[np.ndarray] = None,
    gauss_weights: Optional[np.ndarray] = None,
    n_gauss: int = 4
) -> tuple[np.ndarray, np.ndarray]:
    """
    Assemble the full partial inductance matrix L for a mesh.
    
    The inductance matrix relates currents to magnetic flux linkages:
    Φ = L·I
    
    Diagonal elements are self-inductances, off-diagonal elements are
    mutual inductances.
    
    Args:
        edges: List of edge geometries for all mesh segments
        radii: Wire radius for each edge [m], shape (n_edges,)
        gauss_points: Optional Gaussian quadrature points in [-1, 1]
        gauss_weights: Optional Gaussian quadrature weights
        n_gauss: Number of Gaussian points if not provided (default: 10)
        
    Returns:
        Tuple of (L, dist_L):
            - L: Inductance matrix of shape (n_edges, n_edges) [H]
                 L is symmetric and positive definite
            - dist_L: Distance matrix of shape (n_edges, n_edges) [m]
                      Distance between midpoints of edges (for retarded calculations)
        
    Raises:
        ValueError: If radii array has wrong shape
        
    Examples:
        >>> # Simple dipole with 5 segments
        >>> edges = build_edge_geometries(nodes, edge_list)
        >>> radii = np.full(len(edges), 0.001)  # 1mm radius
        >>> L, dist_L = assemble_inductance_matrix(edges, radii)
    """
    n_edges = len(edges)
    
    if len(radii) != n_edges:
        raise ValueError(f"Radii array has length {len(radii)}, expected {n_edges}")
    
    # Use standard Gaussian quadrature if not provided
    if gauss_points is None or gauss_weights is None:
        gauss_points, gauss_weights = get_gauss_points(n_gauss)
    
    # Initialize inductance matrix and distance matrix
    L = np.zeros((n_edges, n_edges))
    dist_L = np.zeros((n_edges, n_edges))
    
    # Compute each element
    for i in range(n_edges):
        # Self-inductance on diagonal
        L[i, i] = compute_self_inductance(edges[i].length, radii[i])
        dist_L[i, i] = 0.0  # Distance to self is zero
        
        # Mutual inductances on off-diagonal (symmetric)
        for j in range(i + 1, n_edges):
            M_ij = compute_mutual_inductance_1d(
                edges[i], edges[j],
                gauss_points, gauss_weights
            )
            L[i, j] = M_ij
            L[j, i] = M_ij  # Symmetry
            
            # Distance between midpoints
            dist_ij = edges[i].distance_to(edges[j])
            dist_L[i, j] = dist_ij
            dist_L[j, i] = dist_ij  # Symmetry
    
    return L, dist_L
