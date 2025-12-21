"""
System matrix assembly for PEEC solver.

This module assembles the complete PEEC system of equations in the frequency domain:
    [Z    A_app']  [I]   [V_source - (1/jω)A'P*I_source]
    [-A_app  0   ]  [V] = [I_app_source               ]

where:
    Z = R + jωL + (1/jω)C_inv + (1/jω)A'PA
    
Components:
    - R: Resistance matrix (resistive losses)
    - L: Inductance matrix (magnetic energy storage)
    - C_inv = P: Inverse capacitance (electrostatic energy storage)
    - A: Incidence matrix (topology - branch-to-node mapping)
    - P: Potential coefficient matrix

The system is solved for:
    - I: Branch currents
    - V: Node voltages

References:
    - Ruehli, A.E., "Partial Element Equivalent Circuit (PEEC) Models"
    - MATLAB implementation in PEECSolver/solvePEEC_harmonic.m

Author: PEEC Solver Development
"""

import numpy as np
from typing import List, Tuple, Optional, Dict
from dataclasses import dataclass

from backend.solver.geometry import EdgeGeometry


@dataclass
class VoltageSource:
    """Voltage source definition.
    
    Attributes:
        node_start: Starting node index (1-based, 0 for ground, negative for appended)
        node_end: Ending node index (1-based, 0 for ground, negative for appended)
        value: Complex voltage value [V]
        impedance: Optional source impedance (R + jωL + 1/(jωC)) [Ω]
    """
    node_start: int
    node_end: int
    value: complex
    impedance: complex = 0.0  # Series impedance (R, L, C)


@dataclass
class CurrentSource:
    """Current source definition.
    
    Attributes:
        node: Node index where current is injected (1-based, 0 for ground, negative for appended)
        value: Complex current value [A]
    """
    node: int
    value: complex


@dataclass
class Load:
    """Load element (passive component in series with mesh).
    
    Attributes:
        node_start: Starting node index (1-based, 0 for ground, negative for appended)
        node_end: Ending node index (1-based, 0 for ground, negative for appended)
        impedance: Load impedance (R + jωL + 1/(jωC)) [Ω]
    """
    node_start: int
    node_end: int
    impedance: complex


def build_incidence_matrix(edges_list: List[List[int]], n_nodes: int,
                          voltage_sources: Optional[List[VoltageSource]] = None,
                          loads: Optional[List[Load]] = None) -> np.ndarray:
    """
    Build the incidence matrix A that maps branch currents to node currents.
    
    The incidence matrix defines the network topology:
        - A[node, branch] = +1 if current flows into node
        - A[node, branch] = -1 if current flows out of node
        - A[node, branch] = 0 if branch not connected to node
    
    Kirchhoff's Current Law: A * I = I_source
    
    Args:
        edges_list: List of [node1, node2] pairs defining mesh edges (1-based indexing)
        n_nodes: Number of nodes in the mesh (excluding ground node 0)
        voltage_sources: Optional list of voltage sources (add as branches)
        loads: Optional list of loads (add as branches)
    
    Returns:
        Incidence matrix A, shape (n_nodes, n_branches)
        where n_branches = n_edges + n_voltage_sources + n_loads
    
    Example:
        >>> # Two-segment dipole: node 1 --edge1--> node 2 --edge2--> node 3
        >>> edges = [[1, 2], [2, 3]]
        >>> A = build_incidence_matrix(edges, n_nodes=3)
        >>> # A[0,0] = -1 (edge1 leaves node1), A[1,0] = +1 (edge1 enters node2)
        >>> # A[1,1] = -1 (edge2 leaves node2), A[2,1] = +1 (edge2 enters node3)
    """
    voltage_sources = voltage_sources or []
    loads = loads or []
    
    n_edges = len(edges_list)
    n_vsources = len(voltage_sources)
    n_loads = len(loads)
    n_branches = n_edges + n_vsources + n_loads
    
    # Initialize incidence matrix
    A = np.zeros((n_nodes, n_branches))
    
    # Add mesh edges (first n_edges branches)
    for i, (node1, node2) in enumerate(edges_list):
        # Convert from 1-based to 0-based indexing
        # Current flows from node1 to node2
        if node1 > 0:  # Not ground
            A[node1 - 1, i] = -1  # Current leaves node1
        if node2 > 0:  # Not ground
            A[node2 - 1, i] = +1  # Current enters node2
    
    # Add voltage sources (next n_vsources branches)
    for i, vsrc in enumerate(voltage_sources):
        branch_idx = n_edges + i
        if vsrc.node_start > 0:
            A[vsrc.node_start - 1, branch_idx] = -1
        if vsrc.node_end > 0:
            A[vsrc.node_end - 1, branch_idx] = +1
    
    # Add loads (final n_loads branches)
    for i, load in enumerate(loads):
        branch_idx = n_edges + n_vsources + i
        if load.node_start > 0:
            A[load.node_start - 1, branch_idx] = -1
        if load.node_end > 0:
            A[load.node_end - 1, branch_idx] = +1
    
    return A


