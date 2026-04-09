"""Tests for the FEM Postprocessor FastAPI service."""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from backend.common.auth.dependencies import get_current_user
from backend.common.auth.identity import UserIdentity, UserRole


def _mock_user():
    return UserIdentity(
        id="test-user",
        email="t@t.com",
        username="tester",
        role=UserRole.USER,
        simulation_tokens=9999,
        flatrate_until=datetime.now(timezone.utc) + timedelta(days=365),
    )


def _make_solved_data():
    """Create a solved dataset (mesh + results) for postprocessor tests."""
    return {
        "mesh": {
            "nodes": [
                {"id": 0, "coords": [0.0, 0.0]},
                {"id": 1, "coords": [1.0, 0.0]},
                {"id": 2, "coords": [1.0, 1.0]},
                {"id": 3, "coords": [0.0, 1.0]},
            ],
            "elements": [
                {"id": 0, "element_type": "tri3", "node_ids": [0, 1, 2], "region_id": 0},
                {"id": 1, "element_type": "tri3", "node_ids": [0, 2, 3], "region_id": 0},
            ],
            "regions": [{"id": 0, "name": "air", "material_id": "air"}],
            "boundary_edges": [
                {"id": 0, "node_ids": [0, 1], "region_name": "bottom"},
                {"id": 1, "node_ids": [2, 3], "region_name": "top"},
            ],
            "element_type": "tri3",
            "dimension": 2,
        },
        "scalar_fields": {
            "electric_potential": {
                "field_name": "electric_potential",
                "node_values": [0.0, 0.0, 1.0, 1.0],
                "unit": "V",
                "min_value": 0.0,
                "max_value": 1.0,
            }
        },
        "vector_fields": {
            "electric_field": {
                "field_name": "electric_field",
                "element_values": [[0.0, -1.0], [0.0, -1.0]],
                "unit": "V/m",
                "max_magnitude": 1.0,
            }
        },
    }


@pytest.fixture
def client():
    from backend.fem_postprocessor.main import app

    app.dependency_overrides[get_current_user] = _mock_user
    c = TestClient(app)
    yield c
    app.dependency_overrides.clear()


class TestHealthCheck:
    def test_health_check(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "fem-postprocessor"


class TestFieldVisualization:
    """POST /api/fem/postprocess/field tests."""

    def test_get_field_data(self, client):
        """Returns field data formatted for WebGL rendering."""
        solved = _make_solved_data()
        request_data = {
            **solved,
            "field_name": "electric_potential",
            "display_mode": "contour",
        }
        response = client.post("/api/fem/postprocess/field", json=request_data)
        assert response.status_code == 200
        data = response.json()
        assert "positions" in data
        assert "indices" in data
        assert "values" in data
        assert data["field_name"] == "electric_potential"
        assert data["min_value"] == pytest.approx(0.0)
        assert data["max_value"] == pytest.approx(1.0)

    def test_get_vector_field_data(self, client):
        """Returns vector field data with arrow positions."""
        solved = _make_solved_data()
        request_data = {
            **solved,
            "field_name": "electric_field",
            "display_mode": "arrows",
        }
        response = client.post("/api/fem/postprocess/field", json=request_data)
        assert response.status_code == 200
        data = response.json()
        assert "arrows" in data
        assert data["field_name"] == "electric_field"

    def test_field_not_found(self, client):
        """Requesting a nonexistent field returns 400."""
        solved = _make_solved_data()
        request_data = {
            **solved,
            "field_name": "nonexistent",
            "display_mode": "contour",
        }
        response = client.post("/api/fem/postprocess/field", json=request_data)
        assert response.status_code == 400


class TestLinePlot:
    """POST /api/fem/postprocess/line-plot tests."""

    def test_line_plot_along_y(self, client):
        """Sample field along a vertical line (x=0.5)."""
        solved = _make_solved_data()
        request_data = {
            **solved,
            "field_name": "electric_potential",
            "start_point": [0.5, 0.0],
            "end_point": [0.5, 1.0],
            "num_points": 5,
        }
        response = client.post("/api/fem/postprocess/line-plot", json=request_data)
        assert response.status_code == 200
        data = response.json()
        assert "distances" in data
        assert "values" in data
        assert len(data["distances"]) == 5
        assert len(data["values"]) == 5
        # Potential should go from ~0 to ~1
        assert data["values"][0] == pytest.approx(0.0, abs=0.1)
        assert data["values"][-1] == pytest.approx(1.0, abs=0.1)


class TestPointProbe:
    """POST /api/fem/postprocess/point-probe tests."""

    def test_probe_at_center(self, client):
        """Probe the field at a single point."""
        solved = _make_solved_data()
        request_data = {
            **solved,
            "field_name": "electric_potential",
            "point": [0.5, 0.5],
        }
        response = client.post("/api/fem/postprocess/point-probe", json=request_data)
        assert response.status_code == 200
        data = response.json()
        assert "value" in data
        assert data["value"] == pytest.approx(0.5, abs=0.1)
        assert data["point"] == [0.5, 0.5]

    def test_probe_outside_domain(self, client):
        """Probing outside mesh domain returns 400."""
        solved = _make_solved_data()
        request_data = {
            **solved,
            "field_name": "electric_potential",
            "point": [10.0, 10.0],
        }
        response = client.post("/api/fem/postprocess/point-probe", json=request_data)
        assert response.status_code == 400


class TestExportVTK:
    """POST /api/fem/postprocess/export/vtk tests."""

    def test_export_vtk(self, client):
        """Export mesh + fields to VTK format."""
        solved = _make_solved_data()
        request_data = solved
        response = client.post("/api/fem/postprocess/export/vtk", json=request_data)
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/octet-stream"
        # VTK legacy format starts with "# vtk DataFile"
        content = response.content.decode("utf-8")
        assert content.startswith("# vtk DataFile")


class TestExportCSV:
    """POST /api/fem/postprocess/export/csv tests."""

    def test_export_csv_scalar(self, client):
        """Export scalar field to CSV."""
        solved = _make_solved_data()
        request_data = {
            **solved,
            "field_name": "electric_potential",
        }
        response = client.post("/api/fem/postprocess/export/csv", json=request_data)
        assert response.status_code == 200
        assert "text/csv" in response.headers["content-type"]
        content = response.content.decode("utf-8")
        lines = content.strip().split("\n")
        assert len(lines) == 5  # header + 4 data rows
        assert "x" in lines[0] and "y" in lines[0]
