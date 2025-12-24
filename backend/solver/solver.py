"""
PEEC frequency domain solver.

Main orchestration module that assembles and solves the complete PEEC system
across multiple frequencies. This is the primary interface to the PEEC solver.

Workflow:
    1. Build edge geometries from mesh
    2. Assemble physical matrices (R, L, P)
    3. Build topology (incidence matrices)
    4. For each frequency:
        - Assemble impedance matrix Z(ω)
        - Assemble system matrix and source vector
        - Solve for currents and voltages
        - Compute input impedance and other metrics
    5. Return frequency sweep results

References:
    - MATLAB implementation in PEECSolver/solvePEEC_harmonic.m
    - Ruehli, A.E., "Partial Element Equivalent Circuit (PEEC) Models"

Author: PEEC Solver Development
"""

import numpy as np
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field
import time

from backend.solver.geometry import build_edge_geometries, EdgeGeometry
from backend.solver.resistance import assemble_resistance_matrix
from backend.solver.inductance import assemble_inductance_matrix
from backend.solver.potential_nodal import assemble_nodal_potential_matrix_with_cap_elem
from backend.solver.system import (
    VoltageSource, CurrentSource, Load,
    build_incidence_matrix,
    build_appended_incidence_matrix,
    assemble_impedance_matrix,
    assemble_system_matrix,
    assemble_source_vector,
    solve_peec_system,
    compute_node_voltages
)


@dataclass
class SolverConfiguration:
    """Solver configuration parameters.
    
    Attributes:
        gauss_order: Gauss quadrature order for integration (2, 4, 6, 8, 10)
        include_skin_effect: Whether to include AC resistance skin effect
        resistivity: Material resistivity [Ω·m] (default: copper)
        permeability: Relative permeability (default: 1.0 for non-magnetic)
    """
    gauss_order: int = 6
    include_skin_effect: bool = True
    resistivity: float = 1.68e-8  # Copper
    permeability: float = 1.0


@dataclass
class FrequencyPoint:
    """Solution at a single frequency.
    
    Attributes:
        frequency: Frequency [Hz]
        omega: Angular frequency [rad/s]
        branch_currents: Branch currents [A], shape (n_branches,)
        node_voltages: Node voltages [V], shape (n_nodes,)
        appended_voltages: Appended node voltages [V], shape (n_appended,)
        input_impedance: Input impedance [Ω] (V_source / I_source)
        input_current: Current at voltage source terminal [A]
        power_dissipated: Total power dissipated in resistance [W]
        reflection_coefficient: Complex reflection coefficient Γ
        return_loss: Return loss in dB (|S11|)
        input_power: Total input power [W]
        reflected_power: Reflected power [W]
        accepted_power: Accepted power (input - reflected) [W]
        solve_time: Time to solve system [s]
    """
    frequency: float
    omega: float
    branch_currents: np.ndarray
    node_voltages: np.ndarray
    appended_voltages: np.ndarray
    input_impedance: complex
    input_current: complex
    power_dissipated: float
    reflection_coefficient: complex
    return_loss: float
    input_power: float
    reflected_power: float
    accepted_power: float
    solve_time: float


@dataclass
class SolverResult:
    """Complete solver results across frequency sweep.
    
    Attributes:
        frequencies: Frequency points [Hz]
        frequency_solutions: List of FrequencyPoint solutions
        impedance_real: Input resistance vs frequency [Ω]
        impedance_imag: Input reactance vs frequency [Ω]
        impedance_magnitude: |Z| vs frequency [Ω]
        impedance_phase: Phase(Z) vs frequency [deg]
        reflection_coefficient: Γ vs frequency (complex)
        return_loss: Return loss vs frequency [dB]
        vswr: Voltage standing wave ratio vs frequency (relative to Z0)
        mismatch_loss: Mismatch loss vs frequency [dB]
        reference_impedance: Reference impedance for VSWR [Ω]
        n_nodes: Number of nodes in mesh
        n_edges: Number of edges in mesh
        n_branches: Total branches (edges + sources + loads)
        total_solve_time: Total computation time [s]
        configuration: Solver configuration used
    """
    frequencies: np.ndarray
    frequency_solutions: List[FrequencyPoint]
    impedance_real: np.ndarray
    impedance_imag: np.ndarray
    impedance_magnitude: np.ndarray
    impedance_phase: np.ndarray
    reflection_coefficient: np.ndarray
    return_loss: np.ndarray
    vswr: np.ndarray
    mismatch_loss: np.ndarray
    reference_impedance: float
    n_nodes: int
    n_edges: int
    n_branches: int
    total_solve_time: float
    configuration: SolverConfiguration


