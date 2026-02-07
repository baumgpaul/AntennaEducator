"""
Tests for PEEC system matrix assembly.

These tests verify the system assembly following the reference PEEC implementation
in solvePEEC_harmonic.
"""

import numpy as np
import pytest

from backend.solver.system import (
    VoltageSource,
    CurrentSource,
    Load,
    build_incidence_matrix,
    build_appended_incidence_matrix,
    assemble_impedance_matrix,
    assemble_system_matrix,
    assemble_source_vector,
    solve_peec_system,
    compute_node_voltages
)


class TestIncidenceMatrix:
    """Test incidence matrix construction."""
    
    def test_simple_two_segment_dipole(self):
        """Test incidence matrix for simple two-segment dipole."""
        # Node 1 --edge1--> Node 2 --edge2--> Node 3 (ground = 0)
        edges = [[1, 2], [2, 3]]
        A = build_incidence_matrix(edges, n_nodes=3)
        
        # Check shape
        assert A.shape == (3, 2)
        
        # Edge 1: from node 1 to node 2
        assert A[0, 0] == -1  # Leaves node 1
        assert A[1, 0] == +1  # Enters node 2
        assert A[2, 0] == 0   # Not connected to node 3
        
        # Edge 2: from node 2 to node 3
        assert A[0, 1] == 0   # Not connected to node 1
        assert A[1, 1] == -1  # Leaves node 2
        assert A[2, 1] == +1  # Enters node 3
    
    def test_dipole_with_ground(self):
        """Test dipole connected to ground."""
        # Node 1 --edge1--> Node 2 --edge2--> Ground (0)
        edges = [[1, 2], [2, 0]]
        A = build_incidence_matrix(edges, n_nodes=2)
        
        assert A.shape == (2, 2)
        
        # Edge 1: node 1 to node 2
        assert A[0, 0] == -1
        assert A[1, 0] == +1
        
        # Edge 2: node 2 to ground (node 0)
        assert A[0, 1] == 0
        assert A[1, 1] == -1  # Leaves node 2, enters ground
    
    def test_with_voltage_source(self):
        """Test incidence matrix with voltage source."""
        edges = [[1, 2]]
        vsrc = [VoltageSource(node_start=2, node_end=0, value=1.0)]
        A = build_incidence_matrix(edges, n_nodes=2, voltage_sources=vsrc)
        
        # Should have 2 branches: 1 edge + 1 voltage source
        assert A.shape == (2, 2)
        
        # Voltage source: node 2 to ground
        assert A[1, 1] == -1  # Leaves node 2
    
    def test_current_conservation(self):
        """Test that incidence matrix enforces Kirchhoff's Current Law."""
        edges = [[1, 2], [2, 3], [3, 1]]  # Triangle
        A = build_incidence_matrix(edges, n_nodes=3)
        
        # Sum over each row should give conservation at each node
        # For a closed loop, A * I = 0 (no external sources)
        # Let's verify the structure
        assert A.shape == (3, 3)
        
        # Each column sums to 0 (closed loop)
        for col in range(3):
            assert np.sum(A[:, col]) == 0


class TestAppendedIncidenceMatrix:
    """Test appended incidence matrix for auxiliary nodes."""
    
    def test_no_appended_nodes(self):
        """Test when there are no appended nodes."""
        vsrc = [VoltageSource(node_start=1, node_end=0, value=1.0)]
        A_app, n_app = build_appended_incidence_matrix(vsrc, [], n_edges=1)
        
        assert n_app == 0
        assert A_app.shape == (0, 0)
    
    def test_voltage_source_with_appended_node(self):
        """Test voltage source using appended node."""
        vsrc = [VoltageSource(node_start=-1, node_end=1, value=1.0)]
        A_app, n_app = build_appended_incidence_matrix(vsrc, [], n_edges=1)
        
        assert n_app == 1
        assert A_app.shape == (1, 2)  # 1 appended node, 2 branches (1 edge + 1 vsrc)
        
        # Voltage source branch
        assert A_app[0, 1] == -1  # Leaves appended node -1
    
    def test_load_with_appended_node(self):
        """Test load connected to appended node."""
        load = [Load(node_start=1, node_end=-1, R=50.0, L=0.0, C_inv=0.0)]
        A_app, n_app = build_appended_incidence_matrix([], load, n_edges=1)
        
        assert n_app == 1
        assert A_app.shape == (1, 2)
        
        # Load branch
        assert A_app[0, 1] == +1  # Enters appended node -1


