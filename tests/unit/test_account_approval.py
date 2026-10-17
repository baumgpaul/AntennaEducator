"""Admin approval of new accounts (university courses only, no open signup).

New accounts start pending with 0 tokens; every API except /api/auth/me
rejects them until an admin approves (which grants the starter tokens).
Profiles created before this feature have no flag and count as approved.
"""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.common.auth.identity import TokenData, UserIdentity, UserRole
from backend.common.auth.token_costs import DEFAULT_STARTER_TOKENS


def _identity(approved: bool, role: UserRole = UserRole.USER) -> UserIdentity:
    return UserIdentity(
        id="u-1", email="u@example.com", username="u", role=role, is_approved=approved
    )


@pytest.fixture
def fake_provider():
    """Auth provider whose token always resolves to the profile in .profile."""
    from backend.common.auth import dependencies

    provider = MagicMock()
    provider.validate_token.return_value = TokenData(user_id="u-1", email="u@example.com")
    dependencies._profile_cache.clear()
    with patch.object(dependencies, "create_auth_provider", return_value=provider):
        yield provider
    dependencies._profile_cache.clear()


def _profile(provider, identity):
    async def _get(*_args, **_kwargs):
        return identity

    provider.get_user_profile.side_effect = _get


AUTH = {"Authorization": "Bearer any-token"}


class TestApiGate:
    def test_pending_user_is_rejected_by_protected_endpoints(self, fake_provider):
        from backend.projects.main import app

        _profile(fake_provider, _identity(approved=False))
        resp = TestClient(app).get("/api/projects", headers=AUTH)
        assert resp.status_code == 403
        assert "pending approval" in resp.json()["detail"]

    def test_pending_user_can_read_own_profile(self, fake_provider):
        from backend.projects.main import app

        _profile(fake_provider, _identity(approved=False))
        with patch("backend.common.repositories.user_repository.UserRepository") as repo:
            repo.return_value.get_user_by_id.return_value = None
            resp = TestClient(app).get("/api/auth/me", headers=AUTH)
        assert resp.status_code == 200
        assert resp.json()["is_approved"] is False

    def test_approved_user_passes(self, fake_provider):
        from backend.preprocessor.main import app

        _profile(
            fake_provider, _identity(approved=True).model_copy(update={"simulation_tokens": 10})
        )
        resp = TestClient(app).post("/api/antenna/dipole", headers=AUTH, json={"length": "x"})
        # Got past auth to body validation
        assert resp.status_code == 422


class TestRepository:
    def test_profile_without_flag_counts_as_approved(self):
        from backend.common.repositories.user_repository import UserRepository

        item = {"UserId": "u", "Email": "u@example.com"}
        assert UserRepository._to_dict(item)["is_approved"] is True

    def _repo(self, user: dict):
        from backend.common.repositories.user_repository import UserRepository

        repo = UserRepository.__new__(UserRepository)
        repo.table = MagicMock()
        repo.get_user_by_id = MagicMock(return_value=user)
        return repo

    def test_first_approval_grants_starter_tokens(self):
        repo = self._repo({"is_approved": False, "simulation_tokens": 0})
        repo.set_user_approval("u", True)
        kwargs = repo.table.update_item.call_args.kwargs
        assert kwargs["ExpressionAttributeValues"][":tokens"] == DEFAULT_STARTER_TOKENS
        assert kwargs["ExpressionAttributeValues"][":approved"] is True

    def test_reapproval_does_not_grant_tokens_again(self):
        repo = self._repo({"is_approved": True, "simulation_tokens": 3})
        repo.set_user_approval("u", True)
        assert ":tokens" not in repo.table.update_item.call_args.kwargs["ExpressionAttributeValues"]

    def test_revoke(self):
        repo = self._repo({"is_approved": True, "simulation_tokens": 3})
        repo.set_user_approval("u", False)
        assert repo.table.update_item.call_args.kwargs["ExpressionAttributeValues"] == {
            ":approved": False
        }


class TestLocalProvider:
    @pytest.mark.asyncio
    async def test_first_user_is_approved_admin_later_users_pending(self):
        from backend.common.auth.local_provider import LocalAuthProvider

        with patch("backend.common.auth.local_provider.UserRepository") as repo_cls:
            repo = repo_cls.return_value
            repo.create_user.side_effect = lambda **kw: {
                "user_id": "x",
                "email": kw["email"],
                "username": kw["username"],
                "is_admin": kw["is_admin"],
                "is_approved": kw["is_approved"],
            }
            provider = LocalAuthProvider()

            repo.get_user_count.return_value = 0
            first = await provider.register("a@example.com", "admin", "password123")
            repo.get_user_count.return_value = 1
            second = await provider.register("b@example.com", "student", "password123")

        assert first.is_approved and first.role == UserRole.ADMIN
        assert not second.is_approved and second.role == UserRole.USER

    @pytest.mark.asyncio
    async def test_pending_user_cannot_log_in(self):
        from backend.common.auth.local_provider import LocalAuthProvider, _pwd_ctx

        with patch("backend.common.auth.local_provider.UserRepository") as repo_cls:
            repo_cls.return_value.get_user_by_email.return_value = {
                "user_id": "x",
                "email": "b@example.com",
                "password_hash": _pwd_ctx.hash("password123"),
                "is_locked": False,
                "is_approved": False,
            }
            with pytest.raises(ValueError, match="pending approval"):
                await LocalAuthProvider().login("b@example.com", "password123")


class TestAdminEndpoint:
    @pytest.fixture
    def client_as(self):
        from backend.common.auth.dependencies import get_current_user
        from backend.projects.main import app

        def _make(identity):
            app.dependency_overrides[get_current_user] = lambda: identity
            return TestClient(app)

        yield _make
        app.dependency_overrides.clear()

    def test_non_admin_forbidden(self, client_as):
        resp = client_as(_identity(True)).put(
            "/api/admin/users/u-2/approval", json={"is_approved": True}
        )
        assert resp.status_code == 403

    def test_admin_approves(self, client_as):
        with patch("backend.projects.folder_routes._get_user_repo") as get_repo:
            repo = get_repo.return_value
            repo.get_user_by_id.return_value = {
                "user_id": "u-2",
                "email": "s@example.com",
                "username": "s",
                "is_approved": True,
                "simulation_tokens": DEFAULT_STARTER_TOKENS,
            }
            resp = client_as(_identity(True, UserRole.ADMIN)).put(
                "/api/admin/users/u-2/approval", json={"is_approved": True}
            )
        assert resp.status_code == 200
        repo.set_user_approval.assert_called_once_with("u-2", True)

    def test_admin_cannot_change_own_approval(self, client_as):
        resp = client_as(_identity(True, UserRole.ADMIN)).put(
            "/api/admin/users/u-1/approval", json={"is_approved": False}
        )
        assert resp.status_code == 400
