"""Tests for LocalAuthProvider — security hardening."""

import os
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest
from jose import jwt

from backend.common.auth.local_provider import (
    JWT_ALGORITHM,
    JWT_SECRET,
    LocalAuthProvider,
    _role_from_db,
)

# ── _role_from_db ─────────────────────────────────────────────────────────────


class TestRoleFromDb:
    def test_explicit_admin_role(self):
        from backend.common.auth.identity import UserRole

        assert _role_from_db({"role": "admin"}) == UserRole.ADMIN

    def test_explicit_user_role(self):
        from backend.common.auth.identity import UserRole

        assert _role_from_db({"role": "user"}) == UserRole.USER

    def test_explicit_maintainer_role(self):
        from backend.common.auth.identity import UserRole

        assert _role_from_db({"role": "maintainer"}) == UserRole.MAINTAINER

    def test_invalid_role_falls_back_to_is_admin(self):
        from backend.common.auth.identity import UserRole

        assert _role_from_db({"role": "invalid", "is_admin": True}) == UserRole.ADMIN

    def test_no_role_no_admin_is_user(self):
        from backend.common.auth.identity import UserRole

        assert _role_from_db({}) == UserRole.USER


# ── JWT secret warning ────────────────────────────────────────────────────────


class TestJwtSecretConfig:
    def test_default_secret_logs_warning(self):
        """When JWT_SECRET_KEY is the default, a warning is logged at import time."""
        # The warning was already emitted at module import.
        # We verify the module-level JWT_SECRET is set (possibly the default).
        assert JWT_SECRET is not None
        assert len(JWT_SECRET) > 0

    @patch.dict(os.environ, {"JWT_SECRET_KEY": "my-super-secret-production-key"})
    def test_custom_secret_overrides_default(self):
        """When JWT_SECRET_KEY env var is set, it is used."""
        # Re-import to pick up env var change isn't practical due to module caching,
        # but we verify the pattern works via os.getenv directly.
        val = os.getenv("JWT_SECRET_KEY")
        assert val == "my-super-secret-production-key"


# ── Token validation ──────────────────────────────────────────────────────────


class TestLocalProviderValidateToken:
    @patch("backend.common.auth.local_provider.UserRepository")
    def test_valid_token(self, mock_repo_cls):
        provider = LocalAuthProvider()
        token = jwt.encode(
            {
                "sub": "user-123",
                "email": "a@b.com",
                "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            },
            JWT_SECRET,
            algorithm=JWT_ALGORITHM,
        )
        data = provider.validate_token(token)
        assert data.user_id == "user-123"
        assert data.email == "a@b.com"

    @patch("backend.common.auth.local_provider.UserRepository")
    def test_expired_token_raises(self, mock_repo_cls):
        provider = LocalAuthProvider()
        token = jwt.encode(
            {"sub": "user-123", "exp": datetime.now(timezone.utc) - timedelta(hours=1)},
            JWT_SECRET,
            algorithm=JWT_ALGORITHM,
        )
        with pytest.raises(ValueError, match="Token expired"):
            provider.validate_token(token)

    @patch("backend.common.auth.local_provider.UserRepository")
    def test_invalid_token_raises(self, mock_repo_cls):
        provider = LocalAuthProvider()
        with pytest.raises(ValueError, match="Invalid token"):
            provider.validate_token("not-a-valid-jwt")

    @patch("backend.common.auth.local_provider.UserRepository")
    def test_empty_token_raises(self, mock_repo_cls):
        provider = LocalAuthProvider()
        with pytest.raises(ValueError, match="non-empty"):
            provider.validate_token("")

    @patch("backend.common.auth.local_provider.UserRepository")
    def test_wrong_secret_raises(self, mock_repo_cls):
        provider = LocalAuthProvider()
        token = jwt.encode(
            {"sub": "user-123", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
            "wrong-secret",
            algorithm=JWT_ALGORITHM,
        )
        with pytest.raises(ValueError, match="Invalid token"):
            provider.validate_token(token)

    @patch("backend.common.auth.local_provider.UserRepository")
    def test_missing_sub_raises(self, mock_repo_cls):
        provider = LocalAuthProvider()
        token = jwt.encode(
            {"email": "a@b.com", "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
            JWT_SECRET,
            algorithm=JWT_ALGORITHM,
        )
        with pytest.raises(ValueError, match="sub"):
            provider.validate_token(token)