def build_appended_incidence_matrix(voltage_sources: List[VoltageSource],
                                    loads: List[Load],
                                    n_edges: int) -> Tuple[np.ndarray, int]:
    """
    Build incidence matrix for appended nodes (negative indices).
    
    Appended nodes are auxiliary nodes used for:
    - Voltage sources between regular nodes and ground
    - Loads connected to ground
    - Internal source nodes
    
    Args:
        voltage_sources: List of voltage sources
        loads: List of loads
        n_edges: Number of mesh edges
    
    Returns:
        Tuple of (A_app, n_appended):
            - A_app: Appended incidence matrix, shape (n_appended, n_branches)
            - n_appended: Number of appended nodes
    """
    # Find minimum negative node index to determine number of appended nodes
    min_node = 0
    for vsrc in voltage_sources:
        if vsrc.node_start < 0:
            min_node = min(min_node, vsrc.node_start)
        if vsrc.node_end < 0:
            min_node = min(min_node, vsrc.node_end)
    
    for load in loads:
        if load.node_start < 0:
            min_node = min(min_node, load.node_start)
        if load.node_end < 0:
            min_node = min(min_node, load.node_end)
    
    n_appended = abs(min_node)
    
    if n_appended == 0:
        return np.zeros((0, 0)), 0
    
    n_vsources = len(voltage_sources)
    n_loads = len(loads)
    n_branches = n_edges + n_vsources + n_loads
    
    A_app = np.zeros((n_appended, n_branches))
    
    # Add voltage sources
    for i, vsrc in enumerate(voltage_sources):
        branch_idx = n_edges + i
        if vsrc.node_start < 0:
            A_app[abs(vsrc.node_start) - 1, branch_idx] = -1
        if vsrc.node_end < 0:
            A_app[abs(vsrc.node_end) - 1, branch_idx] = +1
    
    # Add loads
    for i, load in enumerate(loads):
        branch_idx = n_edges + n_vsources + i
        if load.node_start < 0:
            A_app[abs(load.node_start) - 1, branch_idx] = -1
        if load.node_end < 0:
            A_app[abs(load.node_end) - 1, branch_idx] = +1
    
    return A_app, n_appended


