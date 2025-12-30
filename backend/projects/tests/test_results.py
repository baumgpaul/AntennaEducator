"""Tests for simulation results endpoints."""

import pytest


class TestSaveResult:
    """Test saving simulation results."""
    
    def test_save_result_success(self, client, auth_headers, test_project):
        """Test successfully saving a simulation result."""
        response = client.post(
            f"/api/v1/projects/{test_project.id}/results",
            headers=auth_headers,
            json={
                "frequency": 100e6,
                "currents_s3_key": "projects/123/currents_100MHz.json",
                "mesh_s3_key": "projects/123/mesh.json"
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["frequency"] == 100e6
        assert data["project_id"] == test_project.id
        assert "id" in data
        assert "created_at" in data
    
    def test_save_result_minimal(self, client, auth_headers, test_project):
        """Test saving result with only required fields."""
        response = client.post(
            f"/api/v1/projects/{test_project.id}/results",
            headers=auth_headers,
            json={"frequency": 50e6}
        )
        assert response.status_code == 201
        data = response.json()
        assert data["frequency"] == 50e6
        assert data["currents_s3_key"] is None
    
    def test_save_multiple_results(self, client, auth_headers, test_project):
        """Test saving multiple results for frequency sweep."""
        frequencies = [50e6, 75e6, 100e6, 125e6, 150e6]
        
        for freq in frequencies:
            response = client.post(
                f"/api/v1/projects/{test_project.id}/results",
                headers=auth_headers,
                json={"frequency": freq}
            )
            assert response.status_code == 201
        
        # Verify all results saved
        response = client.get(
            f"/api/v1/projects/{test_project.id}/results",
            headers=auth_headers
        )
        assert response.status_code == 200
        assert len(response.json()) == 5
    
    def test_save_result_project_not_found(self, client, auth_headers):
        """Test saving result to non-existent project fails."""
        response = client.post(
            "/api/v1/projects/99999/results",
            headers=auth_headers,
            json={"frequency": 100e6}
        )
        assert response.status_code == 404
    
    def test_save_result_other_user_project(self, client, auth_headers2, test_project):
        """Test that user cannot save result to another user's project."""
        response = client.post(
            f"/api/v1/projects/{test_project.id}/results",
            headers=auth_headers2,
            json={"frequency": 100e6}
        )
        assert response.status_code == 404
    
    def test_save_result_unauthorized(self, client, test_project):
        """Test saving result without authentication fails."""
        response = client.post(
            f"/api/v1/projects/{test_project.id}/results",
            json={"frequency": 100e6}
        )
        assert response.status_code == 401


class TestListResults:
    """Test listing simulation results."""
    
    def test_list_results_empty(self, client, auth_headers, test_project):
        """Test listing results when project has none."""
        response = client.get(
            f"/api/v1/projects/{test_project.id}/results",
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json() == []
    
    def test_list_results_with_data(self, client, auth_headers, test_project, test_result):
        """Test listing results with existing data."""
        response = client.get(
            f"/api/v1/projects/{test_project.id}/results",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["frequency"] == test_result.frequency
    
    def test_list_results_multiple(self, client, auth_headers, test_project, db_session):
        """Test listing multiple results."""
        from models import Result
        
        # Create multiple results
        frequencies = [50e6, 100e6, 150e6]
        for freq in frequencies:
            result = Result(
                project_id=test_project.id,
                frequency=freq
            )
            db_session.add(result)
        db_session.commit()
        
        response = client.get(
            f"/api/v1/projects/{test_project.id}/results",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3
        result_frequencies = [r["frequency"] for r in data]
        assert set(result_frequencies) == set(frequencies)
    
    def test_list_results_project_not_found(self, client, auth_headers):
        """Test listing results for non-existent project fails."""
        response = client.get(
            "/api/v1/projects/99999/results",
            headers=auth_headers
        )
        assert response.status_code == 404
    
    def test_list_results_other_user_project(self, client, auth_headers2, test_project):
        """Test that user cannot list results from another user's project."""
        response = client.get(
            f"/api/v1/projects/{test_project.id}/results",
            headers=auth_headers2
        )
        assert response.status_code == 404
    
    def test_list_results_unauthorized(self, client, test_project):
        """Test listing results without authentication fails."""
        response = client.get(f"/api/v1/projects/{test_project.id}/results")
        assert response.status_code == 401


class TestResultsIntegration:
    """Test complete workflow with results."""
    
    def test_full_simulation_workflow(self, client, auth_headers, test_project, test_element):
        """Test complete workflow: create project, add elements, save results."""
        # Project and element already created by fixtures
        
        # Run simulation (mock - just save results)
        response = client.post(
            f"/api/v1/projects/{test_project.id}/results",
            headers=auth_headers,
            json={
                "frequency": 100e6,
                "currents_s3_key": f"projects/{test_project.id}/currents.json"
            }
        )
        assert response.status_code == 201
        
        # Retrieve project with all data
        response = client.get(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["elements"]) == 1
        assert len(data["results"]) == 1
        assert data["results"][0]["frequency"] == 100e6
    
    def test_delete_project_cascades_results(self, client, auth_headers, test_project, test_result):
        """Test that deleting a project also deletes its results."""
        # Verify result exists
        response = client.get(
            f"/api/v1/projects/{test_project.id}/results",
            headers=auth_headers
        )
        assert len(response.json()) == 1
        
        # Delete project
        response = client.delete(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers
        )
        assert response.status_code == 204
        
        # Verify project and results are gone
        response = client.get(
            f"/api/v1/projects/{test_project.id}",
            headers=auth_headers
        )
        assert response.status_code == 404
