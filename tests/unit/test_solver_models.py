"""Tests for solver data models."""

import pytest
from backend.solver.models import SolverRequest, SolverResult, MatrixInfo


class TestSolverRequest:
    """Test SolverRequest model."""
    
    def test_create_basic_request(self):
        """Test creating a basic solver request."""
        request = SolverRequest(
            project_id="test-project",
            frequency=1e9,
            nodes=[[0, 0, 0], [0, 0, 1]],
            edges=[[0, 1]],
            radii=[0.001],
            source_node_start=1,
            source_node_end=2,
            source_type="voltage",
            source_amplitude=complex(1.0, 0.0)
        )
        
        assert request.project_id == "test-project"
        assert request.frequency == 1e9
        assert len(request.nodes) == 2
        assert len(request.edges) == 1
        assert request.source_node_start == 1
        assert request.source_type == "voltage"
    
    def test_invalid_frequency(self):
        """Test that negative frequency is rejected."""
        with pytest.raises(ValueError):
            SolverRequest(
                project_id="test",
                frequency=-1.0,
                nodes=[[0, 0, 0]],
                edges=[[0, 1]],
                radii=[0.001],
                source_node_start=1,
                source_node_end=2,
                source_type="voltage",
                source_amplitude=1.0+0j
            )


class TestSolverResult:
    """Test SolverResult model."""
    
    def test_create_basic_result(self):
        """Test creating a basic solver result."""
        result = SolverResult(
            project_id="test-project",
            frequency=1e9,
            branch_currents=[complex(1.0, 0.5)],
            converged=True
        )
        
        assert result.project_id == "test-project"
        assert result.frequency == 1e9
        assert len(result.branch_currents) == 1
        assert result.converged is True
    
    def test_result_with_impedance(self):
        """Test result with input impedance."""
        result = SolverResult(
            project_id="test",
            frequency=1e9,
            branch_currents=[complex(0.01, 0.0)],
            input_impedance=complex(50.0, 0.0),
            input_power=0.5,
            converged=True,
            iterations=10,
            residual=1e-8
        )
        
        assert result.input_impedance == 50.0+0j
        assert result.input_power == 0.5
        assert result.iterations == 10


class TestMatrixInfo:
    """Test MatrixInfo model."""
    
    def test_create_matrix_info(self):
        """Test creating matrix info."""
        info = MatrixInfo(
            num_edges=10,
            num_nodes=11,
            L_matrix_shape=(10, 10),
            P_matrix_shape=(10, 11),
            L_condition_number=1.5e3
        )
        
        assert info.num_edges == 10
        assert info.num_nodes == 11
        assert info.L_matrix_shape == (10, 10)
        assert info.L_condition_number == 1.5e3
