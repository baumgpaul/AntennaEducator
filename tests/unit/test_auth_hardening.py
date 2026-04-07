"""Unit tests for Phase 8 Step 7 — Auth service hardening.

Covers:
- Registration: generic error on duplicate email/username (no enumeration)
- Login: generic error on bad credentials (no enumeration)
- Login: locked account returns 403 with generic message
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.auth.main import app


@pytest.fixture()
def client():
    return TestClient(app)


class TestRegistrationEnumeration:
    """Register endpoint must not leak whether email/username exists."""

    @patch("backend.auth.main.create_auth_provider")
    def test_duplicate_email_gives_generic_error(self, mock_factory, client):
        provider = AsyncMock()
        provider.register.side_effect = ValueError("Email already registered")
        mock_factory.return_value = provider

        resp = client.post(
            "/api/auth/register",
            json={"email": "a@b.com", "username": "newuser", "password": "Str0ngPwd!"},
        )
        assert resp.status_code == 400
        # Detail must NOT contain "Email already registered"
        assert "already" not in resp.json()["detail"].lower()
        assert "check your input" in resp.json()["detail"].lower()

    @patch("backend.auth.main.create_auth_provider")
    def test_duplicate_username_gives_generic_error(self, mock_factory, client):
        provider = AsyncMock()
        provider.register.side_effect = ValueError("Username already taken")
        mock_factory.return_value = provider

        resp = client.post(
            "/api/auth/register",
            json={"email": "x@y.com", "username": "dup", "password": "Str0ngPwd!"},
        )
        assert resp.status_code == 400
        assert "already" not in resp.json()["detail"].lower()

    @patch("backend.auth.main.create_auth_provider")
    def test_internal_error_gives_500(self, mock_factory, client):
        provider = AsyncMock()
        provider.register.side_effect = RuntimeError("DB connection lost")
        mock_factory.return_value = provider

        resp = client.post(
            "/api/auth/register",
            json={"email": "z@w.com", "username": "newu", "password": "Str0ngPwd!"},
        )
        assert resp.status_code == 500
        assert "try again" in resp.json()["detail"].lower()


class TestLoginEnumeration:
    """Login endpoint must not reveal whether user exists."""

    @patch("backend.auth.main.create_auth_provider")
    def test_bad_password_gives_generic_error(self, mock_factory, client):
        provider = AsyncMock()
        provider.login.side_effect = ValueError("Invalid email or password")
        mock_factory.return_value = provider

        resp = client.post(
            "/api/auth/login",
            json={"email": "a@b.com", "password": "wrong"},
        )
        assert resp.status_code == 401
        assert resp.json()["detail"] == "Invalid credentials."

    @patch("backend.auth.main.create_auth_provider")
    def test_nonexistent_user_gives_generic_error(self, mock_factory, client):
        provider = AsyncMock()
        provider.login.side_effect = ValueError("User not found")
        mock_factory.return_value = provider

        resp = client.post(
            "/api/auth/login",
            json={"email": "noone@b.com", "password": "whatever"},
        )
        assert resp.status_code == 401
        assert resp.json()["detail"] == "Invalid credentials."

    @patch("backend.auth.main.create_auth_provider")
    def test_locked_account_returns_403(self, mock_factory, client):
        provider = AsyncMock()
        provider.login.side_effect = ValueError("Account is locked")
        mock_factory.return_value = provider

        resp = client.post(
            "/api/auth/login",
            json={"email": "locked@b.com", "password": "whatever"},
        )
        assert resp.status_code == 403
        assert resp.json()["detail"] == "Account is locked."

    @patch("backend.auth.main.create_auth_provider")
    def test_internal_error_gives_500(self, mock_factory, client):
        provider = AsyncMock()
        provider.login.side_effect = RuntimeError("timeout")
        mock_factory.return_value = provider

        resp = client.post(
            "/api/auth/login",
            json={"email": "a@b.com", "password": "pwd"},
        )
        assert resp.status_code == 500
        assert "failed" in resp.json()["detail"].lower()
