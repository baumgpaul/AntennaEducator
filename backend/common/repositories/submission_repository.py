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
        project_name: str,
        frozen_design_state: Optional[Dict[str, Any]] = None,
        frozen_simulation_config: Optional[Dict[str, Any]] = None,
        frozen_simulation_results: Optional[Dict[str, Any]] = None,
        frozen_ui_state: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Create a new submission with frozen project snapshot."""
        submission_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        base_attrs = {
            "EntityType": "SUBMISSION",
            "SubmissionId": submission_id,
            "CourseId": course_id,
            "ProjectId": project_id,
            "UserId": user_id,
            "ProjectName": project_name,
            "Status": "submitted",
            "Feedback": "",
            "FrozenDesignState": frozen_design_state or {},
            "FrozenSimulationConfig": frozen_simulation_config or {},
            "FrozenSimulationResults": frozen_simulation_results or {},
            "FrozenUiState": frozen_ui_state or {},
            "SubmittedAt": now,
            "ReviewedAt": "",
            "ReviewedBy": "",
        }

        forward = {
            **base_attrs,
            "PK": f"COURSE#{course_id}",
            "SK": f"SUBMISSION#{submission_id}",
        }
        reverse = {
            **base_attrs,
            "PK": f"USER#{user_id}",
            "SK": f"SUBMISSION#{submission_id}",
        }

        with self.table.batch_writer() as batch:
            batch.put_item(Item=forward)
            batch.put_item(Item=reverse)

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

        try:
            # Update forward item
            self.table.update_item(
                Key={
                    "PK": f"COURSE#{course_id}",
                    "SK": f"SUBMISSION#{submission_id}",
                },
                UpdateExpression=update_expr,
                ExpressionAttributeNames=expr_names,
                ExpressionAttributeValues=expr_values,
            )
            # Update reverse item
            resp = self.table.update_item(
                Key={
                    "PK": f"USER#{user_id}",
                    "SK": f"SUBMISSION#{submission_id}",
                },
                UpdateExpression=update_expr,
                ExpressionAttributeNames=expr_names,
                ExpressionAttributeValues=expr_values,
                ReturnValues="ALL_NEW",
            )
            return self._to_dict(resp.get("Attributes", {}))
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
            "project_name": item.get("ProjectName", ""),
            "status": item.get("Status", "submitted"),
            "feedback": item.get("Feedback", ""),
            "frozen_design_state": item.get("FrozenDesignState", {}),
            "frozen_simulation_config": item.get("FrozenSimulationConfig", {}),
            "frozen_simulation_results": item.get("FrozenSimulationResults", {}),
            "frozen_ui_state": item.get("FrozenUiState", {}),
            "submitted_at": item.get("SubmittedAt", ""),
            "reviewed_at": item.get("ReviewedAt", ""),
            "reviewed_by": item.get("ReviewedBy", ""),
        }
