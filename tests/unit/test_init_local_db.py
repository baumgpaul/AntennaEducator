"""Tests for scripts/init_local_db.py — idempotent local DB bootstrap.

Uses unittest.mock to replace boto3 and password hashing so no real DynamoDB
connection is needed.  All tests verify behaviour, not implementation
detail (the public API of ``init_local_db``).
"""

import importlib
import importlib.util
import pathlib
import sys
from unittest.mock import MagicMock, patch

import pytest

_SCRIPT_PATH = pathlib.Path(__file__).parent.parent.parent / "scripts" / "init_local_db.py"


# ---------------------------------------------------------------------------
# Helpers — build the minimal boto3 stub the module needs
# ---------------------------------------------------------------------------


def _make_boto3_stub(table_exists: bool = False, user_exists: bool = False):
    """Return a boto3 stub whose Table behaves as requested."""

    table_mock = MagicMock()

    if table_exists:
        # table.load() succeeds → table already exists
        table_mock.load.return_value = None
    else:
        from botocore.exceptions import ClientError

        error = ClientError(
            {"Error": {"Code": "ResourceNotFoundException", "Message": "Table not found"}},
            "DescribeTable",
        )
        table_mock.load.side_effect = error

    # get_item returns existing user or empty
    if user_exists:
        table_mock.get_item.return_value = {
            "Item": {"PK": "USER#existing-id", "email": "admin@example.com"}
        }
    else:
        table_mock.get_item.return_value = {}

    # scan returns a user count
    table_mock.scan.return_value = {"Count": 1 if user_exists else 0}

    boto3_stub = MagicMock()
    resource_mock = MagicMock()
    resource_mock.Table.return_value = table_mock
    resource_mock.create_table.return_value = table_mock
    boto3_stub.resource.return_value = resource_mock

    waiter_mock = MagicMock()
    client_mock = MagicMock()
    client_mock.get_waiter.return_value = waiter_mock
    boto3_stub.client.return_value = client_mock

    return boto3_stub, table_mock, client_mock, waiter_mock


def _import_module():
    """Force a fresh load of scripts/init_local_db.py from file path."""
    mod_name = "scripts.init_local_db"
    if mod_name in sys.modules:
        del sys.modules[mod_name]
    spec = importlib.util.spec_from_file_location(mod_name, _SCRIPT_PATH)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[mod_name] = mod
    spec.loader.exec_module(mod)
    return mod


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def env_vars(monkeypatch):
    """Set required environment variables for all tests."""
    monkeypatch.setenv("DYNAMODB_ENDPOINT_URL", "http://localhost:8000")
    monkeypatch.setenv("DYNAMODB_TABLE_NAME", "antenna-simulator-local")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "dummy")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "dummy")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "eu-west-1")
    monkeypatch.setenv("ADMIN_EMAIL", "admin@test.example")
    monkeypatch.setenv("ADMIN_PASSWORD", "admin-password-123")


# ---------------------------------------------------------------------------
# ensure_table_exists
# ---------------------------------------------------------------------------


class TestEnsureTableExists:
    def test_skips_creation_when_table_already_exists(self, env_vars):
        boto3_stub, table_mock, client_mock, waiter_mock = _make_boto3_stub(table_exists=True)
        with patch.dict("sys.modules", {"boto3": boto3_stub}):
            mod = _import_module()
            mod.ensure_table_exists()

        resource_mock = boto3_stub.resource.return_value
        resource_mock.create_table.assert_not_called()
        waiter_mock.wait.assert_not_called()

    def test_creates_table_when_missing(self, env_vars):
        boto3_stub, table_mock, client_mock, waiter_mock = _make_boto3_stub(table_exists=False)
        with patch.dict("sys.modules", {"boto3": boto3_stub}):
            mod = _import_module()
            mod.ensure_table_exists()

        resource_mock = boto3_stub.resource.return_value
        resource_mock.create_table.assert_called_once()
        # Waiter must be used to confirm the table is active
        waiter_mock.wait.assert_called_once()

    def test_created_table_has_correct_gsi(self, env_vars):
        boto3_stub, table_mock, client_mock, waiter_mock = _make_boto3_stub(table_exists=False)
        with patch.dict("sys.modules", {"boto3": boto3_stub}):
            mod = _import_module()
            mod.ensure_table_exists()

        resource_mock = boto3_stub.resource.return_value
        _, kwargs = resource_mock.create_table.call_args
        gsi_names = [g["IndexName"] for g in kwargs.get("GlobalSecondaryIndexes", [])]
        assert "GSI1" in gsi_names, "GSI1 must be present for project lookups"

    def test_created_table_uses_correct_name(self, env_vars):
        boto3_stub, table_mock, client_mock, waiter_mock = _make_boto3_stub(table_exists=False)
        with patch.dict("sys.modules", {"boto3": boto3_stub}):
            mod = _import_module()
            mod.ensure_table_exists()

        resource_mock = boto3_stub.resource.return_value
        _, kwargs = resource_mock.create_table.call_args
        assert kwargs["TableName"] == "antenna-simulator-local"


# ---------------------------------------------------------------------------
# seed_admin_user
# ---------------------------------------------------------------------------


@pytest.fixture
def user_repo():
    """The backend's UserRepository on an in-memory fake table."""
    from backend.common.repositories.user_repository import UserRepository

    with patch("backend.common.repositories.user_repository.boto3"):
        repo = UserRepository()
    items = {}

    def put_item(Item, ConditionExpression=None):
        items[(Item["PK"], Item["SK"])] = Item

    repo.table = MagicMock()
    repo.table.put_item.side_effect = put_item
    repo.table.get_item.side_effect = lambda Key: (
        {"Item": items[(Key["PK"], Key["SK"])]} if (Key["PK"], Key["SK"]) in items else {}
    )

    def scan(**kwargs):
        # Only the user-by-e-mail filter is needed: "Email = :email AND SK = :sk"
        values = kwargs.get("ExpressionAttributeValues", {})
        hits = [
            i
            for i in items.values()
            if i.get("Email") == values.get(":email") and i["SK"] == values.get(":sk")
        ]
        return {"Items": hits, "Count": len(hits)}

    repo.table.scan.side_effect = scan
    repo.items = items
    return repo


