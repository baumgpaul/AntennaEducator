"""
Node-based potential coefficient matrix calculation for PEEC solver.

P is computed per node (n_nodes × n_nodes) rather than per edge.
Each node is represented by a 3-point segment structure that captures
the charge distribution more accurately.

This is required for the A'PA capacitive coupling term in the impedance matrix.

References:
    - Ruehli, A.E., "Partial Element Equivalent Circuit (PEEC) Models"
"""

import numpy as np
from typing import List, Tuple, Optional
from .geometry import EdgeGeometry, compute_distance
from .gauss_quadrature import get_gauss_points


def build_capacitive_elements(edges: List[EdgeGeometry], 
                              edge_list: List[List[int]],
                              radii: np.ndarray,
                              n_nodes: int) -> Tuple[np.ndarray, np.ndarray]:
    """
    Build capacitive element representation for each node.
    
    Each node is represented by either:
    - 1 adjacent edge: 3 points from that edge (end, mid, center)
    - 2 adjacent edges: 3 points spanning both edges (mid1, node, mid2)
    
    Args:
        edges: List of EdgeGeometry objects
        edge_list: Edge connectivity [[node1, node2], ...] (1-based)
        radii: Wire radii for each edge
        n_nodes: Number of nodes (excluding ground)
    
    Returns:
        Tuple of (cap_elem, radii_cap):
            - cap_elem: Capacitive elements, shape (3, 3, n_nodes)
                       [point_index, xyz, node_index]
            - radii_cap: Radii for each capacitive element, shape (n_nodes, 2)
    """
    # Validate inputs
    if len(edges) != len(edge_list):
        raise ValueError(f"Mismatch: {len(edges)} EdgeGeometry objects but {len(edge_list)} edge connections")
    if len(radii) != len(edges):
        raise ValueError(f"Mismatch: {len(radii)} radii but {len(edges)} edges")
    
    cap_elem = np.zeros((3, 3, n_nodes))
    radii_cap = np.zeros((n_nodes, 2))
    
    for node_idx in range(n_nodes):
        node_num = node_idx + 1  # Convert to 1-based
        
        # Find edges connected to this node
        connected_edges = []
        for edge_idx, (n1, n2) in enumerate(edge_list):
            if n1 == node_num or n2 == node_num:
                connected_edges.append(edge_idx)
        
        if len(connected_edges) == 0:
            # Isolated node - use a small dummy element at node position
            # This can happen for ground nodes or disconnected nodes
            node_pos = np.zeros(3)  # Default to origin
            cap_elem[0, :, node_idx] = node_pos
            cap_elem[1, :, node_idx] = node_pos
            cap_elem[2, :, node_idx] = node_pos
            radii_cap[node_idx, :] = [1e-3, 1e-3]  # Default 1mm radius
            
        elif len(connected_edges) == 1:
            # Node has only 1 adjacent edge
            edge_idx = connected_edges[0]
            edge = edges[edge_idx]
            n1, n2 = edge_list[edge_idx]
            
            # Determine which end of the edge is this node
            if n1 == node_num:
                node_pos = edge.node1
                other_pos = edge.node2
            else:
                node_pos = edge.node2
                other_pos = edge.node1
            
            mid_point = (node_pos + other_pos) / 2
            
            # Three points: node, halfway to midpoint, midpoint
            cap_elem[0, :, node_idx] = node_pos
            cap_elem[1, :, node_idx] = (node_pos + mid_point) / 2
            cap_elem[2, :, node_idx] = mid_point
            
            radii_cap[node_idx, :] = [radii[edge_idx], radii[edge_idx]]
            
        elif len(connected_edges) == 2:
            # Node has 2 adjacent edges
            edge_idx1, edge_idx2 = connected_edges
            edge1 = edges[edge_idx1]
            edge2 = edges[edge_idx2]
            
            n1_1, n2_1 = edge_list[edge_idx1]
            n1_2, n2_2 = edge_list[edge_idx2]
            
            # Find midpoints of both edges
            mid1 = (edge1.node1 + edge1.node2) / 2
            mid2 = (edge2.node1 + edge2.node2) / 2
            
            # Get node position (should be same from both edges)
            if n1_1 == node_num:
                node_pos = edge1.node1
            elif n2_1 == node_num:
                node_pos = edge1.node2
            elif n1_2 == node_num:
                node_pos = edge2.node1
            else:
                node_pos = edge2.node2
            
            # Three points: mid1, node, mid2
            cap_elem[0, :, node_idx] = mid1
            cap_elem[1, :, node_idx] = node_pos
            cap_elem[2, :, node_idx] = mid2
            
            radii_cap[node_idx, :] = [radii[edge_idx1], radii[edge_idx2]]
            
        else:
            # Node with >2 edges - use average of all connected edges
            # This can happen in complex meshes (junctions, etc.)
            node_pos = np.zeros(3)
            
            # Get node position from first edge
            edge_idx = connected_edges[0]
            n1, n2 = edge_list[edge_idx]
            if n1 == node_num:
                node_pos = edges[edge_idx].node1
            else:
                node_pos = edges[edge_idx].node2
            
            # Compute average midpoint of all connected edges
            midpoints = []
            edge_radii = []
            for edge_idx in connected_edges:
                mid = (edges[edge_idx].node1 + edges[edge_idx].node2) / 2
                midpoints.append(mid)
                edge_radii.append(radii[edge_idx])
            
            avg_mid = np.mean(midpoints, axis=0)
            
            # Three points: avg_mid, node, avg_mid (symmetric)
            cap_elem[0, :, node_idx] = avg_mid
            cap_elem[1, :, node_idx] = node_pos
            cap_elem[2, :, node_idx] = avg_mid
            
            # Use average radius
            avg_radius = np.mean(edge_radii)
            radii_cap[node_idx, :] = [avg_radius, avg_radius]
    
    return cap_elem, radii_cap