def solve_peec_frequency_sweep(
    nodes: np.ndarray,
    edges: List[List[int]],
    radii: np.ndarray,
    frequencies: np.ndarray,
    voltage_sources: Optional[List[VoltageSource]] = None,
    current_sources: Optional[List[CurrentSource]] = None,
    loads: Optional[List[Load]] = None,
    config: Optional[SolverConfiguration] = None,
    reference_impedance: float = 50.0
) -> SolverResult:
    """
    Solve PEEC system across a frequency sweep.
    
    This is the main entry point for the PEEC solver. It assembles the complete
    system and solves at each frequency point.
    
    Args:
        nodes: Node coordinates [m], shape (n_nodes, 3)
        edges: Edge connectivity list [[node1, node2], ...] (1-based indexing)
        radii: Wire radii [m], shape (n_edges,)
        frequencies: Frequency points to solve [Hz], shape (n_freq,)
        voltage_sources: List of voltage sources
        current_sources: Optional list of current sources
        loads: Optional list of loads
        config: Optional solver configuration
        reference_impedance: Reference impedance for VSWR calculation [Ω]
    
    Returns:
        SolverResult containing complete frequency sweep results
    
    Raises:
        ValueError: If input dimensions are invalid
        np.linalg.LinAlgError: If system is singular at any frequency
    
    Example:
        >>> nodes = np.array([[0, 0, 0], [0, 0, 0.05], [0, 0, 0.1]])
        >>> edges = [[1, 2], [2, 3]]
        >>> radii = np.array([0.001, 0.001])
        >>> freqs = np.logspace(6, 9, 50)  # 1 MHz to 1 GHz
        >>> vsrc = VoltageSource(node_start=2, node_end=0, value=1.0, impedance=50.0)
        >>> result = solve_peec_frequency_sweep(nodes, edges, radii, freqs, [vsrc])
        >>> print(f"Input impedance at 100 MHz: {result.frequency_solutions[25].input_impedance}")
    """
    start_time = time.time()
    
    # Set defaults
    config = config or SolverConfiguration()
    current_sources = current_sources or []
    voltage_sources = voltage_sources or []
    loads = loads or []
    
    # Validate inputs
    n_nodes = len(nodes)
    n_edges = len(edges)
    
    if len(radii) != n_edges:
        raise ValueError(f"radii length {len(radii)} doesn't match edges length {n_edges}")
    
    if len(voltage_sources) == 0 and len(current_sources) == 0: 
        raise ValueError("At least one voltage source or current source is required")
    
    # Step 1: Build edge geometries and handle edges to/from ground
    # Ground is node 0. For edges to/from ground, we can't build full EdgeGeometry
    # but we can estimate their length and use simplified formulas.
    physical_edge_indices = []  # Edges between two non-ground nodes
    physical_edges_0based = []
    
    for i, edge in enumerate(edges):
        if edge[0] > 0 and edge[1] > 0:
            # Physical edge between two non-ground nodes
            physical_edge_indices.append(i)
            physical_edges_0based.append([edge[0]-1, edge[1]-1])
    
    # Build geometries for physical edges
    if len(physical_edges_0based) > 0:
        edge_geom_list = build_edge_geometries(nodes, physical_edges_0based)
        physical_radii = radii[physical_edge_indices]
    else:
        edge_geom_list = []
        physical_radii = np.array([])
    
    n_physical_edges = len(edge_geom_list)
    
    # Step 2: Assemble frequency-independent matrices
    # Inductance for physical edges (potential is node-based only)
    if n_physical_edges > 0:
        L_physical, dist_L_physical = assemble_inductance_matrix(edge_geom_list, physical_radii)
    else:
        L_physical = np.zeros((0, 0))
        dist_L_physical = np.zeros((0, 0))
    
    # For ground edges, use simplified formulas
    # L ≈ (μ₀/2π) * length * [ln(2*length/radius) - 1] for a thin wire to ground
    # P ≈ (1/2πε₀) * length * ln(2*length/radius) for potential coefficient
    mu0 = 4 * np.pi * 1e-7  # H/m
    eps0 = 8.854e-12  # F/m
        
    # Step 3: Build topology (frequency-independent)
    # Account for node indexing: mesh nodes are 1-based, with 0 as ground
    max_node = max(max(e) for e in edges)
    
    # Compute node-based potential matrix P (required for A'PA coupling)
    # This is (n_nodes × n_nodes) following MATLAB implementation
    # Uses Cap_Elem representation for each node
    n_nodes = len(nodes)
    if n_physical_edges > 0:
        # Filter edge list to only include physical edges (exclude ground edges)
        physical_edge_list = [edges[i] for i in physical_edge_indices]
        P_nodal, dist_P_nodal, cap_elem, radii_cap = assemble_nodal_potential_matrix_with_cap_elem(
            edge_geom_list, physical_edge_list, physical_radii, n_nodes
        )
    else:
        P_nodal = np.zeros((n_nodes, n_nodes))
        dist_P_nodal = np.zeros((n_nodes, n_nodes))
        cap_elem = np.zeros((3, 3, n_nodes))
        radii_cap = np.zeros((n_nodes, 2))
    
    A = build_incidence_matrix(
        edges, max_node,
        voltage_sources=voltage_sources,
        loads=loads
    )
    
    A_app, n_appended = build_appended_incidence_matrix(
        voltage_sources, loads, n_edges
    )
    
    n_branches = A.shape[1]
    
    # Prepare current source vector (frequency-independent positions)
    I_source = np.zeros(max_node, dtype=complex)
    for isrc in current_sources:
        if 0 < isrc.node <= max_node:
            I_source[isrc.node - 1] = isrc.value
    
    # Step 4: Solve at each frequency
    frequency_solutions = []
    
    # Speed of light for retarded potential calculation
    c0 = 299792458.0  # m/s
    
    for freq in frequencies:
        freq_start = time.time()
        omega = 2 * np.pi * freq
        
        # Apply retarded potential phase correction to inductance
        # Following MATLAB: retardation applied only to off-diagonal terms
        # Ret_L =  exp(-1i*beta*dist_L);
        # L = diag(diag(L))+triu(L,1)+triu(L,1).';
        # Ret_L = triu(Ret_L,1)+triu(Ret_L,1).';
        # Matrix_L = diag(diag(L)) + L.*Ret_L;
        if n_physical_edges > 0:
            beta = omega / c0
            Ret_L = np.exp(-1j * beta * dist_L_physical)
            L_diag = np.diag(np.diag(L_physical))
            L_off_upper = np.triu(L_physical, 1)
            Ret_L_off_upper = np.triu(Ret_L, 1)
            L_physical_retarded = L_diag + L_off_upper * Ret_L_off_upper + (L_off_upper * Ret_L_off_upper).T
        else:
            L_physical_retarded = L_physical
        
        # Apply retarded potential phase correction to nodal potential matrix
        # Following MATLAB: retardation applied only to off-diagonal terms
        # Ret_P = exp(-1i*beta*dist_P);
        # P = diag(diag(P))+triu(P,1)+triu(P,1).';
        # Ret_P = triu(Ret_P,1)+triu(Ret_P,1).';
        # Matrix_P = diag(diag(P)) + P.*Ret_P;
        if n_physical_edges > 0:
            Ret_P = np.exp(-1j * beta * dist_P_nodal)
            P_diag = np.diag(np.diag(P_nodal))
            P_off_upper = np.triu(P_nodal, 1)
            Ret_P_off_upper = np.triu(Ret_P, 1)
            P_nodal_retarded = P_diag + P_off_upper * Ret_P_off_upper + (P_off_upper * Ret_P_off_upper).T
        else:
            P_nodal_retarded = P_nodal
        
        # Assemble frequency-dependent inductance matrix with retardation
        L_full = np.zeros((n_edges, n_edges), dtype=complex)
        
        # Place physical edge contributions (with retardation)
        if n_physical_edges > 0:
            for i, idx_i in enumerate(physical_edge_indices):
                for j, idx_j in enumerate(physical_edge_indices):
                    L_full[idx_i, idx_j] = L_physical_retarded[i, j]
        
        
        # Assemble frequency-dependent resistance matrix
        R = np.zeros((n_edges, n_edges))
        
        # Physical edges: use full PEEC resistance calculation
        if n_physical_edges > 0:
            R_physical = assemble_resistance_matrix(
                edge_geom_list, physical_radii,
                frequency=freq,
                resistivity=config.resistivity,
                permeability=config.permeability,
                include_skin_effect=config.include_skin_effect
            )
            for i, idx_i in enumerate(physical_edge_indices):
                for j, idx_j in enumerate(physical_edge_indices):
                    R[idx_i, idx_j] = R_physical[i, j]
        
        # Assemble impedance matrix Z(ω) 
        # Pass node-based P matrix with retardation for A'PA coupling term
        Z = assemble_impedance_matrix(
            R, L_full, P_nodal_retarded, A, omega,
            voltage_sources=voltage_sources,
            loads=loads
        )
        
        # Assemble system matrix (only use A_app, following MATLAB)
        system_matrix = assemble_system_matrix(Z, A_app)
        
        # Assemble source vector with capacitive coupling (use retarded P)
        source_vector = assemble_source_vector(
            voltage_sources, current_sources, A, P_nodal_retarded, omega, n_edges, n_appended
        )
        
        # Solve system
        I, V_app = solve_peec_system(system_matrix, source_vector, n_branches)
        
        # Compute node voltages (following MATLAB: V = (1/jω)*(P*I_source + P*A*I))
        V = compute_node_voltages(I, I_source, A, P_nodal_retarded, omega)
        
        # Compute input impedance
        # Find voltage source branch (first one by convention)
        vsrc_branch_idx = n_edges  # First voltage source after edges
        input_current = I[vsrc_branch_idx]
        input_voltage = voltage_sources[0].value
        
        if np.abs(input_current) > 1e-12:
            input_impedance = input_voltage / input_current
        else:
            input_impedance = np.inf + 0j
        
        # Compute power dissipated in resistances
        # P = I^H * R * I (real part)
        R_full = np.zeros_like(Z)
        R_full[:n_edges, :n_edges] = R
        power_dissipated = np.real(np.conj(I) @ R_full @ I)
        
        # Compute port parameters relative to reference impedance
        Z0 = reference_impedance
        reflection_coefficient = (input_impedance - Z0) / (input_impedance + Z0)
        gamma_mag = np.abs(reflection_coefficient)
        
        # Return loss in dB: RL = -20*log10(|Γ|)
        return_loss = -20.0 * np.log10(gamma_mag + 1e-12)  # Add epsilon to avoid log(0)
        return_loss = np.clip(return_loss, 0.0, 100.0)  # Clip to reasonable range
        
        # Power quantities
        # Input power: P_in = 0.5 * |V|² / Z0 (assuming voltage source with Z0)
        # Or more accurately: P_in = 0.5 * Re(V * I*)
        input_power = 0.5 * np.real(input_voltage * np.conj(input_current))
        
        # Reflected power: P_refl = |Γ|² * P_in
        reflected_power = gamma_mag**2 * input_power
        
        # Accepted power: P_acc = P_in - P_refl = (1 - |Γ|²) * P_in
        accepted_power = input_power - reflected_power
        
        freq_time = time.time() - freq_start
        
        # Store solution
        solution = FrequencyPoint(
            frequency=freq,
            omega=omega,
            branch_currents=I.copy(),
            node_voltages=V.copy(),
            appended_voltages=V_app.copy(),
            input_impedance=input_impedance,
            input_current=input_current,
            power_dissipated=power_dissipated,
            reflection_coefficient=reflection_coefficient,
            return_loss=return_loss,
            input_power=input_power,
            reflected_power=reflected_power,
            accepted_power=accepted_power,
            solve_time=freq_time
        )
        
        frequency_solutions.append(solution)
    
    # Step 5: Post-process results
    impedances = np.array([sol.input_impedance for sol in frequency_solutions])
    impedance_real = np.real(impedances)
    impedance_imag = np.imag(impedances)
    impedance_magnitude = np.abs(impedances)
    impedance_phase = np.angle(impedances, deg=True)
    
    # Extract reflection coefficients and return loss
    reflection_coefficients = np.array([sol.reflection_coefficient for sol in frequency_solutions])
    return_losses = np.array([sol.return_loss for sol in frequency_solutions])
    
    # Compute VSWR relative to reference impedance
    # VSWR = (1 + |Γ|) / (1 - |Γ|) where Γ = (Z - Z0) / (Z + Z0)
    gamma = (impedances - reference_impedance) / (impedances + reference_impedance)
    gamma_mag = np.abs(gamma)
    vswr = (1 + gamma_mag) / (1 - gamma_mag + 1e-10)  # Add epsilon to avoid division by zero
    vswr = np.clip(vswr, 1.0, 100.0)  # Clip extreme values
    
    # Compute mismatch loss: ML = -10*log10(1 - |Γ|²) [dB]
    mismatch_loss = -10.0 * np.log10(1.0 - gamma_mag**2 + 1e-12)
    mismatch_loss = np.clip(mismatch_loss, 0.0, 50.0)  # Clip to reasonable range
    
    total_time = time.time() - start_time
    
    return SolverResult(
        frequencies=frequencies,
        frequency_solutions=frequency_solutions,
        impedance_real=impedance_real,
        impedance_imag=impedance_imag,
        impedance_magnitude=impedance_magnitude,
        impedance_phase=impedance_phase,
        reflection_coefficient=reflection_coefficients,
        return_loss=return_losses,
        vswr=vswr,
        mismatch_loss=mismatch_loss,
        reference_impedance=reference_impedance,
        n_nodes=max_node,
        n_edges=n_edges,
        n_branches=n_branches,
        total_solve_time=total_time,
        configuration=config
    )


