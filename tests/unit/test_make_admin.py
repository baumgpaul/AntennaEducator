"""Bootstrap the first admin (TEST_PLAN B3)."""

from unittest.mock import MagicMock

import pytest

from backend.common.auth.token_costs import DEFAULT_STARTER_TOKENS
from dev_tools.make_admin import make_admin


def _table(items, pages=None):
    table = MagicMock()
    table.scan.side_effect = pages or [{"Items": items}]
    return table


def test_promotes_pending_user_to_approved_admin():
    table = _table([{"PK": "USER#u1", "UserId": "u1", "SimulationTokens": 0}])
    make_admin(table, "boss@example.com")
    values = table.update_item.call_args.kwargs["ExpressionAttributeValues"]
    assert values[":admin"] == "admin"
    assert values[":true"] is True
    assert values[":tokens"] == DEFAULT_STARTER_TOKENS
    assert table.update_item.call_args.kwargs["Key"] == {"PK": "USER#u1", "SK": "METADATA"}


def test_finds_user_on_a_later_scan_page():
    table = _table(
        [],
        pages=[
            {"Items": [], "LastEvaluatedKey": {"PK": "x"}},
            {"Items": [{"PK": "USER#u2", "UserId": "u2", "SimulationTokens": 500}]},
        ],
    )
    make_admin(table, "boss@example.com")
    assert table.update_item.call_args.kwargs["ExpressionAttributeValues"][":tokens"] == max(
        500, DEFAULT_STARTER_TOKENS
    )


def test_unknown_email_raises():
    with pytest.raises(LookupError, match="No user"):
        make_admin(_table([]), "nobody@example.com")
