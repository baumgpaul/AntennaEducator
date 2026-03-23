"""Tests for Phase 6: Usage Logging.

Covers:
- UsageLogEntry model
- UserRepository.log_token_usage()
- UserRepository.get_usage_history()
- Token dependency wiring (logs after deduction)
- User usage endpoint
- Admin usage endpoint
"""

from unittest.mock import MagicMock, patch

import pytest

# ── UsageLogEntry model ──────────────────────────────────────────────────────


class TestUsageLogEntry:
    """Tests for the UsageLogEntry dataclass."""

    def test_create_entry(self):
        from backend.common.auth.token_costs import UsageLogEntry

        entry = UsageLogEntry(
            user_id="user-1",
            service="solver",
            endpoint="/api/solve/single",
            cost=5,
            balance_after=95,
            was_flatrate=False,
            timestamp="2025-06-15T12:00:00+00:00",
        )
        assert entry.user_id == "user-1"
        assert entry.service == "solver"
        assert entry.cost == 5
        assert entry.balance_after == 95
        assert entry.was_flatrate is False

    def test_create_flatrate_entry(self):
        from backend.common.auth.token_costs import UsageLogEntry

        entry = UsageLogEntry(
            user_id="user-1",
            service="preprocessor",
            endpoint="/api/mesh/dipole",
            cost=1,
            balance_after=500,
            was_flatrate=True,
            timestamp="2025-06-15T12:00:00+00:00",
        )
        assert entry.was_flatrate is True
        assert entry.balance_after == 500

    def test_entry_to_dict(self):
        from backend.common.auth.token_costs import UsageLogEntry

        entry = UsageLogEntry(
            user_id="user-1",
            service="postprocessor",
            endpoint="/api/postprocess/far-field",
            cost=3,
            balance_after=42,
            was_flatrate=False,
            timestamp="2025-06-15T12:00:00+00:00",
        )
        d = entry.to_dict()
        assert d["Service"] == "postprocessor"
        assert d["Endpoint"] == "/api/postprocess/far-field"
        assert d["Cost"] == 3
        assert d["BalanceAfter"] == 42
        assert d["WasFlatrate"] is False
        assert "Timestamp" in d


# ── UserRepository.log_token_usage ───────────────────────────────────────────


class TestRepositoryUsageLogging:
    """Tests for UserRepository usage logging methods."""

    def _make_repo(self):
        """Create a UserRepository with a mocked DynamoDB table."""
        with patch(
            "backend.common.repositories.user_repository.UserRepository.__init__",
            lambda self: None,
        ):
            from backend.common.repositories.user_repository import UserRepository

            repo = UserRepository()
            repo.table = MagicMock()
            repo.table_name = "test-table"
            return repo

    def test_log_token_usage(self):
        repo = self._make_repo()
        from backend.common.auth.token_costs import UsageLogEntry

        entry = UsageLogEntry(
            user_id="user-1",
            service="solver",
            endpoint="/api/solve/single",
            cost=5,
            balance_after=95,
            was_flatrate=False,
            timestamp="2025-06-15T12:00:00+00:00",
        )
        repo.log_token_usage(entry)

        repo.table.put_item.assert_called_once()
        item = repo.table.put_item.call_args[1]["Item"]
        assert item["PK"] == "USER#user-1"
        assert item["SK"].startswith("USAGE#")
        assert item["EntityType"] == "USAGE"
        assert item["Service"] == "solver"
        assert item["Cost"] == 5
        assert item["BalanceAfter"] == 95
        assert item["WasFlatrate"] is False

    def test_log_flatrate_usage(self):
        repo = self._make_repo()
        from backend.common.auth.token_costs import UsageLogEntry

        entry = UsageLogEntry(
            user_id="user-2",
            service="preprocessor",
            endpoint="/api/mesh/dipole",
            cost=1,
            balance_after=500,
            was_flatrate=True,
            timestamp="2025-06-15T12:00:00+00:00",
        )
        repo.log_token_usage(entry)

        item = repo.table.put_item.call_args[1]["Item"]
        assert item["WasFlatrate"] is True
        assert item["BalanceAfter"] == 500

    def test_get_usage_history_returns_entries(self):
        repo = self._make_repo()

        # Mock DynamoDB query response
        repo.table.query.return_value = {
            "Items": [
                {
                    "PK": "USER#user-1",
                    "SK": "USAGE#2025-06-15T12:00:00+00:00#abc",
                    "EntityType": "USAGE",
                    "Service": "solver",
                    "Endpoint": "/api/solve/single",
                    "Cost": 5,
                    "BalanceAfter": 95,
                    "WasFlatrate": False,
                    "Timestamp": "2025-06-15T12:00:00+00:00",
                },
                {
                    "PK": "USER#user-1",
                    "SK": "USAGE#2025-06-15T11:00:00+00:00#def",
                    "EntityType": "USAGE",
                    "Service": "preprocessor",
                    "Endpoint": "/api/mesh/dipole",
                    "Cost": 1,
                    "BalanceAfter": 100,
                    "WasFlatrate": False,
                    "Timestamp": "2025-06-15T11:00:00+00:00",
                },
            ],
            "Count": 2,
        }

        entries = repo.get_usage_history("user-1", limit=10)

        assert len(entries) == 2
        assert entries[0]["service"] == "solver"
        assert entries[0]["cost"] == 5
        assert entries[1]["service"] == "preprocessor"

        # Verify query was called with correct args
        repo.table.query.assert_called_once()
        call_kwargs = repo.table.query.call_args[1]
        assert call_kwargs["Limit"] == 10
        assert call_kwargs["ScanIndexForward"] is False

    def test_get_usage_history_empty(self):
        repo = self._make_repo()
        repo.table.query.return_value = {"Items": [], "Count": 0}

        entries = repo.get_usage_history("user-1", limit=10)
        assert entries == []

    def test_get_usage_history_default_limit(self):
        repo = self._make_repo()
        repo.table.query.return_value = {"Items": [], "Count": 0}

        repo.get_usage_history("user-1")

        call_kwargs = repo.table.query.call_args[1]
        assert call_kwargs["Limit"] == 50


