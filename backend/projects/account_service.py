"""Self-service account deletion (GDPR Art. 17, right to erasure).

Everything a user owns lives under ``PK=USER#{user_id}`` (profile, projects,
folders, token usage, reverse enrollment/submission entries). Enrollments and
submissions also have a forward copy under ``COURSE#{course_id}``; those are
removed via the reverse entries. Project results and documentation live in S3
under the project id, submission snapshots under their snapshot owner id.
"""

import logging
from typing import Any, Dict, List

from boto3.dynamodb.conditions import Key

from backend.projects.submission_routes import _snapshot_owner_id

logger = logging.getLogger(__name__)


def _user_items(table, user_id: str) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    kwargs = {"KeyConditionExpression": Key("PK").eq(f"USER#{user_id}")}
    while True:
        resp = table.query(**kwargs)
        items.extend(resp.get("Items", []))
        if "LastEvaluatedKey" not in resp:
            return items
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]


def _forward_key(item: Dict[str, Any], user_id: str) -> Dict[str, str] | None:
    """COURSE#… copy of a reverse enrollment/submission entry, if any."""
    sk = item["SK"]
    if sk.startswith("ENROLLMENT#"):
        course_id = sk.split("#", 1)[1]
        return {"PK": f"COURSE#{course_id}", "SK": f"ENROLLMENT#{user_id}"}
    if sk.startswith("SUBMISSION#"):
        course_id = item.get("CourseId") or item.get("course_id")
        if course_id:
            return {"PK": f"COURSE#{course_id}", "SK": sk}
    return None


async def delete_user_data(table, user_id: str, results_svc, doc_svc) -> Dict[str, int]:
    """Delete all data of ``user_id``; returns counts for the audit log."""
    items = _user_items(table, user_id)

    project_ids = [
        item["SK"].split("#", 1)[1] for item in items if item["SK"].startswith("PROJECT#")
    ]
    submission_ids = [
        item["SK"].split("#", 1)[1] for item in items if item["SK"].startswith("SUBMISSION#")
    ]
    # S3 first: if it fails nothing is deleted yet and the request can be retried
    s3_objects = 0
    for project_id in project_ids:
        s3_objects += await results_svc.delete_results(project_id)
        s3_objects += await doc_svc.delete_all(project_id)
    for submission_id in submission_ids:
        s3_objects += await results_svc.delete_results(_snapshot_owner_id(submission_id))

    keys = [{"PK": item["PK"], "SK": item["SK"]} for item in items]
    keys += [k for k in (_forward_key(item, user_id) for item in items) if k]
    with table.batch_writer() as batch:
        for key in keys:
            batch.delete_item(Key=key)

    counts = {"items": len(keys), "projects": len(project_ids), "s3_objects": s3_objects}
    logger.info("Deleted account data for %s: %s", user_id, counts)
    return counts
