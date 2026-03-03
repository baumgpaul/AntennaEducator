"""Tests for UserRole enum and UserIdentity backward compatibility.

Validates that:
- UserRole enum has the expected values
- is_admin / is_maintainer computed properties work correctly
- Backward compatibility with code that reads ``user.is_admin``
"""

import pytest

from backend.common.auth.identity import UserIdentity, UserRole


class TestUserRole:
    """UserRole enum tests."""

    def test_enum_values(self):
        assert UserRole.USER.value == "user"
        assert UserRole.MAINTAINER.value == "maintainer"
        assert UserRole.ADMIN.value == "admin"

    def test_role_from_string(self):
        assert UserRole("user") == UserRole.USER
        assert UserRole("maintainer") == UserRole.MAINTAINER
        assert UserRole("admin") == UserRole.ADMIN

    def test_invalid_role_raises(self):
        with pytest.raises(ValueError):
            UserRole("superadmin")


class TestUserIdentityRoles:
    """UserIdentity with role field tests."""

    def test_default_role_is_user(self):
        u = UserIdentity(id="1", email="a@b.com", username="alice")
        assert u.role == UserRole.USER

    def test_is_admin_computed_property(self):
        admin = UserIdentity(id="1", email="a@b.com", username="alice", role=UserRole.ADMIN)
        assert admin.is_admin is True

        user = UserIdentity(id="2", email="b@b.com", username="bob", role=UserRole.USER)
        assert user.is_admin is False

        maintainer = UserIdentity(
            id="3", email="c@b.com", username="carol", role=UserRole.MAINTAINER
        )
        assert maintainer.is_admin is False

    def test_is_maintainer_computed_property(self):
        admin = UserIdentity(id="1", email="a@b.com", username="alice", role=UserRole.ADMIN)
        assert admin.is_maintainer is True  # Admin also has maintainer privileges

        maintainer = UserIdentity(id="2", email="b@b.com", username="bob", role=UserRole.MAINTAINER)
        assert maintainer.is_maintainer is True

        user = UserIdentity(id="3", email="c@b.com", username="carol", role=UserRole.USER)
        assert user.is_maintainer is False

    def test_frozen_model(self):
        u = UserIdentity(id="1", email="a@b.com", username="alice")
        with pytest.raises(Exception):
            u.role = UserRole.ADMIN  # type: ignore

    def test_backward_compat_is_admin_in_dict(self):
        """Ensure is_admin appears in model_dump() output."""
        admin = UserIdentity(id="1", email="a@b.com", username="alice", role=UserRole.ADMIN)
        d = admin.model_dump()
        assert d["is_admin"] is True
        assert d["role"] == UserRole.ADMIN

    def test_user_role_in_serialization(self):
        u = UserIdentity(id="1", email="a@b.com", username="alice", role=UserRole.MAINTAINER)
        d = u.model_dump()
        assert d["role"] == UserRole.MAINTAINER
        assert d["is_admin"] is False
        assert d["is_maintainer"] is True
