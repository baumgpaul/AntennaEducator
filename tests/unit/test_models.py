"""
Tests for data models.
"""

import pytest
from uuid import UUID
from backend.common.models.geometry import Source, AntennaElement, Mesh, Geometry
from backend.common.models.project import Project, ProjectStatus
from backend.common.models.solver import SolverJob, SolverConfig, FrequencyConfig, SolverJobType


def test_source_model():
    """Test Source model creation."""
    source = Source(
        type="voltage",
        amplitude=complex(1.0, 0.5)
    )
    assert source.type == "voltage"
    assert source.amplitude == complex(1.0, 0.5)
    assert source.segment_id is None


def test_antenna_element_model(sample_dipole_element):
    """Test AntennaElement model."""
    element = sample_dipole_element
    
    assert element.name == "Test Dipole"
    assert element.type == "dipole"
    assert "length" in element.parameters
    assert element.source is not None
    assert element.source.type == "voltage"
    assert isinstance(element.id, UUID)


def test_mesh_model(sample_mesh):
    """Test Mesh model."""
    mesh = sample_mesh
    
    assert mesh.num_nodes == 6
    assert mesh.num_edges == 5
    assert len(mesh.radii) == 5
    assert 2 in mesh.source_edges
    
    # Test to_numpy conversion
    nodes, edges, radii = mesh.to_numpy()
    assert nodes.shape == (6, 3)
    assert edges.shape == (5, 2)
    assert radii.shape == (5,)


def test_mesh_validation():
    """Test Mesh validation."""
    # Invalid nodes (not 3D)
    with pytest.raises(ValueError, match="3D coordinates"):
        Mesh(
            nodes=[[0, 0], [1, 1]],
            edges=[[0, 1]],
            radii=[0.001]
        )
    
    # Invalid edges (not pairs)
    with pytest.raises(ValueError, match="pairs"):
        Mesh(
            nodes=[[0, 0, 0], [1, 1, 1]],
            edges=[[0, 1, 2]],
            radii=[0.001]
        )


def test_geometry_model(sample_geometry):
    """Test Geometry model."""
    geometry = sample_geometry
    
    assert geometry.is_meshed
    assert geometry.num_elements == 1
    assert isinstance(geometry.project_id, UUID)
    
    # Test element retrieval
    element = geometry.get_element(geometry.elements[0].id)
    assert element is not None
    assert element.name == "Test Dipole"


def test_geometry_add_remove_element(sample_geometry, sample_loop_element):
    """Test adding and removing elements from geometry."""
    geometry = sample_geometry
    
    # Initially meshed
    assert geometry.is_meshed
    
    # Add element - should invalidate mesh
    geometry.add_element(sample_loop_element)
    assert geometry.num_elements == 2
    assert not geometry.is_meshed  # Mesh should be invalidated
    
    # Remove element
    success = geometry.remove_element(sample_loop_element.id)
    assert success
    assert geometry.num_elements == 1


def test_project_model(sample_project):
    """Test Project model."""
    project = sample_project
    
    assert project.name == "Test Project"
    assert project.status == ProjectStatus.DRAFT
    assert isinstance(project.id, UUID)
    
    # Test status update
    project.update_status(ProjectStatus.MESHED)
    assert project.status == ProjectStatus.MESHED


def test_solver_config_model(sample_solver_config):
    """Test SolverConfig model."""
    config = sample_solver_config
    
    assert config.method == "direct"
    assert config.tolerance == 1e-6
    assert config.max_iterations == 1000


def test_frequency_config_single():
    """Test FrequencyConfig for single frequency."""
    config = FrequencyConfig(frequency=1e9)
    
    assert config.frequency == 1e9
    assert config.frequency_start is None
    assert config.frequency_stop is None


def test_frequency_config_sweep():
    """Test FrequencyConfig for frequency sweep."""
    config = FrequencyConfig(
        frequency_start=500e6,
        frequency_stop=1500e6,
        num_points=11,
        scale="linear"
    )
    
    assert config.frequency_start == 500e6
    assert config.frequency_stop == 1500e6
    assert config.num_points == 11


def test_frequency_config_validation():
    """Test FrequencyConfig validation."""
    # Invalid: stop < start
    with pytest.raises(ValueError, match="must be greater than"):
        FrequencyConfig(
            frequency_start=1500e6,
            frequency_stop=500e6,
            num_points=10
        )


def test_solver_job_model(sample_solver_job):
    """Test SolverJob model."""
    job = sample_solver_job
    
    assert job.type == SolverJobType.SINGLE_FREQUENCY
    assert job.status == "queued"
    assert job.progress == 0.0
    
    # Test job lifecycle
    job.start()
    assert job.status == "running"
    assert job.started_at is not None
    
    job.complete("s3://bucket/results.npz")
    assert job.status == "completed"
    assert job.progress == 1.0
    assert job.result_location == "s3://bucket/results.npz"


def test_solver_job_failure(sample_solver_job):
    """Test SolverJob failure handling."""
    job = sample_solver_job
    
    job.start()
    job.fail("Matrix is singular")
    
    assert job.status == "failed"
    assert job.error_message == "Matrix is singular"
    assert job.completed_at is not None
