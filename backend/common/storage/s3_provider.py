"""S3/MinIO implementation of ResultsStorageProvider."""

import json
import logging
import os
from typing import Any, Dict, Optional

import boto3
from botocore.exceptions import ClientError

from backend.common.storage.provider import ResultsStorageProvider, ResultType

logger = logging.getLogger(__name__)


class S3ResultsProvider(ResultsStorageProvider):
    """S3/MinIO storage provider for simulation results.

    Works with both AWS S3 and MinIO (S3-compatible) via endpoint_url override.
    """

    def __init__(
        self,
        bucket_name: Optional[str] = None,
        endpoint_url: Optional[str] = None,
        region_name: Optional[str] = None,
        s3_client=None,
    ):
        """Initialize S3 provider.

        Args:
            bucket_name: S3 bucket name. Defaults to env RESULTS_BUCKET_NAME.
            endpoint_url: S3 endpoint URL (for MinIO). Defaults to env S3_ENDPOINT_URL.
            region_name: AWS region. Defaults to env AWS_REGION or 'eu-west-1'.
            s3_client: Optional pre-configured boto3 S3 client (for testing).
        """
        self.bucket_name = bucket_name or os.getenv(
            "RESULTS_BUCKET_NAME",
            f"antenna-simulator-results-{os.getenv('ENVIRONMENT', 'dev')}",
        )
        self.endpoint_url = endpoint_url or os.getenv("S3_ENDPOINT_URL")
        self.region_name = region_name or os.getenv("AWS_REGION", "eu-west-1")
        self._client = s3_client
        self._initialized = False

    @property
    def client(self):
        """Lazy-initialize S3 client."""
        if self._client is None:
            client_kwargs = {"region_name": self.region_name}
            if self.endpoint_url:
                # MinIO or localstack
                client_kwargs["endpoint_url"] = self.endpoint_url
                # MinIO typically needs these for local dev
                if "localhost" in self.endpoint_url or "minio" in self.endpoint_url:
                    client_kwargs["aws_access_key_id"] = os.getenv(
                        "AWS_ACCESS_KEY_ID", "minioadmin"
                    )
                    client_kwargs["aws_secret_access_key"] = os.getenv(
                        "AWS_SECRET_ACCESS_KEY", "minioadmin"
                    )
            self._client = boto3.client("s3", **client_kwargs)
        return self._client

    async def _ensure_bucket(self) -> None:
        """Create bucket if it doesn't exist (for local dev with MinIO)."""
        if self._initialized:
            return

        try:
            self.client.head_bucket(Bucket=self.bucket_name)
            logger.debug(f"Bucket {self.bucket_name} exists")
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code in ("404", "NoSuchBucket"):
                logger.info(f"Creating bucket {self.bucket_name}")
                try:
                    # MinIO and us-east-1 don't need LocationConstraint
                    if self.endpoint_url or self.region_name == "us-east-1":
                        self.client.create_bucket(Bucket=self.bucket_name)
                    else:
                        self.client.create_bucket(
                            Bucket=self.bucket_name,
                            CreateBucketConfiguration={
                                "LocationConstraint": self.region_name
                            },
                        )
                except ClientError as create_err:
                    logger.warning(f"Could not create bucket: {create_err}")
            else:
                logger.warning(f"Could not check bucket: {e}")

        self._initialized = True

    async def store_result(
        self,
        project_id: str,
        result_type: ResultType,
        data: Dict[str, Any],
    ) -> str:
        """Store a result as JSON in S3."""
        await self._ensure_bucket()

        key = self.get_key(project_id, result_type)
        body = json.dumps(data, default=str)

        try:
            self.client.put_object(
                Bucket=self.bucket_name,
                Key=key,
                Body=body.encode("utf-8"),
                ContentType="application/json",
            )
            logger.info(f"Stored {result_type.value} for project {project_id} ({len(body)} bytes)")
            return key
        except ClientError as e:
            logger.error(f"Failed to store {key}: {e}")
            raise

    async def get_result(
        self,
        project_id: str,
        result_type: ResultType,
    ) -> Optional[Dict[str, Any]]:
        """Retrieve a result from S3."""
        await self._ensure_bucket()

        key = self.get_key(project_id, result_type)

        try:
            response = self.client.get_object(Bucket=self.bucket_name, Key=key)
            body = response["Body"].read().decode("utf-8")
            return json.loads(body)
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code in ("NoSuchKey", "404"):
                logger.debug(f"Result not found: {key}")
                return None
            logger.error(f"Failed to get {key}: {e}")
            raise

    async def delete_results(self, project_id: str) -> int:
        """Delete all results for a project."""
        await self._ensure_bucket()

        prefix = f"results/{project_id}/"
        deleted_count = 0

        try:
            # List all objects with the project prefix
            paginator = self.client.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=self.bucket_name, Prefix=prefix):
                objects = page.get("Contents", [])
                if not objects:
                    continue

                # Delete in batches of up to 1000
                delete_keys = [{"Key": obj["Key"]} for obj in objects]
                self.client.delete_objects(
                    Bucket=self.bucket_name,
                    Delete={"Objects": delete_keys},
                )
                deleted_count += len(delete_keys)

            logger.info(f"Deleted {deleted_count} result objects for project {project_id}")
            return deleted_count
        except ClientError as e:
            logger.error(f"Failed to delete results for {project_id}: {e}")
            raise

    async def result_exists(
        self,
        project_id: str,
        result_type: ResultType,
    ) -> bool:
        """Check if a result exists in S3."""
        await self._ensure_bucket()

        key = self.get_key(project_id, result_type)

        try:
            self.client.head_object(Bucket=self.bucket_name, Key=key)
            return True
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code in ("404", "NoSuchKey"):
                return False
            logger.error(f"Failed to check {key}: {e}")
            raise
