"""Tests for the FEM Solver FastAPI service."""

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


def _make_simple_mesh() -> dict:
    """Create a minimal 2-triangle mesh spanning a 1x1 square for testing."""
    return {
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
            {"id": 1, "node_ids": [1, 2], "region_name": "right"},
            {"id": 2, "node_ids": [2, 3], "region_name": "top"},
            {"id": 3, "node_ids": [3, 0], "region_name": "left"},
        ],
        "element_type": "tri3",
        "dimension": 2,
    }


@pytest.fixture
def client():
    from backend.fem_solver.main import app

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
        assert data["service"] == "fem-solver"


class TestSolveEndpoint:
    """POST /api/fem/solve tests."""

    def test_solve_electrostatic_basic(self, client):
        """Solve a simple electrostatic problem: bottom=0V, top=1V."""
        request_data = {
            "mesh": _make_simple_mesh(),
            "pde_type": "electrostatic",
            "materials": {
                "air": {
                    "id": "air",
                    "name": "Air",
                    "relative_permittivity": 1.0,
                },
            },
            "boundary_conditions": [
                {
                    "bc_type": "dirichlet",
                    "boundary_name": "bottom",
                    "value": 0.0,
                },
                {
                    "bc_type": "dirichlet",
                    "boundary_name": "top",
                    "value": 1.0,
                },
            ],
            "config": {
                "pde_type": "electrostatic",
                "solver_type": "direct",
                "tolerance": 1e-10,
            },
        }
        response = client.post("/api/fem/solve", json=request_data)
        assert response.status_code == 200

        data = response.json()
        assert "scalar_fields" in data
        assert "electric_potential" in data["scalar_fields"]
        assert "vector_fields" in data
        assert "electric_field" in data["vector_fields"]
        assert "integrals" in data
        assert data["n_dofs"] == 4
        assert data["n_elements"] == 2
        assert data["solve_time"] > 0

        # Check potential values at Dirichlet nodes
        phi = data["scalar_fields"]["electric_potential"]["node_values"]
        assert phi[0] == pytest.approx(0.0, abs=1e-10)  # bottom-left
        assert phi[1] == pytest.approx(0.0, abs=1e-10)  # bottom-right
        assert phi[2] == pytest.approx(1.0, abs=1e-10)  # top-right
        assert phi[3] == pytest.approx(1.0, abs=1e-10)  # top-left

    def test_solve_missing_mesh(self, client):
        """Request without mesh should fail."""
        request_data = {
            "pde_type": "electrostatic",
            "materials": {},
            "boundary_conditions": [],
            "config": {"pde_type": "electrostatic"},
        }
        response = client.post("/api/fem/solve", json=request_data)
        assert response.status_code == 422

    def test_solve_missing_material(self, client):
        """Region with no matching material should default to vacuum (ε_r=1)."""
        mesh = _make_simple_mesh()
        request_data = {
            "mesh": mesh,
            "pde_type": "electrostatic",
            "materials": {},  # Empty — region references "air" which is missing
            "boundary_conditions": [
                {"bc_type": "dirichlet", "boundary_name": "bottom", "value": 0.0},
                {"bc_type": "dirichlet", "boundary_name": "top", "value": 1.0},
            ],
            "config": {"pde_type": "electrostatic"},
        }
        response = client.post("/api/fem/solve", json=request_data)
        assert response.status_code == 200

    def test_solve_unsupported_pde(self, client):
        """Unsupported PDE type should fail with 400."""
        request_data = {
            "mesh": _make_simple_mesh(),
            "pde_type": "magnetostatic",
            "materials": {
                "air": {
                    "id": "air",
                    "name": "Air",
                    "relative_permittivity": 1.0,
                },
            },
            "boundary_conditions": [],
            "config": {"pde_type": "magnetostatic"},
        }
        response = client.post("/api/fem/solve", json=request_data)
        assert response.status_code == 400
        assert "not yet supported" in response.json()["detail"].lower()


class TestEstimateEndpoint:
    """POST /api/fem/solve/estimate tests."""

    def test_estimate_solve_time(self, client):
        """Estimate should return estimated time and memory."""
        request_data = {
            "mesh": _make_simple_mesh(),
            "pde_type": "electrostatic",
            "config": {"pde_type": "electrostatic"},
        }
        response = client.post("/api/fem/solve/estimate", json=request_data)
        assert response.status_code == 200
        data = response.json()
        assert "estimated_time" in data
        assert "estimated_memory_mb" in data
        assert data["n_dofs"] == 4
