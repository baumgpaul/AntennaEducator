"""Shared S3/MinIO client factory.

Centralises boto3 S3 client creation so that every service (results
storage, documentation, future services) uses the same env-var contract
and MinIO-detection logic.

Env vars read:
    S3_ENDPOINT_URL     — MinIO / LocalStack endpoint (omit for real AWS S3)
    AWS_REGION          — AWS region (default: eu-west-1)
    AWS_ACCESS_KEY_ID   — only used for local MinIO endpoints
    AWS_SECRET_ACCESS_KEY — only used for local MinIO endpoints
    RESULTS_BUCKET_NAME — default bucket name
    ENVIRONMENT         — fallback for bucket name (default: dev)
"""

import os
from typing import Optional

import boto3

_LOCAL_KEYWORDS = ("localhost", "minio", "127.0.0.1")


def default_bucket_name() -> str:
    """Return the default S3 bucket name from environment."""
    return os.getenv(
        "RESULTS_BUCKET_NAME",
        f"antenna-simulator-results-{os.getenv('ENVIRONMENT', 'dev')}",
    )


def create_s3_client(
    endpoint_url: Optional[str] = None,
    region_name: Optional[str] = None,
):
    """Create a boto3 S3 client with environment-aware defaults.

    For local MinIO endpoints (URL contains 'localhost', 'minio', or
    '127.0.0.1'), the client is configured with local access credentials
    from env vars (falling back to ``minioadmin``).

    Args:
        endpoint_url: Override for ``S3_ENDPOINT_URL``.
        region_name: Override for ``AWS_REGION``.

    Returns:
        A ``boto3`` S3 client.
    """
    endpoint_url = endpoint_url or os.getenv("S3_ENDPOINT_URL")
    region_name = region_name or os.getenv("AWS_REGION", "eu-west-1")

    client_kwargs: dict = {"region_name": region_name}

    if endpoint_url:
        client_kwargs["endpoint_url"] = endpoint_url
        if any(kw in endpoint_url for kw in _LOCAL_KEYWORDS):
            client_kwargs["aws_access_key_id"] = os.getenv(
                "AWS_ACCESS_KEY_ID", "minioadmin"
            )
            client_kwargs["aws_secret_access_key"] = os.getenv(
                "AWS_SECRET_ACCESS_KEY", "minioadmin"
            )

    return boto3.client("s3", **client_kwargs)