class TestImpedanceMatrix:
    """Test impedance matrix assembly."""
    
    def test_simple_dipole_impedance(self):
        """Test impedance matrix for simple dipole."""
        # Simple 2-segment dipole
        R = np.array([[1.0, 0.0], [0.0, 1.0]])
        L = np.array([[1e-9, 1e-10], [1e-10, 1e-9]])
        P = np.array([[1e10, 5e9, 2e9], [5e9, 1e10, 5e9], [2e9, 5e9, 1e10]])
        A = np.array([[-1, 0], [1, -1], [0, 1]])  # 3 nodes, 2 edges
        omega = 2 * np.pi * 1e6  # 1 MHz
        
        Z = assemble_impedance_matrix(R, L, P, A, omega)
        
        # Check shape
        assert Z.shape == (2, 2)
        
        # Check that Z is complex
        assert Z.dtype == np.complex128
        
        # Diagonal should be dominated by resistance at low frequencies
        assert np.real(Z[0, 0]) > 0
        assert np.real(Z[1, 1]) > 0
        
        # Should have inductive component
        assert np.imag(Z[0, 0]) != 0
    
    def test_with_voltage_source_impedance(self):
        """Test adding voltage source series impedance."""
        R = np.array([[1.0]])
        L = np.array([[1e-9]])
        P = np.array([[1e10, 5e9], [5e9, 1e10]])
        # A must have 2 branches: 1 edge + 1 voltage source
        A = np.array([[-1, 0], [1, -1]])  # 2 nodes, 2 branches
        omega = 2 * np.pi * 1e6
        
        vsrc = [VoltageSource(node_start=2, node_end=0, value=1.0, R=50.0)]
        Z = assemble_impedance_matrix(R, L, P, A, omega, voltage_sources=vsrc)
        
        # Should have 2 branches: 1 edge + 1 vsrc
        assert Z.shape == (2, 2)
        
        # Voltage source impedance should be added to diagonal
        assert np.real(Z[1, 1]) == 50.0  # Only vsrc impedance
    
    def test_with_load_impedance(self):
        """Test adding load impedance."""
        R = np.array([[1.0]])
        L = np.array([[1e-9]])
        P = np.array([[1e10]])
        # A must have 2 branches: 1 edge + 1 load
        A = np.array([[-1, -1]])  # 1 node, 2 branches (both to ground)
        omega = 2 * np.pi * 1e6
        
        load = [Load(node_start=1, node_end=0, R=75.0, L=0.0, C_inv=0.0)]
        Z = assemble_impedance_matrix(R, L, P, A, omega, loads=load)
        
        assert Z.shape == (2, 2)
        assert np.real(Z[1, 1]) == 75.0
    
    def test_zero_frequency_raises_error(self):
        """Test that zero frequency raises error."""
        R = np.eye(2)
        L = np.eye(2) * 1e-9
        P = np.eye(2) * 1e10
        A = np.array([[-1, 0], [1, -1]])
        
        with pytest.raises(ValueError, match="Angular frequency must be positive"):
            assemble_impedance_matrix(R, L, P, A, omega=0.0)
    
    def test_negative_frequency_raises_error(self):
        """Test that negative frequency raises error."""
        R = np.eye(2)
        L = np.eye(2) * 1e-9
        P = np.eye(2) * 1e10
        A = np.array([[-1, 0], [1, -1]])
        
        with pytest.raises(ValueError, match="Angular frequency must be positive"):
            assemble_impedance_matrix(R, L, P, A, omega=-1e6)


