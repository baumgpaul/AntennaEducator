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
