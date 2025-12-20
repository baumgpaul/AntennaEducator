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
    # Source segment should be assigned (center segment)
    assert element["source"]["segment_id"] == 5


def test_create_dipole_custom_parameters(client):
    """Test creating a dipole with custom parameters."""
    request_data = {
        "length": 2.0,
        "center_position": [1.0, 2.0, 3.0],
        "orientation": [1.0, 0.0, 0.0],
        "wire_radius": 0.002,
        "segments": 11,
    }
    
    response = client.post("/api/v1/antenna/dipole", json=request_data)
    assert response.status_code == 200
    
    data = response.json()
    element = data["element"]
    
    assert element["parameters"]["length"] == 2.0
    assert element["parameters"]["center_position"] == [1.0, 2.0, 3.0]
    assert element["parameters"]["wire_radius"] == 0.002
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
