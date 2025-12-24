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
    - C_inv: Diagonal inverse capacitance for voltage sources/loads
    - A: Incidence matrix (topology - branch-to-node mapping)
    - P: Potential coefficient matrix (node-based capacitive coupling)

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
        R: Resistance [Ω]
        L: Inductance [H]
        C_inv: Inverse capacitance [1/F]
    """
    node_start: int
    node_end: int
    value: complex
    R: float = 0.0  # Resistance [Ω]
    L: float = 0.0  # Inductance [H]
    C_inv: float = 0.0  # Inverse capacitance [1/F]


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
        R: Resistance [Ω]
        L: Inductance [H]
        C_inv: Inverse capacitance [1/F]
    """
    node_start: int
    node_end: int
    R: float = 0.0  # Resistance [Ω]
    L: float = 0.0  # Inductance [H]
    C_inv: float = 0.0  # Inverse capacitance [1/F]


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
    
    Following MATLAB implementation:
        Z = R + jωL + (1/jω)C_inv + (1/jω)A'PA
    
    where:
        - R: Resistance matrix [Ω]
        - L: Inductance matrix [H]
        - C_inv: Diagonal inverse capacitance matrix [1/F]
        - P: Potential coefficient matrix (node-based) [1/F]
        - A: Incidence matrix (branch-to-node mapping)
        - ω: Angular frequency [rad/s]
    
    The formula matches:
        Matrix_R + 1j*w*Matrix_L + (1/(1j*w))*Matrix_C_inv + (1/(1j*w))*Matrix_A.'*Matrix_P*Matrix_A
    
    Args:
        R: Resistance matrix, shape (n_edges, n_edges)
        L: Inductance matrix, shape (n_edges, n_edges)
        P: Potential coefficient matrix (node-based), shape (n_nodes, n_nodes)
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
    
    # Initialize with zeros - build up Z term by term following MATLAB
    Z = np.zeros((n_branches, n_branches), dtype=complex)
    
    # Build full R, L, C_inv matrices for all branches
    # Note: Matrix_L must be complex to handle retarded inductance
    Matrix_R = np.zeros((n_branches, n_branches))
    Matrix_L = np.zeros((n_branches, n_branches), dtype=complex)
    Matrix_C_inv = np.zeros((n_branches, n_branches))
    
    # Physical mesh edges
    Matrix_R[:n_edges, :n_edges] = R
    Matrix_L[:n_edges, :n_edges] = L
    
    # Voltage sources: add R, L, C_inv
    for i, vsrc in enumerate(voltage_sources):
        branch_idx = n_edges + i
        Matrix_R[branch_idx, branch_idx] = vsrc.R
        Matrix_L[branch_idx, branch_idx] = vsrc.L
        Matrix_C_inv[branch_idx, branch_idx] = vsrc.C_inv
    
    # Loads: add R, L, C_inv
    for i, load in enumerate(loads):
        branch_idx = n_edges + n_vsources + i
        Matrix_R[branch_idx, branch_idx] = load.R
        Matrix_L[branch_idx, branch_idx] = load.L
        Matrix_C_inv[branch_idx, branch_idx] = load.C_inv
    
    # Assemble impedance following MATLAB formula exactly:
    # Z = Matrix_R + 1j*w*Matrix_L + (1/(1j*w))*Matrix_C_inv + (1/(1j*w))*Matrix_A.'*Matrix_P*Matrix_A
    Z = Matrix_R + 1j * omega * Matrix_L + (1 / (1j * omega)) * Matrix_C_inv + (1 / (1j * omega)) * (A.T @ P @ A)
    
    return Z


def assemble_system_matrix(Z: np.ndarray, A_app: np.ndarray) -> np.ndarray:
    """
    Assemble the complete PEEC system matrix.
    
    Following MATLAB implementation in solvePEEC_harmonic.m:
        SYSTEM = [Z        A_app']
                 [-A_app   0     ]
    
    Key insight from MATLAB:
    - Only appended nodes (negative indices) need explicit KCL constraints
    - Regular nodes are handled implicitly through the A'PA term in Z
    - This avoids the redundant equation problem (ground reference)
    
    The system enforces:
    - Branch impedance: Z*I + A_app'*V_app = V_source
    - KCL at appended nodes: -A_app*I = I_app_source
    
    Args:
        Z: Impedance matrix (includes A'PA coupling), shape (n_branches, n_branches)
        A_app: Appended incidence matrix, shape (n_appended, n_branches)
    
    Returns:
        System matrix, shape (n_branches + n_appended, n_branches + n_appended)
    """
    n_branches = Z.shape[0]
    n_appended = A_app.shape[0]
    
    if n_appended == 0:
        # No appended nodes - system is just Z
        return Z
    
    # Assemble block matrix
    system_size = n_branches + n_appended
    system_matrix = np.zeros((system_size, system_size), dtype=complex)
    
    # Top-left: impedance matrix (includes A'PA)
    system_matrix[:n_branches, :n_branches] = Z
    
    # Top-right: transpose of appended incidence matrix
    system_matrix[:n_branches, n_branches:] = A_app.T
    
    # Bottom-left: negative appended incidence matrix (KCL)
    system_matrix[n_branches:, :n_branches] = -A_app
    
    # Bottom-right: zeros (already zero from initialization)
    
    return system_matrix


