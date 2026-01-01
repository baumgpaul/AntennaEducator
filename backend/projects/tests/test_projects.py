"""Tests for project CRUD endpoints."""

import pytest


class TestCreateProject:
    """Test project creation."""
    
    def test_create_project_success(self, client, auth_headers):
        """Test successful project creation."""
        response = client.post(
            "/api/v1/projects",
            headers=auth_headers,
            json={
                "name": "My Antenna Design",
                "description": "Testing a dipole antenna"
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "My Antenna Design"
        assert data["description"] == "Testing a dipole antenna"
        assert "id" in data
        assert "user_id" in data
        assert "created_at" in data
        assert "updated_at" in data
        assert data["elements"] == []
        assert data["results"] == []
    
    def test_create_project_without_description(self, client, auth_headers):
        """Test creating project without description."""
        response = client.post(
            "/api/v1/projects",
            headers=auth_headers,
            json={"name": "Simple Project"}
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Simple Project"
        assert data["description"] is None
    
    def test_create_project_unauthorized(self, client):
        """Test creating project without authentication fails."""
        response = client.post(
            "/api/v1/projects",
            json={"name": "Unauthorized Project"}
        )
        assert response.status_code == 401
    
    def test_create_project_invalid_name_too_short(self, client, auth_headers):
        """Test creating project with name too short fails."""
        response = client.post(
            "/api/v1/projects",
            headers=auth_headers,
            json={"name": "ab"}  # Less than 3 characters
        )
        assert response.status_code == 422
    
    def test_create_project_invalid_name_too_long(self, client, auth_headers):
        """Test creating project with name too long fails."""
        response = client.post(
            "/api/v1/projects",
            headers=auth_headers,
            json={"name": "a" * 101}  # More than 100 characters
        )
        assert response.status_code == 422
    
    def test_create_project_description_too_long(self, client, auth_headers):
        """Test creating project with description too long fails."""
        response = client.post(
            "/api/v1/projects",
            headers=auth_headers,
            json={
                "name": "Valid Name",
                "description": "x" * 50001  # More than 50000 characters (new limit for JSON storage)
            }
        )
        assert response.status_code == 422


class TestListProjects:
    """Test listing projects."""
    
    def test_list_projects_empty(self, client, auth_headers):
        """Test listing projects when user has none."""
        response = client.get("/api/v1/projects", headers=auth_headers)
        assert response.status_code == 200
        assert response.json() == []
    
    def test_list_projects_with_data(self, client, auth_headers, test_project):
        """Test listing projects with existing projects."""
        response = client.get("/api/v1/projects", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == test_project.name
        assert "elements" not in data[0]  # List response doesn't include elements
        assert "results" not in data[0]  # List response doesn't include results
    
    def test_list_projects_only_own(self, client, auth_headers, auth_headers2, test_project, test_user2, db_session):
        """Test that users only see their own projects."""
        # Create project for user 2
        from backend.projects.models import Project
        project2 = Project(
            user_id=test_user2.id,
            name="User 2's Project",
            description="Belongs to another user"
        )
        db_session.add(project2)
        db_session.commit()
        
        # User 1 should only see their project
        response = client.get("/api/v1/projects", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == test_project.name
        
        # User 2 should only see their project
        response = client.get("/api/v1/projects", headers=auth_headers2)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "User 2's Project"
    
    def test_list_projects_unauthorized(self, client):
        """Test listing projects without authentication fails."""
        response = client.get("/api/v1/projects")
        assert response.status_code == 401


class TestGetProject:
    """Test getting a specific project."""
    
    def test_get_project_success(self, client, auth_headers, test_project, test_element):
        """Test getting project with elements."""
        response = client.get(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == test_project.id
        assert data["name"] == test_project.name
        assert len(data["elements"]) == 1
        assert data["elements"][0]["element_name"] == "dipole"
    
    def test_get_project_not_found(self, client, auth_headers):
        """Test getting non-existent project fails."""
        response = client.get(
            "/api/v1/projects/99999",
            headers=auth_headers
        )
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()
    
    def test_get_project_unauthorized(self, client):
        """Test getting project without authentication fails."""
        response = client.get("/api/v1/projects/1")
        assert response.status_code == 401
    
    def test_get_project_other_user(self, client, auth_headers2, test_project):
        """Test that user cannot access another user's project."""
        response = client.get(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers2
        )
        assert response.status_code == 404


class TestUpdateProject:
    """Test updating a project."""
    
    def test_update_project_name(self, client, auth_headers, test_project):
        """Test updating project name."""
        response = client.put(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers,
            json={"name": "Updated Project Name"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Project Name"
        assert data["description"] == test_project.description
    
    def test_update_project_description(self, client, auth_headers, test_project):
        """Test updating project description."""
        response = client.put(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers,
            json={"description": "New description"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == test_project.name
        assert data["description"] == "New description"
    
    def test_update_project_both_fields(self, client, auth_headers, test_project):
        """Test updating both name and description."""
        response = client.put(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers,
            json={
                "name": "New Name",
                "description": "New description"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "New Name"
        assert data["description"] == "New description"
    
    def test_update_project_not_found(self, client, auth_headers):
        """Test updating non-existent project fails."""
        response = client.put(
            "/api/v1/projects/99999",
            headers=auth_headers,
            json={"name": "Does Not Matter"}
        )
        assert response.status_code == 404
    
    def test_update_project_other_user(self, client, auth_headers2, test_project):
        """Test that user cannot update another user's project."""
        response = client.put(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers2,
            json={"name": "Hacked Name"}
        )
        assert response.status_code == 404
    
    def test_update_project_unauthorized(self, client, test_project):
        """Test updating project without authentication fails."""
        response = client.put(
            f"/api/v1/projects/{test_project.id}",
            json={"name": "Unauthorized Update"}
        )
        assert response.status_code == 401


class TestDeleteProject:
    """Test deleting a project."""
    
    def test_delete_project_success(self, client, auth_headers, test_project):
        """Test successful project deletion."""
        response = client.delete(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers
        )
        assert response.status_code == 204
        
        # Verify project is deleted
        response = client.get(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers
        )
        assert response.status_code == 404
    
    def test_delete_project_with_elements(self, client, auth_headers, test_project, test_element):
        """Test deleting project also deletes its elements (cascade)."""
        response = client.delete(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers
        )
        assert response.status_code == 204
        
        # Verify project and elements are deleted
        response = client.get(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers
        )
        assert response.status_code == 404
    
    def test_delete_project_not_found(self, client, auth_headers):
        """Test deleting non-existent project fails."""
        response = client.delete(
            "/api/v1/projects/99999",
            headers=auth_headers
        )
        assert response.status_code == 404
    
    def test_delete_project_other_user(self, client, auth_headers2, test_project):
        """Test that user cannot delete another user's project."""
        response = client.delete(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers2
        )
        assert response.status_code == 404
    
    def test_delete_project_unauthorized(self, client, test_project):
        """Test deleting project without authentication fails."""
        response = client.delete(f"/api/v1/projects/{test_project.id}")
        assert response.status_code == 401