def build_capacitive_element_vectors(edges: List[EdgeGeometry],
                                     edge_list: List[List[int]],
                                     radii: np.ndarray,
                                     n_nodes: int) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Create elements for constructing nodal capacity elements

    Returns both the 3×3×N tensor (Cap_Elem) and the reshaped 3×(3*N)
    matrix (Cap_Elem2) alongside the radii pair per node.

    This mirrors the MATLAB snippet:
        Cap_Elem = zeros(3,3,N_node_o);
        Radii_cap_el = zeros(N_node_o,2);
        ...
        Cap_Elem2 = reshape(Cap_Elem,3,3*N_node_o);
    """
    cap_elem, radii_cap = build_capacitive_elements(edges, edge_list, radii, n_nodes)
    cap_elem2 = cap_elem.reshape(3, 3 * n_nodes)
    return cap_elem, cap_elem2, radii_cap


def compute_nodal_potential_coefficient(X: np.ndarray, Y: np.ndarray,
                                        gauss_points: np.ndarray,
                                        gauss_weights: np.ndarray) -> float:
    """
    Compute potential coefficient between two 3-point segments using Gauss quadrature.
    
    Matches MATLAB calcCoefficient function exactly.
    
    Args:
        X: First segment (observer), shape (3, 3) - three xyz points
        Y: Second segment (source), shape (3, 3) - three xyz points
        gauss_points: Gauss quadrature points in [-1, 1]
        gauss_weights: Gauss quadrature weights
    
    Returns:
        Potential coefficient (dimensionless)
    """
    eps = 1e-12
    
    # Extract points
    x1, x2, x3 = X[0, :], X[1, :], X[2, :]
    y1, y2, y3 = Y[0, :], Y[1, :], Y[2, :]
    
    # Segment lengths for observer (el1 = X)
    l_el1_1 = np.linalg.norm(x2 - x1)  # x1 to x2
    l_el1_2 = np.linalg.norm(x3 - x2)  # x2 to x3
    
    # Segment lengths for source (el2 = Y)
    l_el2_1 = np.linalg.norm(y2 - y1)  # y1 to y2
    l_el2_2 = np.linalg.norm(y3 - y2)  # y2 to y3
    
    # Compute Gauss integration points on observer segment
    el1_mid1 = (x1 + x2) * 0.5
    vec1 = x2 - el1_mid1
    int_points1 = el1_mid1[np.newaxis, :] + gauss_points[:, np.newaxis] * vec1[np.newaxis, :]
    
    el1_mid2 = (x2 + x3) * 0.5
    vec2 = x3 - el1_mid2
    int_points2 = el1_mid2[np.newaxis, :] + gauss_points[:, np.newaxis] * vec2[np.newaxis, :]
    
    # Compute distances from Gauss points to source segment points
    # Section 1 of observer to source segments
    dist_1b1 = np.sqrt(np.sum((int_points1 - y1[np.newaxis, :])**2, axis=1) + eps)
    dist_1b2 = np.sqrt(np.sum((int_points1 - y2[np.newaxis, :])**2, axis=1) + eps)
    dist_1b3 = np.sqrt(np.sum((int_points1 - y3[np.newaxis, :])**2, axis=1) + eps)
    
    # Section 2 of observer to source segments
    dist_2b1 = np.sqrt(np.sum((int_points2 - y1[np.newaxis, :])**2, axis=1) + eps)
    dist_2b2 = np.sqrt(np.sum((int_points2 - y2[np.newaxis, :])**2, axis=1) + eps)
    dist_2b3 = np.sqrt(np.sum((int_points2 - y3[np.newaxis, :])**2, axis=1) + eps)
    
    # Compute logarithmic potential contributions
    # f1: section 1 of observer to (y1-y2) segment
    f1 = l_el2_1 / (dist_1b1 + dist_1b2)
    f1 = np.log((1 + f1) / (1 - f1))
    f1 = np.dot(gauss_weights, f1)
    
    # f2: section 2 of observer to (y1-y2) segment
    f2 = l_el2_1 / (dist_2b1 + dist_2b2)
    f2 = np.log((1 + f2) / (1 - f2))
    f2 = np.dot(gauss_weights, f2)
    
    # f3: section 1 of observer to (y2-y3) segment
    f3 = l_el2_2 / (dist_1b2 + dist_1b3)
    f3 = np.log((1 + f3) / (1 - f3))
    f3 = np.dot(gauss_weights, f3)
    
    # f4: section 2 of observer to (y2-y3) segment
    f4 = l_el2_2 / (dist_2b2 + dist_2b3)
    f4 = np.log((1 + f4) / (1 - f4))
    f4 = np.dot(gauss_weights, f4)
    
    # Combine contributions
    f13 = f1 + f3
    f24 = f2 + f4
    
    # Final coefficient
    P_coeff = (1.0 / ((l_el2_1 + l_el2_2) * (l_el1_1 + l_el1_2))) * \
              (0.5 * l_el1_1 * f13 + 0.5 * l_el1_2 * f24)
    
    return P_coeff


def assemble_nodal_potential_matrix(edges: List[EdgeGeometry],
                                    edge_list: List[List[int]],
                                    radii: np.ndarray,
                                    n_nodes: int,
                                    gauss_points: np.ndarray = None,
                                    gauss_weights: np.ndarray = None,
                                    n_gauss: int = 10) -> tuple[np.ndarray, np.ndarray]:
    """
    Assemble node-based potential coefficient matrix P.
    
    P is (n_nodes × n_nodes) where each element represents capacitive coupling between
    node charge distributions.
    
    Args:
        edges: List of EdgeGeometry objects
        edge_list: Edge connectivity [[node1, node2], ...] (1-based indexing)
        radii: Wire radii for each edge
        n_nodes: Number of nodes (excluding ground)
        gauss_points: Optional Gauss quadrature points
        gauss_weights: Optional Gauss quadrature weights
        n_gauss: Gauss quadrature order if points/weights not provided
    
    Returns:
        Tuple of (P, dist_P):
            - P: Potential coefficient matrix [1/F], shape (n_nodes, n_nodes)
            - dist_P: Distance matrix between nodes [m], shape (n_nodes, n_nodes)
    """
    if gauss_points is None or gauss_weights is None:
        gauss_points, gauss_weights = get_gauss_points(n_gauss)
    
    # Build capacitive element representation
    cap_elem, radii_cap = build_capacitive_elements(edges, edge_list, radii, n_nodes)
    
    # Initialize P and distance matrices
    P = np.zeros((n_nodes, n_nodes))
    dist_P = np.zeros((n_nodes, n_nodes))
    
    # Physical constants
    pi = np.pi
    eps_0 = 8.8541878176e-12  # Permittivity of free space [F/m] - matches MATLAB
    
    # Compute diagonal elements (self potential coefficients)
    for i in range(n_nodes):
        X = cap_elem[:, :, i]  # 3 points for node i
        
        # Sub-segment lengths
        l_a = np.linalg.norm(X[1, :] - X[0, :])
        l_b = np.linalg.norm(X[2, :] - X[1, :])
        
        # Self potential for each sub-segment
        r_a = radii_cap[i, 0]
        r_b = radii_cap[i, 1]
        
        aa = np.log(l_a / r_a + np.sqrt(1 + (l_a / r_a)**2))
        bb = np.sqrt(1 + (r_a / l_a)**2)
        cc = r_a / l_a
        P_aa = (2 / l_a) * (aa - bb + cc)
        
        aa = np.log(l_b / r_b + np.sqrt(1 + (l_b / r_b)**2))
        bb = np.sqrt(1 + (r_b / l_b)**2)
        cc = r_b / l_b
        P_bb = (2 / l_b) * (aa - bb + cc)
        
        # Mutual potential between sub-segments
        P_ab = compute_nodal_potential_coefficient(
            cap_elem[0:2, :, i],  # First sub-segment (points 0-1)
            cap_elem[1:3, :, i],  # Second sub-segment (points 1-2)
            gauss_points, gauss_weights
        )
        
        # Invert 2×2 local matrix to get node potential coefficient
        M_local = np.array([[P_aa, P_ab], [P_ab, P_bb]])
        M_inv = np.linalg.inv(M_local)
        
        # Sum of all elements gives node potential coefficient
        P[i, i] = (1 / (4 * pi * eps_0)) / np.sum(M_inv)
    
    # Compute off-diagonal elements (mutual potential coefficients)
    # MATLAB approach: el2 stays as second sub-segment from diagonal calculation
    for i in range(n_nodes):
        x1 = cap_elem[0, :, i]
        x2 = cap_elem[1, :, i]
        x3 = cap_elem[2, :, i]
        
        # el2 is second sub-segment (matches MATLAB el2 from diagonal calc)
        el2 = np.array([x2, (x2 + x3) * 0.5, x3])
        
        for j in range(i + 1, n_nodes):
            # el1 = full node j (matches MATLAB: el1(1,:)=y1; el1(2,:)=y2; el1(3,:)=y3;)
            Y = cap_elem[:, :, j]
            
            # calcCoefficient(el1, el2) where el1=node_j, el2=subsegment_i
            P_mutual = compute_nodal_potential_coefficient(Y, el2, gauss_points, gauss_weights)
            P[i, j] = (1 / (4 * pi * eps_0)) * P_mutual
            P[j, i] = P[i, j]  # Symmetry
            
            # Distance: sqrt(sum((x2-y2).^2))
            dist_ij = np.linalg.norm(x2 - Y[1, :])
            dist_P[i, j] = dist_ij
            dist_P[j, i] = dist_ij  # Symmetry
    
    return P, dist_P


def assemble_nodal_potential_matrix_with_cap_elem(
    edges: List[EdgeGeometry],
    edge_list: List[List[int]],
    radii: np.ndarray,
    n_nodes: int,
    gauss_points: Optional[np.ndarray] = None,
    gauss_weights: Optional[np.ndarray] = None,
    n_gauss: int = 10
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Assemble node-based potential matrix using explicit Cap_Elem vectors.
    
    This version explicitly constructs and returns the Cap_Elem vectors
    for debugging and verification 
    
    Args:
        edges: List of EdgeGeometry objects
        edge_list: Edge connectivity [[node1, node2], ...] (1-based)
        radii: Wire radii for each edge
        n_nodes: Number of nodes (excluding ground)
        gauss_points: Optional Gauss quadrature points
        gauss_weights: Optional Gauss quadrature weights
        n_gauss: Gauss quadrature order if points/weights not provided
    
    Returns:
        Tuple of (P, dist_P, cap_elem, radii_cap):
            - P: Potential coefficient matrix [1/F], shape (n_nodes, n_nodes)
            - dist_P: Distance matrix [m], shape (n_nodes, n_nodes)
            - cap_elem: Capacitive elements tensor, shape (3, 3, n_nodes)
            - radii_cap: Radii pairs for each node, shape (n_nodes, 2)
    """
    if gauss_points is None or gauss_weights is None:
        gauss_points, gauss_weights = get_gauss_points(n_gauss)
    
    # Build capacitive element representation (MATLAB: Cap_Elem, Radii_cap_el)
    cap_elem, radii_cap = build_capacitive_elements(edges, edge_list, radii, n_nodes)
    
    # Initialize P and distance matrices
    P = np.zeros((n_nodes, n_nodes))
    dist_P = np.zeros((n_nodes, n_nodes))
    
    # Physical constants
    pi = np.pi
    eps_0 = 8.8541878176e-12  # F/m
    
    # Compute diagonal elements (self potential coefficients)
    for i in range(n_nodes):
        X = cap_elem[:, :, i]  # 3 points for node i
        
        # Sub-segment lengths
        l_a = np.linalg.norm(X[1, :] - X[0, :])
        l_b = np.linalg.norm(X[2, :] - X[1, :])
        
        # Self potential for each sub-segment
        r_a = radii_cap[i, 0]
        r_b = radii_cap[i, 1]
        
        aa = np.log(l_a / r_a + np.sqrt(1 + (l_a / r_a)**2))
        bb = np.sqrt(1 + (r_a / l_a)**2)
        cc = r_a / l_a
        P_aa = (2 / l_a) * (aa - bb + cc)
        
        aa = np.log(l_b / r_b + np.sqrt(1 + (l_b / r_b)**2))
        bb = np.sqrt(1 + (r_b / l_b)**2)
        cc = r_b / l_b
        P_bb = (2 / l_b) * (aa - bb + cc)
        
        # Mutual potential between sub-segments
        # Build full 3-point segment representation for the two sub-segments
        x1 = cap_elem[0, :, i]
        x2 = cap_elem[1, :, i]
        x3 = cap_elem[2, :, i]
        
        # Sub-segment 1: x1-x2 expanded to 3 points
        el1 = np.array([x1, (x1 + x2) * 0.5, x2])
        # Sub-segment 2: x2-x3 expanded to 3 points
        el2 = np.array([x2, (x2 + x3) * 0.5, x3])
        
        P_ab = compute_nodal_potential_coefficient(el1, el2, gauss_points, gauss_weights)
        
        # Invert 2×2 local matrix to get node potential coefficient
        M_local = np.array([[P_aa, P_ab], [P_ab, P_bb]])
        M_inv = np.linalg.inv(M_local)
        
        # Sum of all elements gives node potential coefficient
        P[i, i] = (1 / (4 * pi * eps_0)) / np.sum(M_inv)
    
    # Compute off-diagonal elements (mutual potential coefficients)
    # MATLAB uses the raw cap_elem 3-point structure directly
    for i in range(n_nodes):
        X_i = cap_elem[:, :, i]  # 3-point structure for node i
        
        for j in range(i + 1, n_nodes):
            X_j = cap_elem[:, :, j]  # 3-point structure for node j
            
            # calcCoefficient uses the 3-point structures directly
            P_mutual = compute_nodal_potential_coefficient(X_j, X_i, gauss_points, gauss_weights)
            P[i, j] = (1 / (4 * pi * eps_0)) * P_mutual
            P[j, i] = P[i, j]
            
            # Distance: sqrt(sum((x2_i - x2_j).^2))
            dist_ij = np.linalg.norm(X_i[1, :] - X_j[1, :])
            dist_P[i, j] = dist_ij
            dist_P[j, i] = dist_ij
    
    return P, dist_P, cap_elem, radii_cap
