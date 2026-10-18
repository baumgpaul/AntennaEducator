"""Last-activity tracking for the inactive-account retention rule.

Login happens in the browser (Cognito SDK), so the backend never sees it;
instead every authenticated API use counts. ``LastSeenAt`` (ISO date) on the
``USER#{id}/METADATA`` item is written at most once per user per day, and
only on a profile-cache miss. Failures never affect the request.
"""

import logging
import os
from datetime import date
from typing import Optional

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

_table = None


def _enabled() -> bool:
    return os.getenv("TRACK_USER_ACTIVITY", "true").lower() != "false"


def _get_table():
    global _table
    if _table is None:
        endpoint = os.getenv("DYNAMODB_ENDPOINT_URL")
        resource = (
            boto3.resource("dynamodb", endpoint_url=endpoint)
            if endpoint
            else boto3.resource("dynamodb")
        )
        _table = resource.Table(os.getenv("DYNAMODB_TABLE_NAME", "antenna-simulator-staging"))
    return _table


def record_activity(user_id: str, today: Optional[str] = None, table=None) -> None:
    """Set LastSeenAt to today unless it already is (one write per day)."""
    if table is None:
        if not _enabled():
            return
        table = _get_table()
    today = today or date.today().isoformat()
    try:
        table.update_item(
            Key={"PK": f"USER#{user_id}", "SK": "METADATA"},
            UpdateExpression="SET LastSeenAt = :today",
            ConditionExpression=(
                "attribute_exists(PK) AND "
                "(attribute_not_exists(LastSeenAt) OR LastSeenAt < :today)"
            ),
            ExpressionAttributeValues={":today": today},
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
            logger.warning("Could not record activity for %s: %s", user_id, exc)
    except Exception as exc:  # never break a request over bookkeeping
        logger.warning("Could not record activity for %s: %s", user_id, exc)
