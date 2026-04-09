"""Tests for the FEM Preprocessor FastAPI service.

Gmsh cannot run inside the TestClient worker thread (``signal`` only works in
the main thread), so mesh-generation endpoints are tested with a mocked
``GmshMesher``.  The actual Gmsh integration is covered in
``test_gmsh_mesher.py``.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.common.auth.dependencies import get_current_user
from backend.common.auth.identity import UserIdentity, UserRole
from backend.common.models.fem.mesh import (
    BoundaryEdge,
    ElementType,
    FEMElement,
    FEMMesh,
    FEMNode,
    Region,
)


def _mock_user():
    """Return a flatrate user so token deduction is skipped entirely."""
    return UserIdentity(
        id="test-user",
        email="t@t.com",
        username="tester",
        role=UserRole.USER,
        simulation_tokens=9999,
        flatrate_until=datetime.now(timezone.utc) + timedelta(days=365),
    )


def _fake_mesh() -> FEMMesh:
    """A tiny mesh returned by the mocked mesher."""
    return FEMMesh(
        nodes=[
            FEMNode(id=0, coords=[0.0, 0.0]),
            FEMNode(id=1, coords=[1.0, 0.0]),
            FEMNode(id=2, coords=[1.0, 1.0]),
            FEMNode(id=3, coords=[0.0, 1.0]),
        ],
        elements=[
            FEMElement(id=0, element_type=ElementType.TRI3, node_ids=[0, 1, 2], region_id=0),
            FEMElement(id=1, element_type=ElementType.TRI3, node_ids=[0, 2, 3], region_id=0),
        ],
        regions=[Region(id=0, name="surface")],
        boundary_edges=[
            BoundaryEdge(id=0, node_ids=[0, 1], region_name="bottom"),
        ],
        element_type=ElementType.TRI3,
    )


@pytest.fixture
def client():
    """Create a test client for the FEM preprocessor service with mocked auth."""
    from backend.fem_preprocessor.main import app

    app.dependency_overrides[get_current_user] = _mock_user
    c = TestClient(app)
    yield c
    app.dependency_overrides.clear()


class TestHealthCheck:
    """Health endpoint tests."""

    def test_health_check(self, client):
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "fem-preprocessor"
        assert "version" in data
        assert "timestamp" in data


class TestMeshGenerate:
    """POST /api/fem/mesh/generate tests."""

    @patch("backend.fem_preprocessor.main.GmshMesher")
    def test_generate_mesh_rectangle(self, mock_mesher_cls, client):
        """Generate mesh from a rectangle geometry (Gmsh mocked)."""
        mock_mesher_cls.return_value.generate.return_value = _fake_mesh()

        request_data = {
            "geometry": {
                "operations": [
                    {
                        "type": "add_rectangle",
                        "params": {
                            "x": 0.0,
                            "y": 0.0,
                            "width": 1.0,
                            "height": 1.0,
                        },
                    }
                ]
            },
            "discretization": {
                "element_type": "tri3",
                "global_element_size": 0.3,
                "optimize": True,
            },
        }
        response = client.post("/api/fem/mesh/generate", json=request_data)
        assert response.status_code == 200

        data = response.json()
        assert "mesh" in data
        assert "message" in data

        mesh = data["mesh"]
        assert len(mesh["nodes"]) == 4
        assert len(mesh["elements"]) == 2
        assert len(mesh["regions"]) == 1
        assert mesh["element_type"] == "tri3"
        assert mesh["dimension"] == 2

    @patch("backend.fem_preprocessor.main.GmshMesher")
    def test_generate_mesh_with_variables(self, mock_mesher_cls, client):
        """Generate mesh with parametric variables."""
        mock_mesher_cls.return_value.generate.return_value = _fake_mesh()

        request_data = {
            "geometry": {
                "operations": [
                    {
                        "type": "add_rectangle",
                        "params": {"x": 0, "y": 0, "width": 2.0, "height": 1.0},
                    }
                ]
            },
            "discretization": {
                "element_type": "tri3",
                "global_element_size": 0.5,
            },
            "variables": {"W": 2.0, "H": 1.0},
        }
        response = client.post("/api/fem/mesh/generate", json=request_data)
        assert response.status_code == 200
        # Verify variables were passed to Gmsh
        call_kwargs = mock_mesher_cls.return_value.generate.call_args
        assert call_kwargs.kwargs.get("variables") == {"W": 2.0, "H": 1.0}

    def test_generate_mesh_empty_geometry(self, client):
        """Empty geometry operations should fail with 400."""
        request_data = {
            "geometry": {"operations": []},
            "discretization": {"element_type": "tri3", "global_element_size": 0.3},
        }
        response = client.post("/api/fem/mesh/generate", json=request_data)
        assert response.status_code == 400

    def test_generate_mesh_invalid_element_type(self, client):
        """Invalid element type should fail validation."""
        request_data = {
            "geometry": {
                "operations": [
                    {
                        "type": "add_rectangle",
                        "params": {"x": 0, "y": 0, "width": 1, "height": 1},
                    }
                ]
            },
            "discretization": {
                "element_type": "hex8",
                "global_element_size": 0.3,
            },
        }
        response = client.post("/api/fem/mesh/generate", json=request_data)
        assert response.status_code == 422  # Pydantic validation error

    @patch("backend.fem_preprocessor.main.GmshMesher")
    def test_generate_mesh_circle(self, mock_mesher_cls, client):
        """Generate mesh from a circle geometry."""
        mock_mesher_cls.return_value.generate.return_value = _fake_mesh()

        request_data = {
            "geometry": {
                "operations": [
                    {
                        "type": "add_circle",
                        "params": {"cx": 0, "cy": 0, "radius": 0.5},
                    }
                ]
            },
            "discretization": {
                "element_type": "tri3",
                "global_element_size": 0.2,
            },
        }
        response = client.post("/api/fem/mesh/generate", json=request_data)
        assert response.status_code == 200
        data = response.json()
        assert len(data["mesh"]["elements"]) >= 2

    @patch("backend.fem_preprocessor.main.GmshMesher")
    def test_generate_mesh_value_error(self, mock_mesher_cls, client):
        """ValueError from mesher should return 400."""
        mock_mesher_cls.return_value.generate.side_effect = ValueError("bad geometry")

        request_data = {
            "geometry": {
                "operations": [
                    {"type": "add_rectangle", "params": {"x": 0, "y": 0, "width": 1, "height": 1}}
                ]
            },
            "discretization": {"element_type": "tri3", "global_element_size": 0.3},
        }
        response = client.post("/api/fem/mesh/generate", json=request_data)
        assert response.status_code == 400
        assert "bad geometry" in response.json()["detail"]


class TestMeshImport:
    """POST /api/fem/mesh/import tests."""

    def test_import_mesh_from_nodes_and_elements(self, client):
        """Import a mesh from explicit node/element data."""
        request_data = {
            "nodes": [
                {"id": 0, "coords": [0.0, 0.0]},
                {"id": 1, "coords": [1.0, 0.0]},
                {"id": 2, "coords": [0.0, 1.0]},
            ],
            "elements": [
                {
                    "id": 0,
                    "element_type": "tri3",
                    "node_ids": [0, 1, 2],
                    "region_id": 0,
                }
            ],
            "regions": [{"id": 0, "name": "domain"}],
            "boundary_edges": [],
        }
        response = client.post("/api/fem/mesh/import", json=request_data)
        assert response.status_code == 200
        data = response.json()
        assert data["mesh"]["nodes"][0]["coords"] == [0.0, 0.0]
        assert len(data["mesh"]["elements"]) == 1

    def test_import_mesh_missing_nodes(self, client):
        """Missing nodes field should fail validation."""
        request_data = {
            "elements": [
                {
                    "id": 0,
                    "element_type": "tri3",
                    "node_ids": [0, 1, 2],
                    "region_id": 0,
                }
            ],
        }
        response = client.post("/api/fem/mesh/import", json=request_data)
        assert response.status_code == 422
