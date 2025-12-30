"""Tests for project elements endpoints."""

import pytest
import json


class TestAddElement:
    """Test adding elements to projects."""
    
    def test_add_element_success(self, client, auth_headers, test_project):
        """Test successfully adding an element to a project."""
        element_config = {
            "type": "dipole",
            "length": 1.5,
            "frequency": 100e6,
            "position": [0, 0, 0]
        }
        
        response = client.post(
            f"/api/v1/projects/{test_project.id}/elements",
            headers=auth_headers,
            json={
                "element_name": "dipole",
                "config_json": json.dumps(element_config)
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["element_name"] == "dipole"
        assert data["project_id"] == test_project.id
        assert "id" in data
        assert "created_at" in data
        
        # Verify config is valid JSON
        config = json.loads(data["config_json"])
        assert config["type"] == "dipole"
        assert config["length"] == 1.5
    
    def test_add_multiple_elements(self, client, auth_headers, test_project):
        """Test adding multiple elements to a project."""
        # Add first element
        response1 = client.post(
            f"/api/v1/projects/{test_project.id}/elements",
            headers=auth_headers,
            json={
                "element_name": "dipole",
                "config_json": '{"length": 1.0}'
            }
        )
        assert response1.status_code == 201
        
        # Add second element
        response2 = client.post(
            f"/api/v1/projects/{test_project.id}/elements",
            headers=auth_headers,
            json={
                "element_name": "loop",
                "config_json": '{"radius": 0.5}'
            }
        )
        assert response2.status_code == 201
        
        # Verify both elements exist
        response = client.get(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        elements = response.json()["elements"]
        assert len(elements) == 2
    
    def test_add_element_different_types(self, client, auth_headers, test_project):
        """Test adding elements of different types."""
        element_types = ["dipole", "loop", "helix", "source", "load", "lumped"]
        
        for element_type in element_types:
            response = client.post(
                f"/api/v1/projects/{test_project.id}/elements",
                headers=auth_headers,
                json={
                    "element_name": element_type,
                    "config_json": f'{{"type": "{element_type}"}}'
                }
            )
            assert response.status_code == 201
            assert response.json()["element_name"] == element_type
    
    def test_add_element_project_not_found(self, client, auth_headers):
        """Test adding element to non-existent project fails."""
        response = client.post(
            "/api/v1/projects/99999/elements",
            headers=auth_headers,
            json={
                "element_name": "dipole",
                "config_json": "{}"
            }
        )
        assert response.status_code == 404
    
    def test_add_element_other_user_project(self, client, auth_headers2, test_project):
        """Test that user cannot add element to another user's project."""
        response = client.post(
            f"/api/v1/projects/{test_project.id}/elements",
            headers=auth_headers2,
            json={
                "element_name": "dipole",
                "config_json": "{}"
            }
        )
        assert response.status_code == 404
    
    def test_add_element_unauthorized(self, client, test_project):
        """Test adding element without authentication fails."""
        response = client.post(
            f"/api/v1/projects/{test_project.id}/elements",
            json={
                "element_name": "dipole",
                "config_json": "{}"
            }
        )
        assert response.status_code == 401


class TestDeleteElement:
    """Test deleting elements from projects."""
    
    def test_delete_element_success(self, client, auth_headers, test_project, test_element):
        """Test successfully deleting an element."""
        response = client.delete(
            f"/api/v1/projects/{test_project.id}/elements/{test_element.id}",
            headers=auth_headers
        )
        assert response.status_code == 204
        
        # Verify element is deleted
        response = client.get(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        assert len(response.json()["elements"]) == 0
    
    def test_delete_element_not_found(self, client, auth_headers, test_project):
        """Test deleting non-existent element fails."""
        response = client.delete(
            f"/api/v1/projects/{test_project.id}/elements/99999",
            headers=auth_headers
        )
        assert response.status_code == 404
    
    def test_delete_element_project_not_found(self, client, auth_headers, test_element):
        """Test deleting element from non-existent project fails."""
        response = client.delete(
            f"/api/v1/projects/99999/elements/{test_element.id}",
            headers=auth_headers
        )
        assert response.status_code == 404
    
    def test_delete_element_other_user_project(self, client, auth_headers2, test_project, test_element):
        """Test that user cannot delete element from another user's project."""
        response = client.delete(
            f"/api/v1/projects/{test_project.id}/elements/{test_element.id}",
            headers=auth_headers2
        )
        assert response.status_code == 404
    
    def test_delete_element_unauthorized(self, client, test_project, test_element):
        """Test deleting element without authentication fails."""
        response = client.delete(
            f"/api/v1/projects/{test_project.id}/elements/{test_element.id}"
        )
        assert response.status_code == 401
    
    def test_delete_one_of_many_elements(self, client, auth_headers, test_project, db_session):
        """Test deleting one element leaves others intact."""
        from models import ProjectElement
        
        # Create multiple elements
        elements = []
        for i in range(3):
            element = ProjectElement(
                project_id=test_project.id,
                element_name=f"type_{i}",
                config_json=f'{{"index": {i}}}'
            )
            db_session.add(element)
            elements.append(element)
        db_session.commit()
        
        # Delete the middle element
        response = client.delete(
            f"/api/v1/projects/{test_project.id}/elements/{elements[1].id}",
            headers=auth_headers
        )
        assert response.status_code == 204
        
        # Verify only 2 elements remain
        response = client.get(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        remaining = response.json()["elements"]
        assert len(remaining) == 2
        assert elements[1].id not in [e["id"] for e in remaining]


class TestElementConfiguration:
    """Test element configuration validation and storage."""
    
    def test_element_complex_config(self, client, auth_headers, test_project):
        """Test storing complex element configuration."""
        complex_config = {
            "type": "helix",
            "turns": 10,
            "pitch": 0.05,
            "radius": 0.02,
            "wire_radius": 0.001,
            "position": [0, 0, 1.0],
            "orientation": [0, 0, 1],
            "handedness": "RHCP",
            "feed_position": "bottom"
        }
        
        response = client.post(
            f"/api/v1/projects/{test_project.id}/elements",
            headers=auth_headers,
            json={
                "element_name": "helix",
                "config_json": json.dumps(complex_config)
            }
        )
        assert response.status_code == 201
        
        # Retrieve and verify
        retrieved_config = json.loads(response.json()["config_json"])
        assert retrieved_config == complex_config
    
    def test_element_with_array_data(self, client, auth_headers, test_project):
        """Test storing element with array data."""
        config_with_arrays = {
            "type": "wire",
            "points": [
                [0, 0, 0],
                [0.5, 0, 0],
                [0.5, 0.5, 0],
                [1, 0.5, 0]
            ],
            "radii": [0.001, 0.001, 0.001, 0.001]
        }
        
        response = client.post(
            f"/api/v1/projects/{test_project.id}/elements",
            headers=auth_headers,
            json={
                "element_name": "wire",
                "config_json": json.dumps(config_with_arrays)
            }
        )
        assert response.status_code == 201
        
        # Verify arrays are preserved
        retrieved_config = json.loads(response.json()["config_json"])
        assert retrieved_config["points"] == config_with_arrays["points"]
