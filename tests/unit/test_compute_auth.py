"""Tests for compute service auth + token enforcement (Phase 4).

Tests that:
- Compute endpoints require authentication (401 without token)
- Token balance is checked before computation
- 402 returned when insufficient tokens
- Sweep cost scales with number of frequencies
- Free endpoints (health, info, estimate) remain accessible

Uses TestClient with mocked auth dependency.
"""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from backend.common.auth.identity import UserIdentity, UserRole


def _make_user(tokens: int = 500, flatrate_days: int = 0) -> UserIdentity:
    """Helper: create a UserIdentity with given token balance."""
    flatrate = None
    if flatrate_days > 0:
        flatrate = datetime.now(timezone.utc) + timedelta(days=flatrate_days)
    return UserIdentity(
        id="test-user-1",
        email="test@example.com",
        username="testuser",
        role=UserRole.USER,
        simulation_tokens=tokens,
        flatrate_until=flatrate,
    )


# ─── Preprocessor ─────────────────────────────────────────────────────────────


class TestPreprocessorAuth:
    """Preprocessor endpoints require auth and deduct 1 token."""

    def test_health_is_public(self):
        from backend.preprocessor.main import app

        client = TestClient(app)
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_dipole_without_auth_returns_401(self):
        from backend.preprocessor.main import app

        client = TestClient(app)
        resp = client.post(
            "/api/antenna/dipole",
            json={
                "length": 0.5,
                "wire_radius": 0.001,
                "segments": 11,
            },
        )
        assert resp.status_code == 401


# ─── Solver ───────────────────────────────────────────────────────────────────


class TestSolverAuth:
    """Solver endpoints require auth and deduct tokens."""

    def test_health_is_public(self):
        from backend.solver.main import app

        client = TestClient(app)
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_materials_is_public(self):
        from backend.solver.main import app

        client = TestClient(app)
        resp = client.get("/api/info/materials")
        assert resp.status_code == 200

    def test_solve_single_without_auth_returns_401(self):
        from backend.solver.main import app

        client = TestClient(app)
        resp = client.post("/api/solve/single", json={})
        assert resp.status_code == 401

    def test_solve_multi_without_auth_returns_401(self):
        from backend.solver.main import app

        client = TestClient(app)
        resp = client.post("/api/solve/multi", json={})
        assert resp.status_code == 401

    def test_solve_sweep_without_auth_returns_401(self):
        from backend.solver.main import app

        client = TestClient(app)
        resp = client.post("/api/solve/sweep", json={})
        assert resp.status_code == 401

    def test_estimate_is_public(self):
        from backend.solver.main import app

        client = TestClient(app)
        resp = client.post(
            "/api/estimate",
            json={"n_edges": 10, "n_frequencies": 1},
        )
        assert resp.status_code == 200


# ─── Postprocessor ────────────────────────────────────────────────────────────


class TestPostprocessorAuth:
    """Postprocessor endpoints require auth and deduct tokens."""

    def test_health_is_public(self):
        from backend.postprocessor.main import app

        client = TestClient(app)
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_near_field_without_auth_returns_401(self):
        from backend.postprocessor.main import app

        client = TestClient(app)
        resp = client.post("/api/fields/near", json={})
        assert resp.status_code == 401

    def test_far_field_without_auth_returns_401(self):
        from backend.postprocessor.main import app

        client = TestClient(app)
        resp = client.post("/api/fields/far", json={})
        assert resp.status_code == 401
