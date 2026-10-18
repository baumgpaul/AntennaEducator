"""GDPR retention: last-activity tracking and the daily cleanup."""

from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from botocore.exceptions import ClientError

from backend.common.auth.activity import record_activity
from backend.projects.retention import run_retention

TODAY = date(2026, 10, 18)


class FakeTable:
    def __init__(self, items):
        self.items = {(i["PK"], i["SK"]): dict(i) for i in items}

    def scan(self, FilterExpression, **_):
        # Evaluate the boto3 condition tree on plain dicts (eq / begins_with / lt / And)
        def ok(cond, item):
            name = type(cond).__name__
            if name == "And":
                return all(ok(c, item) for c in cond._values)
            attr, value = cond._values[0].name, cond._values[1]
            have = item.get(attr)
            if have is None:
                return False
            return {
                "Equals": have == value,
                "BeginsWith": str(have).startswith(value),
                "LessThan": have < value,
            }[name]

        return {"Items": [i for i in self.items.values() if ok(FilterExpression, i)]}

    def update_item(self, Key, ExpressionAttributeValues, **_):
        self.items[(Key["PK"], Key["SK"])]["LastSeenAt"] = ExpressionAttributeValues[":today"]

    def query(self, KeyConditionExpression, **_):
        pk = KeyConditionExpression.get_expression()["values"][1]
        return {"Items": [i for (p, _s), i in self.items.items() if p == pk]}

    def batch_writer(self):
        table = self

        class _Batch:
            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def delete_item(self, Key):
                table.items.pop((Key["PK"], Key["SK"]), None)

        return _Batch()


def _user(uid, last_seen=None, role="user"):
    item = {"PK": f"USER#{uid}", "SK": "METADATA", "Email": f"{uid}@x.example", "Role": role}
    if last_seen:
        item["LastSeenAt"] = last_seen
    return item


def _services():
    results, docs, auth = AsyncMock(), AsyncMock(), AsyncMock()
    results.delete_results.return_value = 0
    docs.delete_all.return_value = 0
    return results, docs, auth


@pytest.mark.asyncio
async def test_deletes_accounts_inactive_for_a_year():
    table = FakeTable(
        [
            _user("old", "2025-10-17"),
            {"PK": "USER#old", "SK": "PROJECT#p1"},
            _user("recent", "2025-10-19"),
        ]
    )
    results, docs, auth = _services()

    counts = await run_retention(table, results, docs, auth, today=TODAY)

    assert counts["accounts_deleted"] == 1
    assert ("USER#old", "METADATA") not in table.items
    assert ("USER#old", "PROJECT#p1") not in table.items
    assert ("USER#recent", "METADATA") in table.items
    (call,) = auth.delete_identity.await_args_list
    assert call.args[0].email == "old@x.example"


@pytest.mark.asyncio
async def test_admins_and_maintainers_are_kept():
    table = FakeTable(
        [_user("a", "2020-01-01", role="admin"), _user("m", "2020-01-01", role="maintainer")]
    )
    counts = await run_retention(table, *_services(), today=TODAY)
    assert counts["accounts_deleted"] == 0
    assert len(table.items) == 2


@pytest.mark.asyncio
async def test_accounts_without_activity_start_their_clock():
    """Created before tracking existed: never deleted on the first run."""
    table = FakeTable([_user("legacy")])
    counts = await run_retention(table, *_services(), today=TODAY)
    assert counts == {"accounts_deleted": 0, "clocks_started": 1, "submissions_deleted": 0}
    assert table.items[("USER#legacy", "METADATA")]["LastSeenAt"] == "2026-10-18"


@pytest.mark.asyncio
async def test_deletes_submissions_older_than_a_year():
    table = FakeTable(
        [
            _user("s", "2026-10-01"),
            {"PK": "COURSE#c", "SK": "SUBMISSION#old", "UserId": "s", "SubmittedAt": "2025-01-01"},
            {"PK": "USER#s", "SK": "SUBMISSION#old", "UserId": "s", "SubmittedAt": "2025-01-01"},
            {"PK": "COURSE#c", "SK": "SUBMISSION#new", "UserId": "s", "SubmittedAt": "2026-09-01"},
        ]
    )
    results, docs, auth = _services()

    counts = await run_retention(table, results, docs, auth, today=TODAY)

    assert counts["submissions_deleted"] == 1
    assert ("COURSE#c", "SUBMISSION#old") not in table.items
    assert ("USER#s", "SUBMISSION#old") not in table.items
    assert ("COURSE#c", "SUBMISSION#new") in table.items
    results.delete_results.assert_awaited_once_with("submission-old")


# ── Activity tracking ─────────────────────────────────────────────────────────


def test_record_activity_writes_todays_date_conditionally():
    table = MagicMock()
    record_activity("u1", today="2026-10-18", table=table)
    kwargs = table.update_item.call_args.kwargs
    assert kwargs["Key"] == {"PK": "USER#u1", "SK": "METADATA"}
    assert kwargs["ExpressionAttributeValues"] == {":today": "2026-10-18"}
    assert "LastSeenAt < :today" in kwargs["ConditionExpression"]


def test_record_activity_never_raises():
    table = MagicMock()
    table.update_item.side_effect = ClientError(
        {"Error": {"Code": "ConditionalCheckFailedException"}}, "UpdateItem"
    )
    record_activity("u1", table=table)  # already recorded today
    table.update_item.side_effect = RuntimeError("network")
    record_activity("u1", table=table)


def test_record_activity_disabled_without_table_in_tests():
    with patch("backend.common.auth.activity._get_table") as get_table:
        record_activity("u1")
    get_table.assert_not_called()


# ── Lambda entry point ────────────────────────────────────────────────────────


def test_scheduled_event_runs_retention_not_http():
    from backend.projects import lambda_handler

    with (
        patch.object(lambda_handler, "_run_retention", AsyncMock(return_value={"ok": 1})),
        patch.object(lambda_handler, "_http_handler") as http,
    ):
        assert lambda_handler.handler({"source": "aws.events"}, None) == {"ok": 1}
    http.assert_not_called()
