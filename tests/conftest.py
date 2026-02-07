"""
Shared test fixtures and configuration.
"""

import pytest
import numpy as np
from backend.common.models.geometry import AntennaElement, Mesh, Source


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
        sources=[Source(
            type="voltage",
            amplitude=complex(1.0, 0.0)
        )]
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
        sources=[Source(
            type="current",
            amplitude=complex(1.0, 0.0)
        )]
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