class TestSystemMatrix:
    """Test complete system matrix assembly."""
    
    def test_system_without_appended_nodes(self):
        """Test system matrix when no appended nodes."""
        Z = np.array([[1+1j, 0.5], [0.5, 1+1j]])
        A_app = np.zeros((0, 2))
        
        S = assemble_system_matrix(Z, A_app)
        
        # Should just return Z
        assert S.shape == (2, 2)
        assert np.allclose(S, Z)
    
    def test_system_with_appended_nodes(self):
        """Test system matrix with appended nodes."""
        Z = np.array([[1+1j, 0.5], [0.5, 1+1j]])
        A_app = np.array([[1.0, -1.0]])  # 1 appended node, 2 branches
        
        S = assemble_system_matrix(Z, A_app)
        
        # Should be 3x3: 2 branches + 1 appended
        assert S.shape == (3, 3)
        
        # Top-left should be Z
        assert np.allclose(S[:2, :2], Z)
        
        # Top-right should be A_app.T
        assert np.allclose(S[:2, 2], A_app.T.flatten())
        
        # Bottom-left should be -A_app
        assert np.allclose(S[2, :2], -A_app)
        
        # Bottom-right should be zero
        assert S[2, 2] == 0
    
    def test_system_matrix_structure(self):
        """Test general structure of system matrix."""
        n_branches = 3
        n_appended = 2
        
        Z = np.eye(n_branches, dtype=complex) * (1 + 1j)
        A_app = np.random.rand(n_appended, n_branches)
        
        S = assemble_system_matrix(Z, A_app)
        
        assert S.shape == (5, 5)
        
        # Verify block structure
        assert np.allclose(S[:n_branches, :n_branches], Z)
        assert np.allclose(S[:n_branches, n_branches:], A_app.T)
        assert np.allclose(S[n_branches:, :n_branches], -A_app)
        assert np.allclose(S[n_branches:, n_branches:], 0)


class TestSourceVector:
    """Test source vector assembly."""
    
    def test_voltage_source_only(self):
        """Test source vector with only voltage source."""
        vsrc = [VoltageSource(node_start=1, node_end=0, value=10.0)]
        isrc = []
        # A must include both edge and voltage source branches
        A = np.array([[-1, -1]])  # 1 node, 2 branches
        P = np.array([[1e10]])
        omega = 2 * np.pi * 1e6
        
        source = assemble_source_vector(vsrc, isrc, A, P, omega, n_edges=1, n_appended=0)
        
        # Should have 2 elements: 1 edge + 1 vsrc
        assert len(source) == 2
        assert source[1] == 10.0  # Voltage source value
    
    def test_current_source_contribution(self):
        """Test current source contribution to source vector."""
        vsrc = []
        isrc = [CurrentSource(node=1, value=1.0)]
        A = np.array([[-1], [1]])
        P = np.eye(2) * 1e10
        omega = 2 * np.pi * 1e6
        
        source = assemble_source_vector(vsrc, isrc, A, P, omega, n_edges=1, n_appended=0)
        
        # Current source affects edge voltage through A'P term
        assert len(source) == 1
        assert source[0] != 0  # Should have contribution from current source
    
    def test_appended_current_source(self):
        """Test current source at appended node."""
        vsrc = []
        isrc = [CurrentSource(node=-1, value=2.0)]
        A = np.array([[-1]])
        P = np.eye(1) * 1e10
        omega = 2 * np.pi * 1e6
        
        source = assemble_source_vector(vsrc, isrc, A, P, omega, n_edges=1, n_appended=1)
        
        # Should have 2 elements: 1 edge + 1 appended
        assert len(source) == 2
        assert source[1] == 2.0  # Appended current source


class TestPEECSolution:
    """Test PEEC system solution."""
    
    def test_simple_resistive_circuit(self):
        """Test solving simple resistive circuit."""
        # Simple circuit: 1Ω resistor with 1V source
        # System: Z*I = V  =>  [1]*[I] = [1]  =>  I = 1A
        system_matrix = np.array([[1.0 + 0j]])
        source_vector = np.array([1.0 + 0j])
        
        I, V_app = solve_peec_system(system_matrix, source_vector, n_branches=1)
        
        assert len(I) == 1
        assert np.isclose(I[0], 1.0)
        assert len(V_app) == 0
    
    def test_two_resistor_series(self):
        """Test two resistors in series with voltage source."""
        # 1Ω + 1Ω with 2V  =>  I = 1A
        Z = np.array([[1.0, 0.0], [0.0, 1.0]], dtype=complex)
        # Assuming appropriate A matrix and source
        # This is simplified - full test would include complete assembly
        
        # Just test that solver works with 2x2 system
        system_matrix = Z
        source_vector = np.array([1.0, 1.0], dtype=complex)
        
        I, V_app = solve_peec_system(system_matrix, source_vector, n_branches=2)
        
        assert len(I) == 2
        assert I.dtype == np.complex128
    
    def test_with_appended_nodes(self):
        """Test solution with appended nodes."""
        # 3x3 system with 2 branches + 1 appended
        system_matrix = np.array([
            [2+1j, 0.5, 1],
            [0.5, 2+1j, -1],
            [-1, 1, 0]
        ], dtype=complex)
        source_vector = np.array([10.0, 0.0, 0.0], dtype=complex)
        
        I, V_app = solve_peec_system(system_matrix, source_vector, n_branches=2)
        
        # Should split into 2 currents + 1 appended voltage
        assert len(I) == 2
        assert len(V_app) == 1


