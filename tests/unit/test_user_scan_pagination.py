"""User lookups must read every page of a DynamoDB scan.

A scan returns at most 1 MB per call. The single table holds users, projects,
usage logs, ... so once it grows, users end up on later pages: the admin list
lost them (pending accounts could not be approved), the e-mail lookup missed
them (login failed) and the user count read 0 ("first user becomes admin").
"""

from unittest.mock import MagicMock, patch

import pytest

from backend.common.repositories.user_repository import email_claim_key


def _user_item(user_id: str, email: str) -> dict:
    return {
        "PK": f"USER#{user_id}",
        "SK": "METADATA",
        "EntityType": "USER",
        "UserId": user_id,
        "Email": email,
        "Username": email.split("@")[0],
        "IsAdmin": False,
        "IsLocked": False,
        "IsApproved": True,
        "Role": "user",
        "CreatedAt": "2026-01-01",
    }


def _paged(*pages: list) -> list:
    """scan() responses: all but the last page carry a LastEvaluatedKey."""
    out = []
    for i, items in enumerate(pages):
        resp = {"Items": items, "Count": len(items)}
        if i < len(pages) - 1:
            resp["LastEvaluatedKey"] = {"PK": f"page{i}", "SK": "x"}
        out.append(resp)
    return out


@pytest.fixture
def repo():
    from backend.common.repositories.user_repository import UserRepository

    with patch("backend.common.repositories.user_repository.boto3"):
        repo = UserRepository()
    repo.table = MagicMock()
    repo.table.get_item.return_value = {}  # no e-mail claim (legacy account)
    return repo


def test_email_lookup_reads_later_pages(repo):
    repo.table.scan.side_effect = _paged([], [], [_user_item("u9", "late@uni.example")])
    user = repo.get_user_by_email("late@uni.example")
    assert user is not None and user["user_id"] == "u9"
    assert repo.table.scan.call_count == 3
    assert repo.table.scan.call_args_list[2].kwargs["ExclusiveStartKey"] == {
        "PK": "page1",
        "SK": "x",
    }


def test_email_lookup_uses_the_claim_without_scanning(repo):
    claim = {**email_claim_key("ada@uni.example"), "EntityType": "EMAIL_CLAIM", "UserId": "u1"}
    user = _user_item("u1", "ada@uni.example")
    repo.table.get_item.side_effect = lambda Key: (
        {"Item": claim} if Key == email_claim_key("ada@uni.example") else {"Item": user}
    )
    assert repo.get_user_by_email("Ada@Uni.example")["user_id"] == "u1"
    repo.table.scan.assert_not_called()


def test_user_count_sums_all_pages(repo):
    repo.table.scan.side_effect = _paged([], [_user_item("u1", "a@x")], [_user_item("u2", "b@x")])
    assert repo.get_user_count() == 2


def test_user_count_fails_closed(repo):
    """A read error must not look like an empty table: register() makes the
    first user an approved admin when the count is 0."""
    from botocore.exceptions import ClientError

    repo.table.scan.side_effect = ClientError(
        {"Error": {"Code": "ProvisionedThroughputExceededException"}}, "Scan"
    )
    with pytest.raises(RuntimeError):
        repo.get_user_count()


def test_list_users_returns_users_from_all_pages(repo):
    repo.table.scan.side_effect = _paged(
        [_user_item("u1", "a@x")], [], [_user_item("u2", "b@x"), _user_item("u3", "c@x")]
    )
    assert [u["user_id"] for u in repo.list_users()] == ["u1", "u2", "u3"]
