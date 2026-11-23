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

    def test_set_user_tokens_is_in_the_new_units(self, repo):
        """An admin-set balance is stamped, so the scheme conversion never scales it."""
        repo.set_user_tokens("user-1", 1000)
        values = repo.table.update_item.call_args[1]["ExpressionAttributeValues"]
        assert values[":scheme"] == "gbs-v1"

    def test_charge_user_tokens_success(self, repo):
        """charge_user_tokens deducts conditionally when the balance covers the cost."""
        repo.table.update_item.return_value = {"Attributes": {"SimulationTokens": Decimal("95")}}
        assert repo.charge_user_tokens("user-1", 5) == (5, 95)
        call_kwargs = repo.table.update_item.call_args[1]
        assert call_kwargs["ConditionExpression"] == "SimulationTokens >= :cost"

    def test_charge_user_tokens_empties_a_short_balance(self, repo):
        """Compute already done: a balance of 3 pays 3 of 5 and ends at 0, never negative."""
        from botocore.exceptions import ClientError

        failed = ClientError(
            {"Error": {"Code": "ConditionalCheckFailedException", "Message": ""}}, "UpdateItem"
        )
        repo.table.update_item.side_effect = [failed, None]
        repo.table.get_item.return_value = {"Item": {"SimulationTokens": Decimal("3")}}
        assert repo.charge_user_tokens("user-1", 5) == (3, 0)
        second = repo.table.update_item.call_args_list[1][1]
        assert second["ExpressionAttributeValues"] == {":zero": 0, ":balance": 3}
        assert second["ConditionExpression"] == "SimulationTokens = :balance"

    def test_charge_user_tokens_on_an_empty_balance_charges_nothing(self, repo):
        from botocore.exceptions import ClientError

        repo.table.update_item.side_effect = ClientError(
            {"Error": {"Code": "ConditionalCheckFailedException", "Message": ""}}, "UpdateItem"
        )
        repo.table.get_item.return_value = {"Item": {"SimulationTokens": Decimal("0")}}
        assert repo.charge_user_tokens("user-1", 5) == (0, 0)

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


class TestTokenSchemeConversion:
    """Existing balances move once to the metered scheme (TokenScheme = gbs-v1)."""

    @pytest.fixture
    def repo(self):
        from backend.common.repositories.user_repository import UserRepository

        with patch("backend.common.repositories.user_repository.boto3"):
            repo = UserRepository()
            repo.table = MagicMock()
            return repo

    @staticmethod
    def _user(uid, tokens, approved=True, scheme=None):
        item = {"PK": f"USER#{uid}", "SK": "METADATA", "SimulationTokens": Decimal(tokens)}
        item["IsApproved"] = approved
        if scheme:
            item["TokenScheme"] = scheme
        return item

    def test_converts_approved_stamps_pending_skips_converted(self, repo):
        repo.table.scan.return_value = {
            "Items": [
                self._user("old", 488),
                self._user("pending", 0, approved=False),
                self._user("done", 30_000, scheme="gbs-v1"),
                self._user("topped-up", 2000),
            ]
        }
        counts = repo.convert_token_balances()
        assert counts == {"converted": 2, "stamped": 1, "skipped": 0}
        updates = {
            c[1]["Key"]["PK"]: c[1]["ExpressionAttributeValues"][":new"]
            for c in repo.table.update_item.call_args_list
        }
        # 488 old tokens → max(30 000, 488 × 60); pending stays 0; already converted untouched
        assert updates == {"USER#old": 30_000, "USER#pending": 0, "USER#topped-up": 120_000}

    def test_is_conditional_on_the_balance_read(self, repo):
        repo.table.scan.return_value = {"Items": [self._user("old", 488)]}
        repo.convert_token_balances()
        kwargs = repo.table.update_item.call_args[1]
        assert ":old" in kwargs["ExpressionAttributeValues"]
        assert "SimulationTokens = :old" in kwargs["ConditionExpression"]

    def test_balance_changed_meanwhile_is_skipped_for_the_next_run(self, repo):
        from botocore.exceptions import ClientError

        repo.table.scan.return_value = {"Items": [self._user("busy", 100)]}
        repo.table.update_item.side_effect = ClientError(
            {"Error": {"Code": "ConditionalCheckFailedException", "Message": ""}}, "UpdateItem"
        )
        assert repo.convert_token_balances() == {"converted": 0, "stamped": 0, "skipped": 1}

    def test_new_accounts_start_in_the_new_scheme(self, repo):
        repo.table.get_item.return_value = {}
        repo.table.scan.return_value = {"Items": []}
        repo.create_user("n@uni.example", "n", "hash", is_approved=True)
        user_item = repo.table.put_item.call_args_list[-1][1]["Item"]
        assert user_item["TokenScheme"] == "gbs-v1"
        assert user_item["SimulationTokens"] == 30_000
