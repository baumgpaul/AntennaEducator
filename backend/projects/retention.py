"""Data retention, run daily by an EventBridge schedule (see lambda_handler).

- Accounts with no activity (``LastSeenAt``) for RETENTION_DAYS are deleted with
  all their data, like a self-service deletion. Admins and maintainers are kept.
  Accounts without ``LastSeenAt`` (created before tracking existed) get today's
  date instead of being deleted, which starts their clock.
- Course submissions older than RETENTION_DAYS are deleted (forward and reverse
  item plus the S3 snapshot).

The privacy notice (frontend/src/features/legal) states these rules.
"""

import logging
from datetime import date, timedelta
from typing import Any, Dict, Iterator, Optional

from boto3.dynamodb.conditions import Attr

from backend.common.auth.identity import UserIdentity, UserRole
from backend.projects.account_service import delete_user_data
from backend.projects.submission_routes import _snapshot_owner_id

logger = logging.getLogger(__name__)

RETENTION_DAYS = 365
_KEPT_ROLES = {UserRole.ADMIN.value, UserRole.MAINTAINER.value}


def _scan(table, filter_expression) -> Iterator[Dict[str, Any]]:
    kwargs = {"FilterExpression": filter_expression}
    while True:
        resp = table.scan(**kwargs)
        yield from resp.get("Items", [])
        if "LastEvaluatedKey" not in resp:
            return
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]


def _is_kept_role(item: Dict[str, Any]) -> bool:
    return item.get("Role") in _KEPT_ROLES or bool(item.get("IsAdmin"))


async def run_retention(
    table, results_svc, doc_svc, auth_provider, today: Optional[date] = None
) -> Dict[str, int]:
    today = today or date.today()
    cutoff = (today - timedelta(days=RETENTION_DAYS)).isoformat()
    counts = {"accounts_deleted": 0, "clocks_started": 0, "submissions_deleted": 0}

    users = _scan(table, Attr("SK").eq("METADATA") & Attr("PK").begins_with("USER#"))
    for item in users:
        if _is_kept_role(item):
            continue
        user_id = item["PK"].split("#", 1)[1]
        last_seen = item.get("LastSeenAt")
        if not last_seen:
            table.update_item(
                Key={"PK": item["PK"], "SK": "METADATA"},
                UpdateExpression="SET LastSeenAt = :today",
                ConditionExpression="attribute_not_exists(LastSeenAt)",
                ExpressionAttributeValues={":today": today.isoformat()},
            )
            counts["clocks_started"] += 1
        elif last_seen < cutoff:
            await delete_user_data(table, user_id, results_svc, doc_svc)
            email = item.get("Email") or item.get("email") or ""
            await auth_provider.delete_identity(
                UserIdentity(id=user_id, email=email, username=item.get("Username", user_id))
            )
            counts["accounts_deleted"] += 1

    submissions = _scan(
        table,
        Attr("PK").begins_with("COURSE#")
        & Attr("SK").begins_with("SUBMISSION#")
        & Attr("SubmittedAt").lt(cutoff),
    )
    for item in submissions:
        submission_id = item["SK"].split("#", 1)[1]
        await results_svc.delete_results(_snapshot_owner_id(submission_id))
        with table.batch_writer() as batch:
            batch.delete_item(Key={"PK": item["PK"], "SK": item["SK"]})
            user_id = item.get("UserId")
            if user_id:
                batch.delete_item(Key={"PK": f"USER#{user_id}", "SK": item["SK"]})
        counts["submissions_deleted"] += 1

    logger.info("Retention run (cutoff %s): %s", cutoff, counts)
    return counts
