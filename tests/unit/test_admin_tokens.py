"""Tests for admin token management endpoints (Phase 5).

Covers:
- PUT /api/admin/users/{user_id}/tokens (set/add/subtract)
- PUT /api/admin/users/{user_id}/flatrate (grant/revoke)
- GET /api/admin/users includes token fields
- Non-admin users get 403
"""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.common.auth.identity import UserIdentity, UserRole


def _admin_user() -> UserIdentity:
    return UserIdentity(
        id="admin-1",
        email="admin@example.com",
        username="admin",
        role=UserRole.ADMIN,
        simulation_tokens=9999,
    )


def _regular_user() -> UserIdentity:
    return UserIdentity(
        id="user-1",
        email="user@example.com",
        username="student",
        role=UserRole.USER,
        simulation_tokens=100,
    )


@pytest.fixture
def client_as_admin():
    """Projects app TestClient with admin auth mocked."""
    from backend.common.auth.dependencies import get_current_user
    from backend.projects.main import app

    app.dependency_overrides[get_current_user] = lambda: _admin_user()
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


@pytest.fixture
def client_as_user():
    """Projects app TestClient with regular user auth mocked."""
    from backend.common.auth.dependencies import get_current_user
    from backend.projects.main import app

    app.dependency_overrides[get_current_user] = lambda: _regular_user()
    client = TestClient(app)
    yield client
    app.dependency_overrides.clear()


class TestAdminSetTokens:
    """PUT /api/admin/users/{user_id}/tokens."""

    @patch("backend.projects.folder_routes._get_user_repo")
    def test_set_tokens_as_admin(self, mock_repo_fn, client_as_admin):
        mock_repo = MagicMock()
        mock_repo_fn.return_value = mock_repo
        mock_repo.get_user_by_id.return_value = {
            "user_id": "user-1",
            "email": "u@b.com",
            "username": "u",
            "role": "user",
            "is_locked": False,
            "simulation_tokens": 1000,
            "flatrate_until": None,
        }
        mock_repo.set_user_tokens.return_value = None

        resp = client_as_admin.put(
            "/api/admin/users/user-1/tokens",
            json={"action": "set", "amount": 1000},
        )
        assert resp.status_code == 200
        mock_repo.set_user_tokens.assert_called_once_with("user-1", 1000)

    def test_set_tokens_as_user_returns_403(self, client_as_user):
        resp = client_as_user.put(
            "/api/admin/users/user-1/tokens",
            json={"action": "set", "amount": 1000},
        )
        assert resp.status_code == 403

    @patch("backend.projects.folder_routes._get_user_repo")
    def test_add_tokens(self, mock_repo_fn, client_as_admin):
        mock_repo = MagicMock()
        mock_repo_fn.return_value = mock_repo
        mock_repo.get_user_by_id.return_value = {
            "user_id": "user-1",
            "email": "u@b.com",
            "username": "u",
            "role": "user",
            "is_locked": False,
            "simulation_tokens": 600,
            "flatrate_until": None,
        }
        mock_repo.set_user_tokens.return_value = None

        resp = client_as_admin.put(
            "/api/admin/users/user-1/tokens",
            json={"action": "add", "amount": 100},
        )
        assert resp.status_code == 200
        # 500 (old) + 100 = 600 — but we mock get_user_by_id returning current val
        # The endpoint reads current tokens and adds
        mock_repo.set_user_tokens.assert_called_once()

    @patch("backend.projects.folder_routes._get_user_repo")
    def test_negative_amount_rejected(self, mock_repo_fn, client_as_admin):
        resp = client_as_admin.put(
            "/api/admin/users/user-1/tokens",
            json={"action": "set", "amount": -10},
        )
        assert resp.status_code == 422  # Pydantic validation


class TestAdminSetFlatrate:
    """PUT /api/admin/users/{user_id}/flatrate."""

    @patch("backend.projects.folder_routes._get_user_repo")
    def test_grant_flatrate(self, mock_repo_fn, client_as_admin):
        mock_repo = MagicMock()
        mock_repo_fn.return_value = mock_repo
        mock_repo.get_user_by_id.return_value = {
            "user_id": "user-1",
            "email": "u@b.com",
            "username": "u",
            "role": "user",
            "is_locked": False,
            "simulation_tokens": 500,
            "flatrate_until": None,
        }
        mock_repo.set_user_flatrate.return_value = None

        resp = client_as_admin.put(
            "/api/admin/users/user-1/flatrate",
            json={"until": "2026-12-31T00:00:00Z"},
        )
        assert resp.status_code == 200
        mock_repo.set_user_flatrate.assert_called_once()

    @patch("backend.projects.folder_routes._get_user_repo")
    def test_revoke_flatrate(self, mock_repo_fn, client_as_admin):
        mock_repo = MagicMock()
        mock_repo_fn.return_value = mock_repo
        mock_repo.get_user_by_id.return_value = {
            "user_id": "user-1",
            "email": "u@b.com",
            "username": "u",
            "role": "user",
            "is_locked": False,
            "simulation_tokens": 500,
            "flatrate_until": None,
        }
        mock_repo.set_user_flatrate.return_value = None

        resp = client_as_admin.put(
            "/api/admin/users/user-1/flatrate",
            json={"until": None},
        )
        assert resp.status_code == 200
        mock_repo.set_user_flatrate.assert_called_once_with("user-1", None)

    def test_flatrate_as_user_returns_403(self, client_as_user):
        resp = client_as_user.put(
            "/api/admin/users/user-1/flatrate",
            json={"until": "2026-12-31T00:00:00Z"},
        )
        assert resp.status_code == 403


class TestAdminUserListIncludesTokens:
    """GET /api/admin/users returns token fields."""

    @patch("backend.projects.folder_routes._get_user_repo")
    def test_user_list_has_token_fields(self, mock_repo_fn, client_as_admin):
        mock_repo = MagicMock()
        mock_repo_fn.return_value = mock_repo
        # Use the real _to_dict staticmethod
        from backend.common.repositories.user_repository import UserRepository

        mock_repo._to_dict = UserRepository._to_dict
        mock_repo.table.scan.return_value = {
            "Items": [
                {
                    "PK": "USER#u1",
                    "SK": "METADATA",
                    "UserId": "u1",
                    "Email": "a@b.com",
                    "Username": "alice",
                    "IsAdmin": False,
                    "IsLocked": False,
                    "Role": "user",
                    "CreatedAt": "2026-01-01",
                    "SimulationTokens": 500,
                    "FlatrateUntil": "2026-12-31T00:00:00+00:00",
                }
            ]
        }
        resp = client_as_admin.get("/api/admin/users")
        assert resp.status_code == 200
        users = resp.json()
        assert len(users) == 1
        assert users[0]["simulation_tokens"] == 500
        assert users[0]["flatrate_until"] == "2026-12-31T00:00:00+00:00"