def solve_single_frequency(
    nodes: np.ndarray,
    edges: List[List[int]],
    radii: np.ndarray,
    frequency: float,
    voltage_sources: List[VoltageSource],
    current_sources: Optional[List[CurrentSource]] = None,
    loads: Optional[List[Load]] = None,
    config: Optional[SolverConfiguration] = None
) -> FrequencyPoint:
    """
    Solve PEEC system at a single frequency.
    
    Convenience wrapper for single-frequency solutions.
    
    Args:
        nodes: Node coordinates [m], shape (n_nodes, 3)
        edges: Edge connectivity list [[node1, node2], ...]
        radii: Wire radii [m], shape (n_edges,)
        frequency: Frequency to solve [Hz]
        voltage_sources: List of voltage sources
        current_sources: Optional list of current sources
        loads: Optional list of loads
        config: Optional solver configuration
    
    Returns:
        FrequencyPoint solution at specified frequency
    """
    result = solve_peec_frequency_sweep(
        nodes, edges, radii,
        np.array([frequency]),
        voltage_sources, current_sources, loads,
        config
    )
    
    return result.frequency_solutions[0]


def compute_resonant_frequency(result: SolverResult) -> Optional[float]:
    """
    Find resonant frequency where reactance crosses zero.
    
    Args:
        result: Solver result from frequency sweep
    
    Returns:
        Resonant frequency [Hz], or None if not found in sweep range
    """
    # Find zero crossings of reactance
    reactance = result.impedance_imag
    
    # Look for sign changes
    for i in range(len(reactance) - 1):
        if reactance[i] * reactance[i + 1] < 0:
            # Linear interpolation to find zero crossing
            f1, f2 = result.frequencies[i], result.frequencies[i + 1]
            x1, x2 = reactance[i], reactance[i + 1]
            
            # f_res = f1 - x1 * (f2 - f1) / (x2 - x1)
            f_res = f1 + (0 - x1) * (f2 - f1) / (x2 - x1)
            return f_res
    
    return None