# ── Token dependency logging integration ─────────────────────────────────────


class TestTokenDependencyLogging:
    """Tests that the token dependency logs usage after deduction."""

    @pytest.mark.asyncio
    async def test_logs_after_successful_deduction(self):
        """After deducting tokens, a usage log entry should be created."""
        from backend.common.auth.token_dependency import _log_usage

        mock_repo = MagicMock()

        with patch(
            "backend.common.repositories.user_repository.UserRepository",
            return_value=mock_repo,
        ):
            _log_usage(
                user_id="user-1",
                service="solver",
                endpoint="/api/solve/single",
                cost=5,
                balance_after=95,
                was_flatrate=False,
            )

            mock_repo.log_token_usage.assert_called_once()

    @pytest.mark.asyncio
    async def test_logs_flatrate_usage(self):
        """Flatrate usage should also be logged (with was_flatrate=True)."""
        from backend.common.auth.token_dependency import _log_usage

        mock_repo = MagicMock()
        with patch(
            "backend.common.repositories.user_repository.UserRepository",
            return_value=mock_repo,
        ):
            _log_usage(
                user_id="user-1",
                service="preprocessor",
                endpoint="/api/mesh/dipole",
                cost=1,
                balance_after=500,
                was_flatrate=True,
            )

            call_args = mock_repo.log_token_usage.call_args[0][0]
            assert call_args.was_flatrate is True

    @pytest.mark.asyncio
    async def test_logging_failure_does_not_raise(self):
        """Usage logging failures should be silently caught (fire-and-forget)."""
        from backend.common.auth.token_dependency import _log_usage

        mock_repo = MagicMock()
        mock_repo.log_token_usage.side_effect = RuntimeError("DynamoDB down")

        with patch(
            "backend.common.repositories.user_repository.UserRepository",
            return_value=mock_repo,
        ):
            # Should NOT raise, just log a warning
            _log_usage(
                user_id="user-1",
                service="solver",
                endpoint="/api/solve/single",
                cost=5,
                balance_after=95,
                was_flatrate=False,
            )


# ── User usage history endpoint ──────────────────────────────────────────────


