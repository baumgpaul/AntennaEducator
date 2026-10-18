"""DynamoDB Submission Repository — course assignment submissions.

Uses a dual-item pattern for efficient bidirectional queries:

    Forward:  PK=COURSE#{course_id}  SK=SUBMISSION#{submission_id}
    Reverse:  PK=USER#{user_id}      SK=SUBMISSION#{submission_id}

Forward items are used by instructors to list all submissions in a course.
Reverse items allow students to list their own submissions across courses.
"""

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from backend.common.repositories.dynamodb_repository import _from_dynamodb, _to_dynamodb
from backend.common.repositories.transactions import transact_put, transact_update

logger = logging.getLogger(__name__)


class SubmissionRepository:
    """DynamoDB-based submission repository."""

    def __init__(self):
        self.region = os.getenv("AWS_DEFAULT_REGION", "eu-west-1")
        endpoint_url = os.getenv("DYNAMODB_ENDPOINT_URL")
        config = Config(
            connect_timeout=5,
            read_timeout=10,
            retries={"max_attempts": 3, "mode": "standard"},
        )

        if endpoint_url:
            self.dynamodb = boto3.resource(
                "dynamodb",
                region_name=self.region,
                endpoint_url=endpoint_url,
                aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID", "dummy"),
                aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", "dummy"),
                config=config,
            )
        else:
            self.dynamodb = boto3.resource(
                "dynamodb",
                region_name=self.region,
                config=config,
            )

        self.table_name = os.getenv(
            "DYNAMODB_TABLE_NAME",
            "antenna-simulator-staging",
        )
        self.table = self.dynamodb.Table(self.table_name)

    # ── write operations ──────────────────────────────────────────────────

    def create_submission(
        self,
        course_id: str,
        project_id: str,
        user_id: str,
        username: str = "",
        project_name: str = "Untitled",
        frozen_design_state: Optional[Dict[str, Any]] = None,
        frozen_simulation_config: Optional[Dict[str, Any]] = None,
        frozen_simulation_results: Optional[Dict[str, Any]] = None,
        frozen_ui_state: Optional[Dict[str, Any]] = None,
        submission_id: Optional[str] = None,
        snapshot_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a new submission.

        Preferred: the frozen snapshot lives in S3 (``snapshot_key``) and the
        items only hold metadata — inline snapshots could exceed DynamoDB's
        400 KB item limit (TEST_PLAN B41). Inline ``frozen_*`` arguments are
        the fallback when S3 is unavailable.
        """
        submission_id = submission_id or str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        base_attrs = {
            "EntityType": "SUBMISSION",
            "SubmissionId": submission_id,
            "CourseId": course_id,
            "ProjectId": project_id,
            "UserId": user_id,
            "Username": username,
            "ProjectName": project_name,
            "Status": "submitted",
            "Feedback": "",
            "SubmittedAt": now,
            "ReviewedAt": "",
            "ReviewedBy": "",
        }
        if snapshot_key:
            snapshot_attrs = {"SnapshotKey": snapshot_key}
        else:
            snapshot_attrs = {
                "FrozenDesignState": _to_dynamodb(frozen_design_state or {}),
                "FrozenSimulationConfig": _to_dynamodb(frozen_simulation_config or {}),
                "FrozenSimulationResults": _to_dynamodb(frozen_simulation_results or {}),
                "FrozenUiState": _to_dynamodb(frozen_ui_state or {}),
            }

        # Snapshot only on the forward (course) item; the reverse item serves
        # "my submissions" lists, which never show the snapshot.
        forward = {
            **base_attrs,
            **snapshot_attrs,
            "PK": f"COURSE#{course_id}",
            "SK": f"SUBMISSION#{submission_id}",
        }
        reverse = {
            **base_attrs,
            "PK": f"USER#{user_id}",
            "SK": f"SUBMISSION#{submission_id}",
        }

        transact_put(self.table, forward, reverse)

        logger.info(
            "Created submission %s for course %s by user %s",
            submission_id,
            course_id,
            user_id,
        )
        return self._to_dict(forward)

    def update_review(
        self,
        submission_id: str,
        course_id: str,
        user_id: str,
        feedback: str,
        status: str,
        reviewed_by: str,
    ) -> Optional[Dict[str, Any]]:
        """Add instructor review (feedback + status) to a submission.

        Updates both forward and reverse items.
        """
        now = datetime.now(timezone.utc).isoformat()

        update_expr = "SET #fb = :fb, #st = :st, ReviewedAt = :ra, ReviewedBy = :rb"
        expr_names = {"#fb": "Feedback", "#st": "Status"}
        expr_values = {
            ":fb": feedback,
            ":st": status,
            ":ra": now,
            ":rb": reviewed_by,
        }

        reverse_key = {"PK": f"USER#{user_id}", "SK": f"SUBMISSION#{submission_id}"}
        try:
            # Both copies or neither (a transaction cannot return the new item)
            transact_update(
                self.table,
                [{"PK": f"COURSE#{course_id}", "SK": f"SUBMISSION#{submission_id}"}, reverse_key],
                update_expr,
                expr_names,
                expr_values,
            )
            resp = self.table.get_item(Key=reverse_key)
            return self._to_dict(resp.get("Item", {}))
        except ClientError as e:
            logger.error("Error updating review for submission %s: %s", submission_id, e)
            return None

    # ── query operations ──────────────────────────────────────────────────

    def get_submission(self, course_id: str, submission_id: str) -> Optional[Dict[str, Any]]:
        """Get a single submission by course and submission ID."""
        try:
            resp = self.table.get_item(
                Key={
                    "PK": f"COURSE#{course_id}",
                    "SK": f"SUBMISSION#{submission_id}",
                },
            )
            item = resp.get("Item")
            return self._to_dict(item) if item else None
        except ClientError as e:
            logger.error("Error getting submission %s: %s", submission_id, e)
            return None

    def list_course_submissions(self, course_id: str) -> List[Dict[str, Any]]:
        """List all submissions for a course (instructor view)."""
        from boto3.dynamodb.conditions import Key

        try:
            resp = self.table.query(
                KeyConditionExpression=(
                    Key("PK").eq(f"COURSE#{course_id}") & Key("SK").begins_with("SUBMISSION#")
                ),
            )
            return [self._to_dict(item) for item in resp.get("Items", [])]
        except ClientError as e:
            logger.error("Error listing course submissions: %s", e)
            return []

    def list_user_submissions(self, user_id: str) -> List[Dict[str, Any]]:
        """List all submissions by a user across all courses."""
        from boto3.dynamodb.conditions import Key

        try:
            resp = self.table.query(
                KeyConditionExpression=(
                    Key("PK").eq(f"USER#{user_id}") & Key("SK").begins_with("SUBMISSION#")
                ),
            )
            return [self._to_dict(item) for item in resp.get("Items", [])]
        except ClientError as e:
            logger.error("Error listing user submissions: %s", e)
            return []

    def list_user_course_submissions(self, course_id: str, user_id: str) -> List[Dict[str, Any]]:
        """List submissions by a specific user in a specific course."""
        all_course = self.list_course_submissions(course_id)
        return [s for s in all_course if s.get("user_id") == user_id]

    # ── helpers ───────────────────────────────────────────────────────────

    @staticmethod
    def _to_dict(item: Dict) -> Dict:
        """Convert DynamoDB submission item to snake_case dict."""
        return {
            "submission_id": item.get("SubmissionId", ""),
            "course_id": item.get("CourseId", ""),
            "project_id": item.get("ProjectId", ""),
            "user_id": item.get("UserId", ""),
            "username": item.get("Username", ""),
            "project_name": item.get("ProjectName", ""),
            "status": item.get("Status", "submitted"),
            "feedback": item.get("Feedback", ""),
            "frozen_design_state": _from_dynamodb(item.get("FrozenDesignState", {})),
            "frozen_simulation_config": _from_dynamodb(item.get("FrozenSimulationConfig", {})),
            "frozen_simulation_results": _from_dynamodb(item.get("FrozenSimulationResults", {})),
            "frozen_ui_state": _from_dynamodb(item.get("FrozenUiState", {})),
            "snapshot_key": item.get("SnapshotKey"),
            "submitted_at": item.get("SubmittedAt", ""),
            "reviewed_at": item.get("ReviewedAt", ""),
            "reviewed_by": item.get("ReviewedBy", ""),
        }