def compute_bandwidth(result: SolverResult, vswr_limit: float = 2.0) -> Tuple[Optional[float], Optional[float], Optional[float]]:
    """
    Compute bandwidth where VSWR < limit.
    
    Args:
        result: Solver result from frequency sweep
        vswr_limit: VSWR threshold (default: 2.0)
    
    Returns:
        Tuple of (f_low, f_high, bandwidth_pct):
            - f_low: Lower bandwidth edge [Hz]
            - f_high: Upper bandwidth edge [Hz]
            - bandwidth_pct: Fractional bandwidth [%]
        Returns (None, None, None) if no valid bandwidth found
    """
    # Find frequencies where VSWR < limit
    valid = result.vswr < vswr_limit
    
    if not np.any(valid):
        return None, None, None
    
    # Find continuous region
    # For simplicity, take the first continuous region
    valid_indices = np.where(valid)[0]
    
    if len(valid_indices) == 0:
        return None, None, None
    
    # Find continuous segments
    segments = []
    start = valid_indices[0]
    
    for i in range(1, len(valid_indices)):
        if valid_indices[i] != valid_indices[i-1] + 1:
            # Gap found, end current segment
            segments.append((start, valid_indices[i-1]))
            start = valid_indices[i]
    
    # Add final segment
    segments.append((start, valid_indices[-1]))
    
    # Take the widest segment
    widest_segment = max(segments, key=lambda s: s[1] - s[0])
    i_low, i_high = widest_segment
    
    f_low = result.frequencies[i_low]
    f_high = result.frequencies[i_high]
    f_center = (f_low + f_high) / 2
    bandwidth_pct = 100 * (f_high - f_low) / f_center
    
    return f_low, f_high, bandwidth_pct