def assemble_source_vector(voltage_sources: List[VoltageSource],
                           current_sources: List[CurrentSource],
                           A: np.ndarray, P: np.ndarray,
                           omega: float, n_edges: int,
                           n_appended: int) -> np.ndarray:
    """
    Assemble the source vector for the PEEC system.
    
    Full formulation:
        Source_branches = V_source + (1/jω)A'P*I_source
        Source_appended = I_app_source
    
    The (1/jω)A'P*I_source term represents the voltage induced on branches
    by current sources through capacitive coupling.
    
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
    source_I_app = np.zeros(n_appended, dtype=complex)
    
    # Build node current source vector
    I_source = np.zeros(n_nodes, dtype=complex)
    
    # Add voltage sources
    for i, vsrc in enumerate(voltage_sources):
        source_V[n_edges + i] = vsrc.value
    
    # Add current sources
    for isrc in current_sources:
        if isrc.node < 0:
            # Appended node current source
            source_I_app[abs(isrc.node) - 1] = isrc.value
        else:
            # Regular node current source
            I_source[isrc.node] = isrc.value
    
    # Add current source coupling term: (1/jω)A'P*I_source
    # This represents the capacitive voltage induced by current sources
    if np.any(I_source != 0) and P.shape[0] == n_nodes:
        source_V -= (1 / (1j * omega)) * (A.T @ P @ I_source)
    
    # Assemble complete source vector
    source_branches = source_V
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
    
    Following MATLAB formulation:
        [Z      A_app'] [I    ]   [V_source]
        [-A_app 0     ] [V_app] = [I_app  ]
    
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
    # Add regularization for numerical stability
    # This helps with ill-conditioned matrices at very low frequencies or small antennas
    # Use relative regularization based on matrix magnitude
    diag_elements = np.abs(np.diag(system_matrix))
    max_diag = np.max(diag_elements)
    
    if max_diag > 0:
        # Add small regularization (relative to matrix scale)
        eps = 1e-10 * max_diag
        system_matrix = system_matrix + eps * np.eye(len(system_matrix))
    
    # Solve linear system
    try:
        X = np.linalg.solve(system_matrix, source_vector)
    except np.linalg.LinAlgError:
        # If still singular, try with stronger regularization
        eps = 1e-8 * max_diag if max_diag > 0 else 1e-8
        system_matrix = system_matrix + eps * np.eye(len(system_matrix))
        X = np.linalg.solve(system_matrix, source_vector)
    
    # Extract currents and voltages
    # System matrix structure: [Z A_app'; -A_app 0]
    # X structure: [I (n_branches); V_app (n_appended)]
    I = X[:n_branches]
    V_app = X[n_branches:] if len(X) > n_branches else np.array([])
    
    return I, V_app


def compute_node_voltages(I: np.ndarray, I_source: np.ndarray,
                         A: np.ndarray, P: np.ndarray,
                         omega: float) -> np.ndarray:
    """
    Compute node voltages from branch currents and current sources.
    
    Using PEEC capacitive relationship:
        V = (1/jω) * P * (A*I + I_source)
    
    where:
        - A*I gives the net current flowing into each node
        - I_source gives external current sources at nodes
        - P converts total node currents to node voltages via capacitance
    
    Args:
        I: Branch currents, shape (n_branches,)
        I_source: Current source vector at nodes, shape (n_nodes,)
        A: Incidence matrix, shape (n_nodes, n_branches)
        P: Potential coefficient matrix, shape (n_nodes, n_nodes)
        omega: Angular frequency [rad/s]
    
    Returns:
        Node voltages [V], shape (n_nodes,)
    """
    n_nodes = A.shape[0]
    
    # Check if P is node-based (should match number of nodes)
    if P.shape[0] != n_nodes:
        # P is not node-based, cannot compute voltages
        return np.zeros(n_nodes, dtype=complex)
    
    # Compute total current at each node: A*I + I_source
    total_node_current = A @ I + I_source
    
    # Compute node voltages: V = (1/jω) * P * I_total
    V = (1 / (1j * omega)) * (P @ total_node_current)
    
    return V