def assemble_impedance_matrix(R: np.ndarray, L: np.ndarray, P: np.ndarray,
                              A: np.ndarray, omega: float,
                              voltage_sources: Optional[List[VoltageSource]] = None,
                              loads: Optional[List[Load]] = None) -> np.ndarray:
    """
    Assemble the PEEC impedance matrix Z.
    
    Following MATLAB implementation in solvePEEC_harmonic.m:
        Z = R + jωL + (1/jω)C_inv + (1/jω)A'PA
    
    where:
        - R: Resistance matrix [Ω]
        - L: Inductance matrix [H]
        - C_inv = P: Inverse capacitance / potential coefficient matrix [Ω·m or 1/F]
        - A: Incidence matrix
        - ω: Angular frequency [rad/s]
    
    The term (1/jω)A'PA represents the capacitive coupling between branches.
    
    Args:
        R: Resistance matrix, shape (n_edges, n_edges)
        L: Inductance matrix, shape (n_edges, n_edges)
        P: Potential coefficient matrix, shape (n_nodes, n_nodes)
        A: Incidence matrix, shape (n_nodes, n_branches)
        omega: Angular frequency [rad/s], must be positive
        voltage_sources: Optional voltage sources (add series impedance)
        loads: Optional loads (add series impedance)
    
    Returns:
        Impedance matrix Z [Ω], shape (n_branches, n_branches)
    
    Raises:
        ValueError: If omega <= 0 or matrix shapes incompatible
    """
    if omega <= 0:
        raise ValueError(f"Angular frequency must be positive, got {omega}")
    
    n_edges = R.shape[0]
    voltage_sources = voltage_sources or []
    loads = loads or []
    
    n_vsources = len(voltage_sources)
    n_loads = len(loads)
    n_branches = n_edges + n_vsources + n_loads
    
    # Validate shapes
    if L.shape != (n_edges, n_edges):
        raise ValueError(f"L matrix shape {L.shape} doesn't match R matrix shape {R.shape}")
    if A.shape[1] != n_branches:
        raise ValueError(f"Incidence matrix has {A.shape[1]} branches, expected {n_branches}")
    
    # Initialize impedance matrix
    Z = np.zeros((n_branches, n_branches), dtype=complex)
    
    # Mesh edges: Z_mesh = R + jωL + (1/jω)C_inv + (1/jω)A'PA
    Z[:n_edges, :n_edges] = R + 1j * omega * L
    
    # Add capacitive coupling term: (1/jω)A'PA
    # This couples all branches through the electrostatic field
    capacitive_term = (1 / (1j * omega)) * (A.T @ P @ A)
    Z += capacitive_term
    
    # Add voltage source impedances
    for i, vsrc in enumerate(voltage_sources):
        branch_idx = n_edges + i
        Z[branch_idx, branch_idx] += vsrc.impedance
    
    # Add load impedances
    for i, load in enumerate(loads):
        branch_idx = n_edges + n_vsources + i
        Z[branch_idx, branch_idx] += load.impedance
    
    return Z


def assemble_system_matrix(Z: np.ndarray, A_app: np.ndarray) -> np.ndarray:
    """
    Assemble the complete PEEC system matrix.
    
    Following MATLAB implementation:
        SYSTEM = [Z        A_app']
                 [-A_app   0     ]
    
    This system enforces:
    - Impedance relationships: Z*I = V
    - Current conservation at appended nodes: A_app*I = I_app
    
    Args:
        Z: Impedance matrix, shape (n_branches, n_branches)
        A_app: Appended incidence matrix, shape (n_appended, n_branches)
    
    Returns:
        System matrix, shape (n_branches + n_appended, n_branches + n_appended)
    """
    n_branches = Z.shape[0]
    n_appended = A_app.shape[0]
    
    if n_appended == 0:
        # No appended nodes - just return Z
        return Z
    
    # Assemble block matrix
    system_size = n_branches + n_appended
    system_matrix = np.zeros((system_size, system_size), dtype=complex)
    
    # Top-left: impedance matrix
    system_matrix[:n_branches, :n_branches] = Z
    
    # Top-right: transpose of appended incidence matrix
    system_matrix[:n_branches, n_branches:] = A_app.T
    
    # Bottom-left: negative appended incidence matrix
    system_matrix[n_branches:, :n_branches] = -A_app
    
    # Bottom-right: zeros (no coupling between appended nodes)
    # Already initialized to zero
    
    return system_matrix


