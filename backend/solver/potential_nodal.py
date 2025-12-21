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
from typing import List, Tuple
from .geometry import EdgeGeometry, compute_distance
from .gauss_quadrature import get_gauss_points


def build_capacitive_elements(edges: List[EdgeGeometry], 
                              edge_list: List[List[int]],
                              radii: np.ndarray,
                              n_nodes: int) -> Tuple[np.ndarray, np.ndarray]:
    """
    Build capacitive element representation for each node.
    
    Following MATLAB approach: each node is represented by either:
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


def compute_nodal_potential_coefficient(X: np.ndarray, Y: np.ndarray,
                                        gauss_points: np.ndarray,
                                        gauss_weights: np.ndarray) -> float:
    """
    Compute potential coefficient between two segments.
    
    Simple implementation: computes mutual potential using log approximation.
    
    Args:
        X: First segment, shape (N, 3) [point, xyz]
        Y: Second segment, shape (M, 3) [point, xyz]
        gauss_points: Gauss quadrature points in [-1, 1]
        gauss_weights: Gauss quadrature weights
    
    Returns:
        Potential coefficient P_ij [1/F]
    """
    eps = 1e-10
    
    # Get segment centers and lengths
    X_center = np.mean(X, axis=0)
    Y_center = np.mean(Y, axis=0)
    
    X_length = np.sum([np.linalg.norm(X[i+1,:] - X[i,:]) for i in range(len(X)-1)])
    Y_length = np.sum([np.linalg.norm(Y[i+1,:] - Y[i,:]) for i in range(len(Y)-1)])
    
    # Distance between centers
    dist = np.linalg.norm(X_center - Y_center) + eps
    
    # Simplified potential coefficient (log approximation)
    # P ~ (1/L) * log(L/d) where L is average length, d is distance
    avg_length = (X_length + Y_length) / 2
    
    if dist < avg_length * 0.1:  # Close segments
        P_coeff = (2 / avg_length) * (np.log(2 * avg_length / dist) - 1)
    else:  # Distant segments
        P_coeff = (1 / avg_length) * np.log(avg_length / dist + np.sqrt(1 + (avg_length / dist)**2))
    
    return P_coeff


def assemble_nodal_potential_matrix(edges: List[EdgeGeometry],
                                    edge_list: List[List[int]],
                                    radii: np.ndarray,
                                    n_nodes: int,
                                    gauss_points: np.ndarray = None,
                                    gauss_weights: np.ndarray = None,
                                    n_gauss: int = 10) -> np.ndarray:
    """
    Assemble node-based potential coefficient matrix P.
    
    Following MATLAB implementation: P is (n_nodes × n_nodes) where each
    element represents capacitive coupling between node charge distributions.
    
    Args:
        edges: List of EdgeGeometry objects
        edge_list: Edge connectivity [[node1, node2], ...] (1-based indexing)
        radii: Wire radii for each edge
        n_nodes: Number of nodes (excluding ground)
        gauss_points: Optional Gauss quadrature points
        gauss_weights: Optional Gauss quadrature weights
        n_gauss: Gauss quadrature order if points/weights not provided
    
    Returns:
        Potential coefficient matrix P [1/F], shape (n_nodes, n_nodes)
    """
    if gauss_points is None or gauss_weights is None:
        gauss_points, gauss_weights = get_gauss_points(n_gauss)
    
    # Build capacitive element representation
    cap_elem, radii_cap = build_capacitive_elements(edges, edge_list, radii, n_nodes)
    
    # Initialize P matrix
    P = np.zeros((n_nodes, n_nodes))
    
    # Physical constants
    pi = np.pi
    eps_0 = 8.854187817e-12  # Permittivity of free space [F/m]
    
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
    for i in range(n_nodes):
        for j in range(i + 1, n_nodes):
            X = cap_elem[:, :, i]
            Y = cap_elem[:, :, j]
            
            P_mutual = compute_nodal_potential_coefficient(X, Y, gauss_points, gauss_weights)
            P[i, j] = (1 / (4 * pi * eps_0)) * P_mutual
            P[j, i] = P[i, j]  # Symmetry
    
    return P
