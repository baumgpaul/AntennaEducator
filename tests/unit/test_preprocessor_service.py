"""Tests for the Preprocessor service."""

import pytest
from fastapi.testclient import TestClient

from backend.preprocessor.main import app


@pytest.fixture
def client():
    """Create a test client for the FastAPI application."""
    return TestClient(app)


def test_health_check(client):
    """Test the health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "preprocessor"
    assert data["version"] == "0.1.0"
    assert "timestamp" in data


def test_get_status(client):
    """Test the status endpoint."""
    response = client.get("/api/v1/status")
    assert response.status_code == 200
    
    data = response.json()
    assert data["service"] == "preprocessor"
    assert data["version"] == "0.1.0"
    assert "endpoints" in data
    assert data["endpoints"]["health"] == "/health"
    assert data["endpoints"]["docs"] == "/api/v1/docs"


def test_create_dipole_basic(client):
    """Test creating a basic dipole antenna."""
    request_data = {
        "length": 1.0,
    }
    
    response = client.post("/api/v1/antenna/dipole", json=request_data)
    assert response.status_code == 200
    
    data = response.json()
    assert "element" in data
    assert "mesh" in data
    assert "message" in data
    
    # Check element
    element = data["element"]
    assert element["type"] == "dipole"
    assert element["parameters"]["length"] == 1.0
    assert element["parameters"]["segments"] == 21
    
    # Check mesh
    mesh = data["mesh"]
    assert len(mesh["nodes"]) == 22  # 21 segments + 1
    assert len(mesh["edges"]) == 21
    assert len(mesh["radii"]) == 21


def test_create_dipole_with_source(client):
    """Test creating a dipole with a voltage source."""
    request_data = {
        "length": 0.5,
        "segments": 11,
        "source": {
            "type": "voltage",
            "amplitude": {"real": 1.0, "imag": 0.0},
        },
        "name": "Test Dipole",
    }
    
    response = client.post("/api/v1/antenna/dipole", json=request_data)
    assert response.status_code == 200
    
    data = response.json()
    element = data["element"]
    
    assert element["name"] == "Test Dipole"
    assert element["source"] is not None
    assert element["source"]["type"] == "voltage"
    # Source between center nodes (11 segments = 12 nodes, center between 6 and 7) - 1-based indexing
    assert element["source"]["node_start"] == 6
    assert element["source"]["node_end"] == 7
    assert element["parameters"]["segments"] == 11


def test_create_dipole_invalid_length(client):
    """Test that invalid length returns error."""
    request_data = {
        "length": -1.0,
    }
    
    response = client.post("/api/v1/antenna/dipole", json=request_data)
    assert response.status_code == 422  # Validation error


def test_create_dipole_zero_length(client):
    """Test that zero length returns error."""
    request_data = {
        "length": 0.0,
    }
    
    response = client.post("/api/v1/antenna/dipole", json=request_data)
    assert response.status_code == 422  # Validation error


def test_create_loop_basic(client):
    """Test creating a basic loop antenna."""
    request_data = {
        "radius": 0.1,
    }
    
    response = client.post("/api/v1/antenna/loop", json=request_data)
    assert response.status_code == 200
    
    data = response.json()
    assert "element" in data
    assert "mesh" in data
    assert "message" in data
    
    # Check element
    element = data["element"]
    assert element["type"] == "loop"
    assert element["parameters"]["radius"] == 0.1
    assert element["parameters"]["segments"] == 36
    
    # Check mesh
    mesh = data["mesh"]
    assert len(mesh["nodes"]) == 36  # Circular loop
    assert len(mesh["edges"]) == 36  # Each segment connects to next
    assert len(mesh["radii"]) == 36


def test_create_loop_with_source(client):
    """Test creating a loop with a voltage source."""
    request_data = {
        "radius": 0.05,
        "segments": 24,
        "source": {
            "type": "voltage",
            "amplitude": {"real": 1.0, "imag": 0.0},
        },
        "name": "Test Loop",
    }

    response = client.post("/api/v1/antenna/loop", json=request_data)
    assert response.status_code == 200

    data = response.json()
    element = data["element"]

    assert element["name"] == "Test Loop"
    assert element["source"] is not None
    assert element["source"]["type"] == "voltage"
    # Source between first and last node (across gap) - 1-based indexing
    assert element["source"]["node_start"] == 1
    assert element["source"]["node_end"] == 25  # 24 segments = 25 nodes
    assert element["parameters"]["segments"] == 24


def test_create_loop_invalid_radius(client):
    """Test that invalid radius returns error."""
    request_data = {
        "radius": -0.1,
    }
    
    response = client.post("/api/v1/antenna/loop", json=request_data)
    assert response.status_code == 422  # Validation error


def test_create_rod_basic(client):
    """Test creating a basic rod antenna."""
    request_data = {
        "length": 0.25,
    }
    
    response = client.post("/api/v1/antenna/rod", json=request_data)
    assert response.status_code == 200
    
    data = response.json()
    assert "element" in data
    assert "mesh" in data
    assert "message" in data
    
    # Check element
    element = data["element"]
    assert element["type"] == "rod"
    assert element["parameters"]["length"] == 0.25
    assert element["parameters"]["segments"] == 21
    
    # Check mesh
    mesh = data["mesh"]
    assert len(mesh["nodes"]) == 22  # 21 segments + 1
    assert len(mesh["edges"]) == 21
    assert len(mesh["radii"]) == 21


def test_create_rod_with_source(client):
    """Test creating a rod with a current source at base."""
    request_data = {
        "length": 0.5,
        "segments": 11,
        "source": {
            "type": "current",
            "amplitude": {"real": 1.0, "imag": 0.0},
            "position": "base",
        },
        "name": "Test Rod",
    }
    
    response = client.post("/api/v1/antenna/rod", json=request_data)
    assert response.status_code == 200
    
    data = response.json()
    element = data["element"]
    
    assert element["name"] == "Test Rod"
    assert element["source"] is not None
    assert element["source"]["type"] == "current"
    # Source between first two nodes (at base)
    assert element["source"]["node_start"] == 0
    assert element["source"]["node_end"] == 1
    assert element["parameters"]["segments"] == 11


def test_create_rod_invalid_length(client):
    """Test that invalid length returns error."""
    request_data = {
        "length": 0.0,
    }
    
    response = client.post("/api/v1/antenna/rod", json=request_data)
    assert response.status_code == 422  # Validation error


def test_create_helix_basic(client):
    """Test creating a basic helix antenna."""
    request_data = {
        "radius": 0.05,
        "pitch": 0.1,
        "turns": 5.0,
    }
    
    response = client.post("/api/v1/antenna/helix", json=request_data)
    assert response.status_code == 200
    
    data = response.json()
    assert "element" in data
    assert "mesh" in data
    assert "message" in data
    
    # Check element
    element = data["element"]
    assert element["type"] == "helix"
    assert element["parameters"]["radius"] == 0.05
    assert element["parameters"]["pitch"] == 0.1
    assert element["parameters"]["turns"] == 5.0
    assert element["parameters"]["segments_per_turn"] == 24
    
    # Check mesh (5 turns * 24 segments/turn = 120 segments)
    mesh = data["mesh"]
    assert len(mesh["nodes"]) == 121  # 120 segments + 1
    assert len(mesh["edges"]) == 120
    assert len(mesh["radii"]) == 120


def test_create_helix_with_source(client):
    """Test creating a helix with a voltage source."""
    request_data = {
        "radius": 0.03,
        "pitch": 0.08,
        "turns": 3.0,
        "segments_per_turn": 16,
        "source": {
            "type": "voltage",
            "amplitude": {"real": 1.0, "imag": 0.0},
            "position": "start",
        },
        "name": "Test Helix",
    }
    
    response = client.post("/api/v1/antenna/helix", json=request_data)
    assert response.status_code == 200
    
    data = response.json()
    element = data["element"]
    
    assert element["name"] == "Test Helix"
    assert element["source"] is not None
    assert element["source"]["type"] == "voltage"
    # Source between first two nodes
    assert element["source"]["node_start"] == 0
    assert element["source"]["node_end"] == 1
    assert element["parameters"]["axis"] == [0.0, 0.0, 1.0]
    assert element["parameters"]["wire_radius"] == 0.001
    assert element["parameters"]["segments_per_turn"] == 16
    
    # Check mesh (3 turns * 16 segments/turn = 48 segments)
    mesh = data["mesh"]
    assert len(mesh["nodes"]) == 49  # 48 segments + 1
    assert len(mesh["edges"]) == 48


def test_create_helix_invalid_radius(client):
    """Test that invalid radius returns error."""
    request_data = {
        "radius": -0.05,
        "pitch": 0.1,
        "turns": 5.0,
    }
    
    response = client.post("/api/v1/antenna/helix", json=request_data)
    assert response.status_code == 422  # Validation error


def test_create_helix_invalid_pitch(client):
    """Test that invalid pitch returns error."""
    request_data = {
        "radius": 0.05,
        "pitch": 0.0,
        "turns": 5.0,
    }
    
    response = client.post("/api/v1/antenna/helix", json=request_data)
    assert response.status_code == 422  # Validation error