def assemble_source_vector(voltage_sources: List[VoltageSource],
                           current_sources: List[CurrentSource],
                           A: np.ndarray, P: np.ndarray,
                           omega: float, n_edges: int,
                           n_appended: int) -> np.ndarray:
    """
    Assemble the source vector for the PEEC system.
    
    Following MATLAB implementation:
        Source = [V_source - (1/jω)A'P*I_source]
                 [I_app_source                 ]
    
    Args:
        voltage_sources: List of voltage sources
        current_sources: List of current sources
        A: Incidence matrix, shape (n_nodes, n_branches)
        P: Potential coefficient matrix, shape (n_nodes, n_nodes)
        omega: Angular frequency [rad/s]
        n_edges: Number of mesh edges
        n_appended: Number of appended nodes
    
    Returns:
        Source vector, shape (n_branches + n_appended,)
    """
    n_nodes = A.shape[0]
    n_branches = A.shape[1]
    
    # Initialize source vectors
    source_V = np.zeros(n_branches, dtype=complex)
    source_I = np.zeros(n_nodes, dtype=complex)
    source_I_app = np.zeros(n_appended, dtype=complex)
    
    # Add voltage sources
    for i, vsrc in enumerate(voltage_sources):
        source_V[n_edges + i] = vsrc.value
    
    # Add current sources
    for isrc in current_sources:
        if isrc.node > 0:
            source_I[isrc.node - 1] = isrc.value
        elif isrc.node < 0:
            source_I_app[abs(isrc.node) - 1] = isrc.value
    
    # Assemble complete source vector
    # Branch sources: V_source - (1/jω)A'P*I_source
    source_branches = source_V - (1 / (1j * omega)) * (A.T @ P @ source_I)
    
    # Combine with appended node sources
    if n_appended > 0:
        return np.concatenate([source_branches, source_I_app])
    else:
        return source_branches


def solve_peec_system(system_matrix: np.ndarray,
                     source_vector: np.ndarray,
                     n_branches: int) -> Tuple[np.ndarray, np.ndarray]:
    """
    Solve the PEEC system of equations.
    
    Solves: SYSTEM * X = SOURCE
    where X = [I; V_app] contains branch currents and appended node voltages.
    
    Args:
        system_matrix: System matrix, shape (n_total, n_total)
        source_vector: Source vector, shape (n_total,)
        n_branches: Number of branches (edges + voltage sources + loads)
    
    Returns:
        Tuple of (I, V_app):
            - I: Branch currents [A], shape (n_branches,)
            - V_app: Appended node voltages [V], shape (n_appended,)
    
    Raises:
        np.linalg.LinAlgError: If system is singular
    """
    # Solve linear system
    X = np.linalg.solve(system_matrix, source_vector)
    
    # Extract currents and appended voltages
    # System matrix structure: [Z A_app'; -A_app 0]
    # First n_branches elements are currents, rest are appended node voltages
    I = X[:n_branches]
    V_app = X[n_branches:] if len(X) > n_branches else np.array([])
    
    return I, V_app


def compute_node_voltages(I: np.ndarray, I_source: np.ndarray,
                         A: np.ndarray, P: np.ndarray,
                         omega: float) -> np.ndarray:
    """
    Compute node voltages from branch currents.
    
    Following MATLAB implementation:
        V = (1/jω) * P * (I_source + A*I)
    
    where:
        - P: Potential coefficient matrix [Ω·m]
        - A: Incidence matrix
        - I: Branch currents [A]
        - I_source: Current sources at nodes [A]
        - ω: Angular frequency [rad/s]
    
    Args:
        I: Branch currents, shape (n_branches,)
        I_source: Current source vector at nodes, shape (n_nodes,)
        A: Incidence matrix, shape (n_nodes, n_branches)
        P: Potential coefficient matrix, shape (n_nodes, n_nodes)
        omega: Angular frequency [rad/s]
    
    Returns:
        Node voltages [V], shape (n_nodes,)
    """
    # V = (1/jω) * P * (I_source + A*I)
    V = (1 / (1j * omega)) * (P @ (I_source + A @ I))
    
    return V
