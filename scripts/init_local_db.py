"""init_local_db.py — Idempotent bootstrap for local / Docker development.

Run once after starting DynamoDB Local and MinIO to:

1. Create the DynamoDB table (with GSI1) if it does not already exist.
2. Seed an admin user from ``ADMIN_EMAIL`` / ``ADMIN_PASSWORD`` env vars.
3. Create the MinIO S3 bucket if ``S3_ENDPOINT_URL`` is set.

Safe to run multiple times — all steps check for existing state first.

Usage::

    python scripts/init_local_db.py

Or via the wrapper scripts::

    scripts/init-local.ps1    # Windows PowerShell
    scripts/init-local.sh     # Linux / macOS
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")

# ---------------------------------------------------------------------------
# Configuration (from environment)
# ---------------------------------------------------------------------------

_ENDPOINT_URL = os.getenv("DYNAMODB_ENDPOINT_URL", "http://localhost:8000")
_TABLE_NAME = os.getenv("DYNAMODB_TABLE_NAME", "antenna-simulator-local")
_REGION = os.getenv("AWS_DEFAULT_REGION", "eu-west-1")
_AWS_KEY = os.getenv("AWS_ACCESS_KEY_ID", "dummy")
_AWS_SECRET = os.getenv("AWS_SECRET_ACCESS_KEY", "dummy")

_S3_ENDPOINT = os.getenv("S3_ENDPOINT_URL", "")
_BUCKET_NAME = os.getenv("RESULTS_BUCKET_NAME", "antenna-simulator-results-local")

_ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "")
_ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _get_dynamodb_resource():
    return boto3.resource(
        "dynamodb",
        region_name=_REGION,
        endpoint_url=_ENDPOINT_URL,
        aws_access_key_id=_AWS_KEY,
        aws_secret_access_key=_AWS_SECRET,
    )


def _get_dynamodb_client():
    return boto3.client(
        "dynamodb",
        region_name=_REGION,
        endpoint_url=_ENDPOINT_URL,
        aws_access_key_id=_AWS_KEY,
        aws_secret_access_key=_AWS_SECRET,
    )


def _hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt (72-byte input cap)."""
    from passlib.context import CryptContext

    ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
    return ctx.hash(password[:72])


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def ensure_table_exists() -> None:
    """Create the DynamoDB table (with PK/SK + GSI1) if not already present."""
    dynamodb = _get_dynamodb_resource()
    client = _get_dynamodb_client()
    table = dynamodb.Table(_TABLE_NAME)

    try:
        table.load()
        logger.info("Table '%s' already exists — skipping creation.", _TABLE_NAME)
        return
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ResourceNotFoundException":
            raise

    logger.info("Creating table '%s' …", _TABLE_NAME)
    dynamodb.create_table(
        TableName=_TABLE_NAME,
        KeySchema=[
            {"AttributeName": "PK", "KeyType": "HASH"},
            {"AttributeName": "SK", "KeyType": "RANGE"},
        ],
        AttributeDefinitions=[
            {"AttributeName": "PK", "AttributeType": "S"},
            {"AttributeName": "SK", "AttributeType": "S"},
            {"AttributeName": "GSI1PK", "AttributeType": "S"},
            {"AttributeName": "GSI1SK", "AttributeType": "S"},
        ],
        GlobalSecondaryIndexes=[
            {
                "IndexName": "GSI1",
                "KeySchema": [
                    {"AttributeName": "GSI1PK", "KeyType": "HASH"},
                    {"AttributeName": "GSI1SK", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
                "ProvisionedThroughput": {"ReadCapacityUnits": 5, "WriteCapacityUnits": 5},
            }
        ],
        BillingMode="PROVISIONED",
        ProvisionedThroughput={"ReadCapacityUnits": 5, "WriteCapacityUnits": 5},
    )

    logger.info("Waiting for table '%s' to become active …", _TABLE_NAME)
    waiter = client.get_waiter("table_exists")
    waiter.wait(TableName=_TABLE_NAME)
    logger.info("Table '%s' created successfully.", _TABLE_NAME)


def seed_admin_user() -> None:
    """Create the admin user from env vars if it does not already exist."""
    admin_email = os.getenv("ADMIN_EMAIL", "")
    admin_password = os.getenv("ADMIN_PASSWORD", "")

    if not admin_email or not admin_password:
        logger.error(
            "ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed the admin user. "
            "Copy .env.example → .env and fill in the values."
        )
        raise ValueError("ADMIN_EMAIL and ADMIN_PASSWORD are required")

    dynamodb = _get_dynamodb_resource()
    table = dynamodb.Table(_TABLE_NAME)

    # Check whether a user with this email already exists
    result = table.scan(
        FilterExpression="email = :e",
        ExpressionAttributeValues={":e": admin_email},
        Select="COUNT",
    )
    if result.get("Count", 0) > 0:
        logger.info("Admin user '%s' already exists — skipping creation.", admin_email)
        return

    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    username = admin_email.split("@")[0]
    password_hash = _hash_password(admin_password)

    item = {
        "PK": f"USER#{user_id}",
        "SK": f"USER#{user_id}",
        "GSI1PK": "USER",
        "GSI1SK": f"USER#{user_id}",
        "user_id": user_id,
        "email": admin_email,
        "username": username,
        "password_hash": password_hash,
        "is_admin": True,
        "is_locked": False,
        "role": "admin",
        "created_at": now,
        "updated_at": now,
    }

    table.put_item(Item=item)
    logger.info("Admin user '%s' (id=%s) created.", admin_email, user_id)


def ensure_minio_bucket() -> None:
    """Create the MinIO S3 bucket if ``S3_ENDPOINT_URL`` is configured."""
    s3_endpoint = os.getenv("S3_ENDPOINT_URL", "")
    if not s3_endpoint:
        logger.info("S3_ENDPOINT_URL not set — skipping MinIO bucket creation.")
        return

    bucket_name = os.getenv("RESULTS_BUCKET_NAME", "antenna-simulator-results-local")
    aws_key = os.getenv("AWS_ACCESS_KEY_ID", "minioadmin")
    aws_secret = os.getenv("AWS_SECRET_ACCESS_KEY", "minioadmin")

    s3 = boto3.client(
        "s3",
        endpoint_url=s3_endpoint,
        aws_access_key_id=aws_key,
        aws_secret_access_key=aws_secret,
        region_name="us-east-1",
    )

    try:
        s3.head_bucket(Bucket=bucket_name)
        logger.info("MinIO bucket '%s' already exists — skipping.", bucket_name)
        return
    except ClientError:
        pass  # Bucket does not exist — create it

    s3.create_bucket(Bucket=bucket_name)
    logger.info("MinIO bucket '%s' created.", bucket_name)


def run_all() -> None:
    """Run all bootstrap steps in order."""
    logger.info("=== Antenna Educator — Local DB Bootstrap ===")
    logger.info("DynamoDB endpoint : %s", _ENDPOINT_URL)
    logger.info("Table             : %s", _TABLE_NAME)
    ensure_table_exists()
    seed_admin_user()
    ensure_minio_bucket()
    logger.info("Bootstrap complete.")


if __name__ == "__main__":
    run_all()
