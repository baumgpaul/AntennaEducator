"""B46: two registrations with the same e-mail — exactly one wins."""

from unittest.mock import MagicMock, patch

import pytest
from botocore.exceptions import ClientError

from backend.common.repositories.user_repository import email_claim_key


@pytest.fixture
def repo():
    from backend.common.repositories.user_repository import UserRepository

    with patch("backend.common.repositories.user_repository.boto3"):
        repo = UserRepository()
    repo.table = MagicMock()
    repo.table.scan.return_value = {"Items": []}  # neither request sees the other
    return repo


def _conditional_failure():
    return ClientError({"Error": {"Code": "ConditionalCheckFailedException"}}, "PutItem")


def test_claim_is_conditional_and_case_insensitive(repo):
    repo.create_user(email="Ada@Uni.example", username="ada", password_hash="h")
    claim_call = repo.table.put_item.call_args_list[0].kwargs
    assert claim_call["Item"]["PK"] == "EMAIL#ada@uni.example"
    assert claim_call["ConditionExpression"] == "attribute_not_exists(PK)"


def test_second_registration_loses(repo):
    claimed = set()

    def put_item(Item, ConditionExpression=None):
        if ConditionExpression:
            if Item["PK"] in claimed:
                raise _conditional_failure()
            claimed.add(Item["PK"])

    repo.table.put_item.side_effect = put_item
    repo.create_user(email="ada@uni.example", username="ada", password_hash="h")
    with pytest.raises(ValueError, match="already registered"):
        repo.create_user(email="ADA@uni.example", username="ada2", password_hash="h")


def test_claim_released_when_user_write_fails(repo):
    def put_item(Item, ConditionExpression=None):
        if Item["SK"] == "METADATA":
            raise ClientError({"Error": {"Code": "InternalServerError"}}, "PutItem")

    repo.table.put_item.side_effect = put_item
    with pytest.raises(RuntimeError):
        repo.create_user(email="ada@uni.example", username="ada", password_hash="h")
    repo.table.delete_item.assert_called_once_with(Key=email_claim_key("ada@uni.example"))