class TestNodeVoltages:
    """Test node voltage computation."""
    
    def test_compute_voltages_from_currents(self):
        """Test computing node voltages from branch currents."""
        I = np.array([1.0, -1.0], dtype=complex)  # Branch currents
        I_source = np.array([0.0, 0.0], dtype=complex)  # No current sources
        A = np.array([[-1, 0], [1, -1]])  # 2 nodes, 2 edges
        P = np.eye(2) * 1e10  # Potential coefficients
        omega = 2 * np.pi * 1e6
        
        V = compute_node_voltages(I, I_source, A, P, omega)
        
        assert len(V) == 2
        assert V.dtype == np.complex128
    
    def test_with_current_sources(self):
        """Test voltage computation with current sources."""
        I = np.array([1.0], dtype=complex)
        I_source = np.array([0.5], dtype=complex)
        A = np.array([[-1]])
        P = np.array([[1e10]])
        omega = 2 * np.pi * 1e6
        
        V = compute_node_voltages(I, I_source, A, P, omega)
        
        assert len(V) == 1
        # Voltage should depend on total current (I + I_source)
        assert V[0] != 0


class TestIntegration:
    """Integration tests for complete system assembly."""
    
    def test_complete_dipole_assembly(self):
        """Test complete assembly for a simple dipole."""
        # Two-segment dipole
        edges = [[1, 2], [2, 3]]
        n_nodes = 3
        
        # Simple matrices
        R = np.eye(2) * 1.0
        L = np.eye(2) * 1e-9
        P = np.eye(3) * 1e10
        
        # Voltage source: 1V at node 3 (feed point)
        vsrc = [VoltageSource(node_start=3, node_end=0, value=1.0)]
        isrc = []
        
        omega = 2 * np.pi * 100e6  # 100 MHz
        
        # Build incidence matrix
        A = build_incidence_matrix(edges, n_nodes, voltage_sources=vsrc)
        
        # Build appended incidence matrix
        A_app, n_app = build_appended_incidence_matrix(vsrc, [], n_edges=2)
        
        # Assemble impedance matrix
        Z = assemble_impedance_matrix(R, L, P, A, omega, voltage_sources=vsrc)
        
        # Assemble system matrix
        S = assemble_system_matrix(Z, A_app)
        
        # Assemble source vector
        source = assemble_source_vector(vsrc, isrc, A, P, omega, n_edges=2, n_appended=n_app)
        
        # Verify shapes are consistent
        assert S.shape[0] == S.shape[1]
        assert S.shape[0] == len(source)
        assert Z.shape == (3, 3)  # 2 edges + 1 voltage source
        
    def test_compare_with_peec_reference_structure(self):
        """Test that assembly follows reference PEEC structure."""
        # Following PEEC: SYSTEM = [Z A_app'; -A_app 0]
        # and Source = [V - (1/jω)A'P*I; I_app]
        
        # Simple case
        R = np.array([[1.0]])
        L = np.array([[1e-9]])
        P = np.array([[1e10]])
        A = np.array([[-1]])
        omega = 2 * np.pi * 1e6
        
        vsrc = [VoltageSource(node_start=-1, node_end=1, value=1.0)]
        isrc = []
        
        A_full = build_incidence_matrix([[1, 0]], n_nodes=1, voltage_sources=vsrc)
        A_app, n_app = build_appended_incidence_matrix(vsrc, [], n_edges=1)
        
        Z = assemble_impedance_matrix(R, L, P, A_full, omega, voltage_sources=vsrc)
        S = assemble_system_matrix(Z, A_app)
        source = assemble_source_vector(vsrc, isrc, A_full, P, omega, n_edges=1, n_appended=n_app)
        
        # Verify PEEC block structure
        n_branches = Z.shape[0]
        assert S[:n_branches, :n_branches].shape == Z.shape
        if n_app > 0:
            assert S[:n_branches, n_branches:].shape == (n_branches, n_app)
            assert S[n_branches:, :n_branches].shape == (n_app, n_branches)
