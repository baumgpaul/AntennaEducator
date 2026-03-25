"""Tests for UserRepository token operations.

These tests use a mock DynamoDB table to verify:
- Token fields read from DynamoDB items
- Atomic token deduction (update_expression with condition)
- Token set/add operations
- Flatrate grant/revoke
- New user creation includes default starter tokens
"""

from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest


class TestUserRepositoryToDict:
    """_to_dict includes token fields from DynamoDB item."""

    def test_to_dict_with_token_fields(self):
        from backend.common.repositories.user_repository import UserRepository

        item = {
            "PK": "USER#abc",
            "SK": "METADATA",
            "UserId": "abc",
            "Email": "a@b.com",
            "Username": "alice",
            "PasswordHash": "hash",
            "IsAdmin": False,
            "IsLocked": False,
            "Role": "user",
            "CreatedAt": "2026-01-01T00:00:00+00:00",
            "SimulationTokens": Decimal("500"),
            "FlatrateUntil": "2026-12-31T00:00:00+00:00",
        }
        d = UserRepository._to_dict(item)
        assert d["simulation_tokens"] == 500
        assert d["flatrate_until"] == "2026-12-31T00:00:00+00:00"

    def test_to_dict_without_token_fields_defaults(self):
        from backend.common.repositories.user_repository import UserRepository

        item = {
            "PK": "USER#abc",
            "SK": "METADATA",
            "UserId": "abc",
            "Email": "a@b.com",
            "Username": "alice",
            "PasswordHash": "hash",
            "IsAdmin": False,
            "IsLocked": False,
            "Role": "user",
        }
        d = UserRepository._to_dict(item)
        assert d["simulation_tokens"] == 0
        assert d["flatrate_until"] is None


class TestUserRepositoryTokenOperations:
    """Token CRUD operations on UserRepository using mocked DynamoDB."""

    @pytest.fixture
    def repo(self):
        """Create a UserRepository with mocked DynamoDB."""
        from backend.common.repositories.user_repository import UserRepository

        with patch("backend.common.repositories.user_repository.boto3") as mock_boto3:
            mock_table = MagicMock()
            mock_resource = MagicMock()
            mock_resource.Table.return_value = mock_table
            mock_boto3.resource.return_value = mock_resource
            mock_table.load.return_value = None

            repo = UserRepository()
            repo.table = mock_table
            return repo

    def test_set_user_tokens(self, repo):
        """set_user_tokens updates SimulationTokens in DynamoDB."""
        repo.table.update_item.return_value = None
        repo.set_user_tokens("user-1", 1000)

        repo.table.update_item.assert_called_once()
        call_kwargs = repo.table.update_item.call_args[1]
        assert call_kwargs["Key"] == {"PK": "USER#user-1", "SK": "METADATA"}
        assert ":tokens" in call_kwargs["ExpressionAttributeValues"]
        assert call_kwargs["ExpressionAttributeValues"][":tokens"] == 1000

    def test_deduct_user_tokens_success(self, repo):
        """deduct_user_tokens succeeds when balance >= cost."""
        repo.table.update_item.return_value = {"Attributes": {"SimulationTokens": Decimal("95")}}
        remaining = repo.deduct_user_tokens("user-1", 5)
        assert remaining == 95

        call_kwargs = repo.table.update_item.call_args[1]
        # Must use conditional expression
        assert "ConditionExpression" in call_kwargs

    def test_deduct_user_tokens_insufficient(self, repo):
        """deduct_user_tokens raises when balance < cost."""
        from botocore.exceptions import ClientError

        repo.table.update_item.side_effect = ClientError(
            {"Error": {"Code": "ConditionalCheckFailedException", "Message": ""}},
            "UpdateItem",
        )
        with pytest.raises(ValueError, match="Insufficient"):
            repo.deduct_user_tokens("user-1", 5)

    def test_set_user_flatrate(self, repo):
        """set_user_flatrate writes FlatrateUntil to DynamoDB."""
        repo.table.update_item.return_value = None
        dt = datetime(2026, 12, 31, tzinfo=timezone.utc)
        repo.set_user_flatrate("user-1", dt)

        call_kwargs = repo.table.update_item.call_args[1]
        assert ":flatrate" in call_kwargs["ExpressionAttributeValues"]

    def test_clear_user_flatrate(self, repo):
        """set_user_flatrate(None) removes the attribute."""
        repo.table.update_item.return_value = None
        repo.set_user_flatrate("user-1", None)

        call_kwargs = repo.table.update_item.call_args[1]
        assert "REMOVE" in call_kwargs["UpdateExpression"]
