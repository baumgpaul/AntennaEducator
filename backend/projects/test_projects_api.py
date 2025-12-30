"""
Tests for Projects API endpoints.

Run with: pytest backend/projects/test_projects_api.py -v
"""

import pytest
import os
import sys
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from backend.projects.main import app
from backend.projects.database import Base, get_db
from backend.projects.models import User, Project

# Test database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_projects.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base.metadata.create_all(bind=engine)


def override_get_db():
    """Override the database dependency for testing."""
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_and_cleanup():
    """Create tables before test, drop after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


class TestProjectsAPI:
    """Test suite for Projects API endpoints."""

    def test_health_check(self):
        """Test health endpoint."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "healthy", "service": "projects"}

    def test_create_project(self):
        """Test creating a new project."""
        payload = {
            "name": "Test Dipole",
            "description": "Testing dipole antenna design"
        }
        response = client.post("/api/v1/projects", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test Dipole"
        assert data["description"] == "Testing dipole antenna design"
        assert "id" in data
        assert "created_at" in data
        assert "updated_at" in data

    def test_create_project_minimal(self):
        """Test creating a project with only name."""
        payload = {"name": "Minimal Project"}
        response = client.post("/api/v1/projects", json=payload)
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Minimal Project"
        assert data.get("description") is None or data.get("description") == ""

    def test_list_projects(self):
        """Test retrieving all projects."""
        # Create test projects
        for i in range(3):
            payload = {"name": f"Project {i}", "description": f"Description {i}"}
            client.post("/api/v1/projects", json=payload)

        response = client.get("/api/v1/projects")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3
        assert data[0]["name"] == "Project 0"

    def test_get_project(self):
        """Test retrieving a single project."""
        # Create a project
        create_response = client.post(
            "/api/v1/projects",
            json={"name": "Single Project", "description": "Test single retrieval"}
        )
        project_id = create_response.json()["id"]

        # Retrieve it
        response = client.get(f"/api/v1/projects/{project_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == project_id
        assert data["name"] == "Single Project"

    def test_get_project_not_found(self):
        """Test retrieving non-existent project."""
        response = client.get("/api/v1/projects/9999")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_update_project(self):
        """Test updating a project."""
        # Create a project
        create_response = client.post(
            "/api/v1/projects",
            json={"name": "Original Name", "description": "Original"}
        )
        project_id = create_response.json()["id"]

        # Update it
        update_payload = {
            "name": "Updated Name",
            "description": "Updated description"
        }
        response = client.put(f"/api/v1/projects/{project_id}", json=update_payload)
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["description"] == "Updated description"

    def test_update_project_partial(self):
        """Test partial update of a project."""
        # Create a project
        create_response = client.post(
            "/api/v1/projects",
            json={"name": "Original", "description": "Keep this"}
        )
        project_id = create_response.json()["id"]

        # Update only name
        response = client.put(
            f"/api/v1/projects/{project_id}",
            json={"name": "Updated Name Only"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Name Only"
        assert data["description"] == "Keep this"

    def test_delete_project(self):
        """Test deleting a project."""
        # Create a project
        create_response = client.post(
            "/api/v1/projects",
            json={"name": "To Delete"}
        )
        project_id = create_response.json()["id"]

        # Delete it
        response = client.delete(f"/api/v1/projects/{project_id}")
        assert response.status_code == 204

        # Verify it's gone
        get_response = client.get(f"/api/v1/projects/{project_id}")
        assert get_response.status_code == 404

    def test_delete_project_not_found(self):
        """Test deleting non-existent project."""
        response = client.delete("/api/v1/projects/9999")
        assert response.status_code == 404

    def test_duplicate_project(self):
        """Test duplicating a project."""
        # Create original project
        create_response = client.post(
            "/api/v1/projects",
            json={"name": "Original Antenna", "description": "Original design"}
        )
        original_id = create_response.json()["id"]

        # Duplicate it
        response = client.post(f"/api/v1/projects/{original_id}/duplicate")
        assert response.status_code == 201
        duplicate_data = response.json()
        
        assert "copy" in duplicate_data["name"].lower() or duplicate_data["name"] != "Original Antenna"
        assert duplicate_data["description"] == "Original design"
        assert duplicate_data["id"] != original_id

    def test_cors_preflight(self):
        """Test CORS preflight request."""
        response = client.options(
            "/api/v1/projects",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type"
            }
        )
        assert response.status_code == 200
        assert "access-control-allow-origin" in response.headers

    def test_create_multiple_projects(self):
        """Test creating multiple projects."""
        names = ["Dipole", "Loop", "Helix", "Patch", "Yagi"]
        created_ids = []

        for name in names:
            response = client.post(
                "/api/v1/projects",
                json={"name": name, "description": f"{name} antenna"}
            )
            assert response.status_code == 201
            created_ids.append(response.json()["id"])

        # Verify all were created
        list_response = client.get("/api/v1/projects")
        assert list_response.status_code == 200
        assert len(list_response.json()) == len(names)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
