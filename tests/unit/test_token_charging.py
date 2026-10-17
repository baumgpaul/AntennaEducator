"""Tokens are charged only for successful compute requests (TEST_PLAN B43/B44).

Before: the dependency deducted before FastAPI validated the request body, so
422s, 4xx rejections and 5xx crashes still cost tokens.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from backend.common.auth.dependencies import get_current_user
from backend.common.auth.identity import UserIdentity, UserRole


def _paying_user() -> UserIdentity:
    return UserIdentity(
        id="payer-1",
        email="payer@example.com",
        username="payer",
        role=UserRole.USER,
        simulation_tokens=500,
    )


@pytest.fixture
def repo():
    with patch("backend.common.repositories.user_repository.UserRepository") as cls:
        cls.return_value.deduct_user_tokens.return_value = 499
        yield cls.return_value


@pytest.fixture
def preprocessor():
    from backend.preprocessor.main import app

    app.dependency_overrides[get_current_user] = _paying_user
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def solver():
    from backend.solver.main import app

    app.dependency_overrides[get_current_user] = _paying_user
    yield TestClient(app)
    app.dependency_overrides.clear()


class TestDependencyCharging:
    def test_successful_request_is_charged(self, preprocessor, repo):
        resp = preprocessor.post("/api/antenna/dipole", json={"length": 1.0})
        assert resp.status_code == 200
        repo.deduct_user_tokens.assert_called_once_with("payer-1", 1)

    def test_validation_error_is_not_charged(self, preprocessor, repo):
        resp = preprocessor.post("/api/antenna/dipole", json={"length": "not-a-number"})
        assert resp.status_code == 422
        repo.deduct_user_tokens.assert_not_called()

    def test_rejected_request_is_not_charged(self, solver, repo):
        # Passes schema validation, rejected by the endpoint (no sources).
        resp = solver.post(
            "/api/solve/single",
            json={
                "nodes": [[0, 0, 0], [0, 0, 1]],
                "edges": [[1, 2]],
                "radii": [0.001],
                "frequency": 1e8,
            },
        )
        assert resp.status_code == 400
        repo.deduct_user_tokens.assert_not_called()

    def test_insufficient_balance_is_402_and_not_charged(self, preprocessor, repo):
        broke = UserIdentity(id="broke-1", email="b@example.com", username="b", role=UserRole.USER)
        from backend.preprocessor.main import app

        app.dependency_overrides[get_current_user] = lambda: broke
        resp = preprocessor.post("/api/antenna/dipole", json={"length": 1.0})
        assert resp.status_code == 402
        repo.deduct_user_tokens.assert_not_called()


class TestSweepCharging:
    def test_rejected_sweep_is_not_charged(self, solver, repo):
        resp = solver.post(
            "/api/solve/sweep",
            json={
                "nodes": [[0, 0, 0], [0, 0, 1]],
                "edges": [[1, 2]],
                "radii": [0.001],
                "frequencies": [1e8, 2e8],
            },
        )
        assert resp.status_code == 400
        repo.deduct_user_tokens.assert_not_called()

    def test_successful_sweep_is_charged_and_logged(self, solver, repo):
        with patch("backend.common.auth.token_dependency._log_usage") as log:
            resp = solver.post(
                "/api/solve/sweep",
                json={
                    "nodes": [[0, 0, -0.25], [0, 0, 0], [0, 0, 0.25]],
                    "edges": [[1, 2], [2, 3]],
                    "radii": [0.001, 0.001],
                    "frequencies": [3e8, 3.1e8],
                    "voltage_sources": [{"node_start": 2, "node_end": 0, "value": 1}],
                },
            )
        assert resp.status_code == 200, resp.text
        repo.deduct_user_tokens.assert_called_once()
        log.assert_called_once()
        assert log.call_args.kwargs["endpoint"] == "solve/sweep"
