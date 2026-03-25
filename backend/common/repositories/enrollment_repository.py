"""DynamoDB Enrollment Repository — course enrollment tracking.

Uses a dual-item pattern for efficient bidirectional queries:

    Forward:  PK=COURSE#{course_id}  SK=ENROLLMENT#{user_id}
    Reverse:  PK=USER#{user_id}      SK=ENROLLMENT#{course_id}

Both items carry the same data (denormalized). Writes and deletes
always operate on both items atomically via batch_writer.
"""

import logging
import os
from datetime import datetime, timezone
from typing import Dict, List

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)


class EnrollmentRepository:
    """DynamoDB-based course enrollment repository."""

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

    def enroll_user(
        self,
        course_id: str,
        user_id: str,
        enrolled_by: str,
    ) -> None:
        """Enroll a user in a course (writes two items)."""
        now = datetime.now(timezone.utc).isoformat()
        forward = {
            "PK": f"COURSE#{course_id}",
            "SK": f"ENROLLMENT#{user_id}",
            "EntityType": "ENROLLMENT",
            "CourseId": course_id,
            "UserId": user_id,
            "EnrolledAt": now,
            "EnrolledBy": enrolled_by,
        }
        reverse = {
            "PK": f"USER#{user_id}",
            "SK": f"ENROLLMENT#{course_id}",
            "EntityType": "ENROLLMENT",
            "CourseId": course_id,
            "UserId": user_id,
            "EnrolledAt": now,
            "EnrolledBy": enrolled_by,
        }
        with self.table.batch_writer() as batch:
            batch.put_item(Item=forward)
            batch.put_item(Item=reverse)
        logger.info("Enrolled user %s in course %s", user_id, course_id)

    def unenroll_user(self, course_id: str, user_id: str) -> None:
        """Remove a user's enrollment (deletes two items)."""
        with self.table.batch_writer() as batch:
            batch.delete_item(
                Key={"PK": f"COURSE#{course_id}", "SK": f"ENROLLMENT#{user_id}"},
            )
            batch.delete_item(
                Key={"PK": f"USER#{user_id}", "SK": f"ENROLLMENT#{course_id}"},
            )
        logger.info("Unenrolled user %s from course %s", user_id, course_id)

    # ── query operations ──────────────────────────────────────────────────

    def is_enrolled(self, course_id: str, user_id: str) -> bool:
        """Check if a user is enrolled in a course."""
        try:
            resp = self.table.get_item(
                Key={
                    "PK": f"COURSE#{course_id}",
                    "SK": f"ENROLLMENT#{user_id}",
                },
            )
            return "Item" in resp
        except ClientError as e:
            logger.error("Error checking enrollment: %s", e)
            return False

    def list_course_enrollments(self, course_id: str) -> List[Dict]:
        """List all users enrolled in a course."""
        from boto3.dynamodb.conditions import Key

        try:
            resp = self.table.query(
                KeyConditionExpression=(
                    Key("PK").eq(f"COURSE#{course_id}") & Key("SK").begins_with("ENROLLMENT#")
                ),
            )
            return [self._to_dict(item) for item in resp.get("Items", [])]
        except ClientError as e:
            logger.error("Error listing course enrollments: %s", e)
            return []

    def list_user_enrollments(self, user_id: str) -> List[Dict]:
        """List all courses a user is enrolled in."""
        from boto3.dynamodb.conditions import Key

        try:
            resp = self.table.query(
                KeyConditionExpression=(
                    Key("PK").eq(f"USER#{user_id}") & Key("SK").begins_with("ENROLLMENT#")
                ),
            )
            return [self._to_dict(item) for item in resp.get("Items", [])]
        except ClientError as e:
            logger.error("Error listing user enrollments: %s", e)
            return []

    @staticmethod
    def _to_dict(item: Dict) -> Dict:
        """Convert a DynamoDB enrollment item to snake_case dict."""
        return {
            "user_id": item.get("UserId", ""),
            "course_id": item.get("CourseId", ""),
            "enrolled_at": item.get("EnrolledAt", ""),
            "enrolled_by": item.get("EnrolledBy", ""),
        }