def compute_radiation_efficiency(accepted_power: float, power_dissipated: float, 
                                  radiated_power: Optional[float] = None) -> Optional[float]:
    """
    Compute radiation efficiency.
    
    Args:
        accepted_power: Power accepted by antenna (input - reflected) [W]
        power_dissipated: Power dissipated in resistance [W]
        radiated_power: Power radiated (from far-field integration) [W]
                       If None, efficiency cannot be computed
    
    Returns:
        Radiation efficiency [0-1], or None if radiated_power not available
        
    Note:
        η_rad = P_rad / P_accepted = P_rad / (P_rad + P_loss)
        Requires far-field computation to determine P_rad
    """
    if radiated_power is None:
        return None
    
    if accepted_power < 1e-12:
        return None
    
    efficiency = radiated_power / accepted_power
    return np.clip(efficiency, 0.0, 1.0)


def compute_antenna_gain(directivity: float, efficiency: float) -> float:
    """
    Compute antenna gain from directivity and efficiency.
    
    Args:
        directivity: Directivity (dimensionless)
        efficiency: Radiation efficiency [0-1]
    
    Returns:
        Gain (dimensionless): G = η * D
        
    Note:
        - Gain in dBi: G_dBi = 10*log10(G)
        - Requires far-field computation for directivity
    """
    return efficiency * directivity


def compute_q_factor(f_resonant: float, bandwidth: float) -> float:
    """
    Compute quality factor (Q) of resonance.
    
    Args:
        f_resonant: Resonant frequency [Hz]
        bandwidth: -3dB bandwidth [Hz]
    
    Returns:
        Quality factor Q = f0 / BW
    """
    if bandwidth < 1e-6:
        return np.inf
    
    return f_resonant / bandwidth