def _seed(mod_env, repo):
    boto3_stub, *_ = _make_boto3_stub(table_exists=True)
    with patch.dict("sys.modules", {"boto3": boto3_stub}):
        mod = _import_module()
        with patch.object(mod, "_user_repository", return_value=repo):
            mod.seed_admin_user()


class TestSeedAdminUser:
    def test_seeded_admin_can_log_in(self, env_vars, user_repo):
        """The login lookup finds the seeded account and its password verifies.

        The script used to write its own item (SK "USER#…", lower-case "email")
        that the backend never reads, so the admin from .env could not log in.
        """
        from backend.common.auth.local_provider import verify_password

        _seed(env_vars, user_repo)

        user = user_repo.get_user_by_email("admin@test.example")
        assert user is not None
        assert user["is_admin"] is True
        assert user["role"] == "admin"
        assert user["is_approved"] is True
        assert verify_password("admin-password-123", user["password_hash"])

    def test_skips_if_admin_already_exists(self, env_vars, user_repo):
        _seed(env_vars, user_repo)
        writes = user_repo.table.put_item.call_count
        _seed(env_vars, user_repo)
        assert user_repo.table.put_item.call_count == writes

    def test_uses_env_credentials(self, env_vars, monkeypatch, user_repo):
        monkeypatch.setenv("ADMIN_EMAIL", "custom@example.com")
        _seed(env_vars, user_repo)
        assert user_repo.get_user_by_email("custom@example.com") is not None

    def test_missing_admin_email_raises(self, env_vars, monkeypatch):
        monkeypatch.delenv("ADMIN_EMAIL", raising=False)
        monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
        boto3_stub, table_mock, client_mock, waiter_mock = _make_boto3_stub(table_exists=True)
        with patch.dict("sys.modules", {"boto3": boto3_stub}):
            mod = _import_module()
            with pytest.raises((SystemExit, ValueError)):
                mod.seed_admin_user()


# ---------------------------------------------------------------------------
# ensure_minio_bucket
# ---------------------------------------------------------------------------


class TestEnsureMinIOBucket:
    def test_skips_if_bucket_exists(self, env_vars, monkeypatch):
        monkeypatch.setenv("S3_ENDPOINT_URL", "http://localhost:9000")
        monkeypatch.setenv("RESULTS_BUCKET_NAME", "antenna-simulator-results-local")
        monkeypatch.setenv("AWS_ACCESS_KEY_ID", "minioadmin")
        monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "minioadmin")

        boto3_stub = MagicMock()
        s3_client = MagicMock()
        boto3_stub.client.return_value = s3_client
        # head_bucket succeeds → bucket exists
        s3_client.head_bucket.return_value = {}

        with patch.dict("sys.modules", {"boto3": boto3_stub}):
            mod = _import_module()
            mod.ensure_minio_bucket()

        s3_client.create_bucket.assert_not_called()

    def test_creates_bucket_when_missing(self, env_vars, monkeypatch):
        monkeypatch.setenv("S3_ENDPOINT_URL", "http://localhost:9000")
        monkeypatch.setenv("RESULTS_BUCKET_NAME", "antenna-simulator-results-local")
        monkeypatch.setenv("AWS_ACCESS_KEY_ID", "minioadmin")
        monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "minioadmin")

        from botocore.exceptions import ClientError

        boto3_stub = MagicMock()
        s3_client = MagicMock()
        boto3_stub.client.return_value = s3_client
        s3_client.head_bucket.side_effect = ClientError(
            {"Error": {"Code": "404", "Message": "Not Found"}}, "HeadBucket"
        )

        with patch.dict("sys.modules", {"boto3": boto3_stub}):
            mod = _import_module()
            mod.ensure_minio_bucket()

        s3_client.create_bucket.assert_called_once()

    def test_noop_when_no_s3_endpoint(self, env_vars, monkeypatch):
        monkeypatch.delenv("S3_ENDPOINT_URL", raising=False)
        boto3_stub = MagicMock()
        with patch.dict("sys.modules", {"boto3": boto3_stub}):
            mod = _import_module()
            mod.ensure_minio_bucket()  # should not raise

        boto3_stub.client.assert_not_called()


# ---------------------------------------------------------------------------
# run_all (integration-level smoke test)
# ---------------------------------------------------------------------------


class TestRunAll:
    def test_run_all_calls_all_steps(self, env_vars, monkeypatch):
        monkeypatch.setenv("S3_ENDPOINT_URL", "http://localhost:9000")
        monkeypatch.setenv("RESULTS_BUCKET_NAME", "antenna-simulator-results-local")
        boto3_stub, table_mock, client_mock, waiter_mock = _make_boto3_stub(
            table_exists=True, user_exists=True
        )
        boto3_stub.client.return_value = MagicMock()
        boto3_stub.client.return_value.head_bucket.return_value = {}

        with patch.dict("sys.modules", {"boto3": boto3_stub}):
            mod = _import_module()
            with (
                patch.object(mod, "ensure_table_exists") as t,
                patch.object(mod, "seed_admin_user") as a,
                patch.object(mod, "ensure_minio_bucket") as m,
            ):
                mod.run_all()

        t.assert_called_once()
        a.assert_called_once()
        m.assert_called_once()
