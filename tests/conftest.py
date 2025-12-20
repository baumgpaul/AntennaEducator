"""
Shared test fixtures and configuration.
"""

import pytest
import numpy as np
from uuid import uuid4
from backend.common.models.geometry import Geometry, AntennaElement, Mesh, Source
from backend.common.models.project import Project, ProjectStatus
from backend.common.models.solver import SolverJob, SolverConfig, FrequencyConfig, SolverJobType


@pytest.fixture
def sample_dipole_element():
    """Create a sample dipole antenna element."""
    return AntennaElement(
        name="Test Dipole",
        type="dipole",
        parameters={
            "length": 0.5,
            "center": [0.0, 0.0, 0.0],
            "orientation": [0.0, 0.0, 1.0],
            "radius": 0.001,
            "segments": 10
        },
        source=Source(
            type="voltage",
            amplitude=complex(1.0, 0.0)
        )
    )


@pytest.fixture
def sample_loop_element():
    """Create a sample loop antenna element."""
    return AntennaElement(
        name="Test Loop",
        type="loop",
        parameters={
            "radius": 0.1,
            "center": [0.0, 0.0, 0.0],
            "normal": [0.0, 0.0, 1.0],
            "wire_radius": 0.001,
            "segments": 20
        },
        source=Source(
            type="current",
            amplitude=complex(1.0, 0.0)
        )
    )


@pytest.fixture
def sample_mesh():
    """Create a sample mesh with a simple wire."""
    nodes = [
        [0.0, 0.0, -0.25],
        [0.0, 0.0, -0.15],
        [0.0, 0.0, -0.05],
        [0.0, 0.0, 0.05],
        [0.0, 0.0, 0.15],
        [0.0, 0.0, 0.25],
    ]
    edges = [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
    ]
    radii = [0.001] * 5
    
    return Mesh(
        nodes=nodes,
        edges=edges,
        radii=radii,
        source_edges=[2]  # Middle segment
    )


@pytest.fixture
def sample_geometry(sample_dipole_element, sample_mesh):
    """Create a sample geometry with element and mesh."""
    project_id = uuid4()
    geometry = Geometry(
        project_id=project_id,
        elements=[sample_dipole_element]
    )
    geometry.mesh = sample_mesh
    return geometry


@pytest.fixture
def sample_project():
    """Create a sample project."""
    return Project(
        name="Test Project",
        description="A test project for antenna simulation",
        status=ProjectStatus.DRAFT
    )


@pytest.fixture
def sample_solver_config():
    """Create a sample solver configuration."""
    return SolverConfig(
        method="direct",
        tolerance=1e-6,
        max_iterations=1000
    )


@pytest.fixture
def sample_frequency_config():
    """Create a sample frequency configuration (single frequency)."""
    return FrequencyConfig(
        frequency=1e9  # 1 GHz
    )


@pytest.fixture
def sample_frequency_sweep_config():
    """Create a sample frequency sweep configuration."""
    return FrequencyConfig(
        frequency_start=500e6,  # 500 MHz
        frequency_stop=1500e6,  # 1.5 GHz
        num_points=11,
        scale="linear"
    )


@pytest.fixture
def sample_solver_job(sample_project, sample_frequency_config, sample_solver_config):
    """Create a sample solver job."""
    return SolverJob(
        project_id=sample_project.id,
        type=SolverJobType.SINGLE_FREQUENCY,
        frequency_config=sample_frequency_config,
        solver_config=sample_solver_config
    )


# NumPy test utilities

@pytest.fixture
def simple_dipole_nodes():
    """Simple dipole node coordinates."""
    return np.array([
        [0.0, 0.0, -0.25],
        [0.0, 0.0, 0.0],
        [0.0, 0.0, 0.25],
    ])


@pytest.fixture
def simple_dipole_edges():
    """Simple dipole edge connectivity."""
    return np.array([
        [0, 1],
        [1, 2],
    ])


@pytest.fixture
def simple_dipole_radii():
    """Simple dipole wire radii."""
    return np.array([0.001, 0.001])


# Helper functions for tests

def assert_vectors_close(v1, v2, rtol=1e-9, atol=1e-12):
    """Assert that two vectors are close."""
    np.testing.assert_allclose(v1, v2, rtol=rtol, atol=atol)


def assert_complex_close(z1, z2, rtol=1e-9, atol=1e-12):
    """Assert that two complex numbers are close."""
    assert abs(z1 - z2) < atol + rtol * abs(z2)