class TestUserUsageEndpoint:
    """Tests for GET /api/usage (own usage history)."""

    def _get_client(self):
        from fastapi.testclient import TestClient

        from backend.common.auth.dependencies import get_current_user
        from backend.common.auth.identity import UserIdentity, UserRole
        from backend.projects.main import app

        def _mock_user():
            return UserIdentity(
                id="user-1",
                email="t@t.com",
                username="tester",
                role=UserRole.USER,
                simulation_tokens=100,
            )

        app.dependency_overrides[get_current_user] = _mock_user
        return TestClient(app)

    def test_get_own_usage_returns_200(self):
        with patch("backend.projects.folder_routes._get_user_repo") as mock_get_repo:
            mock_repo = MagicMock()
            mock_repo.get_usage_history.return_value = [
                {
                    "service": "solver",
                    "endpoint": "/api/solve/single",
                    "cost": 5,
                    "balance_after": 95,
                    "was_flatrate": False,
                    "timestamp": "2025-06-15T12:00:00+00:00",
                },
            ]
            mock_get_repo.return_value = mock_repo
            client = self._get_client()
            resp = client.get("/api/usage")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 1
            assert data[0]["service"] == "solver"
            assert data[0]["cost"] == 5

        from backend.projects.main import app

        app.dependency_overrides.clear()

    def test_get_own_usage_empty(self):
        with patch("backend.projects.folder_routes._get_user_repo") as mock_get_repo:
            mock_repo = MagicMock()
            mock_repo.get_usage_history.return_value = []
            mock_get_repo.return_value = mock_repo
            client = self._get_client()
            resp = client.get("/api/usage")
            assert resp.status_code == 200
            assert resp.json() == []

        from backend.projects.main import app

        app.dependency_overrides.clear()

    def test_usage_requires_auth(self):
        from fastapi.testclient import TestClient

        from backend.projects.main import app

        app.dependency_overrides.clear()
        client = TestClient(app)
        resp = client.get("/api/usage")
        assert resp.status_code == 401


# ── Admin usage history endpoint ─────────────────────────────────────────────


class TestAdminUsageEndpoint:
    """Tests for GET /api/admin/users/{user_id}/usage."""

    def _get_admin_client(self):
        from fastapi.testclient import TestClient

        from backend.common.auth.dependencies import get_current_user
        from backend.common.auth.identity import UserIdentity, UserRole
        from backend.projects.main import app

        def _mock_admin():
            return UserIdentity(
                id="admin-1",
                email="admin@t.com",
                username="admin",
                role=UserRole.ADMIN,
                simulation_tokens=9999,
            )

        app.dependency_overrides[get_current_user] = _mock_admin
        return TestClient(app)

    def test_admin_gets_user_usage(self):
        with patch("backend.projects.folder_routes._get_user_repo") as mock_get_repo:
            mock_repo = MagicMock()
            mock_repo.get_usage_history.return_value = [
                {
                    "service": "solver",
                    "endpoint": "/api/solve/single",
                    "cost": 5,
                    "balance_after": 95,
                    "was_flatrate": False,
                    "timestamp": "2025-06-15T12:00:00+00:00",
                },
            ]
            mock_get_repo.return_value = mock_repo
            client = self._get_admin_client()
            resp = client.get("/api/admin/users/user-1/usage")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 1

            # Verify it queried the right user ID
            mock_repo.get_usage_history.assert_called_once()
            call_args = mock_repo.get_usage_history.call_args
            assert call_args[0][0] == "user-1"

        from backend.projects.main import app

        app.dependency_overrides.clear()

    def test_non_admin_gets_403(self):
        from fastapi.testclient import TestClient

        from backend.common.auth.dependencies import get_current_user
        from backend.common.auth.identity import UserIdentity, UserRole
        from backend.projects.main import app

        def _mock_user():
            return UserIdentity(
                id="user-1",
                email="t@t.com",
                username="tester",
                role=UserRole.USER,
                simulation_tokens=100,
            )

        app.dependency_overrides[get_current_user] = _mock_user
        client = TestClient(app)
        resp = client.get("/api/admin/users/user-2/usage")
        assert resp.status_code == 403
        app.dependency_overrides.clear()

    def test_admin_usage_with_limit(self):
        with patch("backend.projects.folder_routes._get_user_repo") as mock_get_repo:
            mock_repo = MagicMock()
            mock_repo.get_usage_history.return_value = []
            mock_get_repo.return_value = mock_repo
            client = self._get_admin_client()
            resp = client.get("/api/admin/users/user-1/usage?limit=5")
            assert resp.status_code == 200

            call_kwargs = mock_repo.get_usage_history.call_args
            assert call_kwargs[1]["limit"] == 5

        from backend.projects.main import app

        app.dependency_overrides.clear()
