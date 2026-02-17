"""Factory for creating storage providers."""

import logging
import os
from functools import lru_cache

from backend.common.storage.provider import ResultsStorageProvider

logger = logging.getLogger(__name__)

# Singleton instance
_provider_instance: ResultsStorageProvider | None = None


def get_storage_provider() -> ResultsStorageProvider:
    """Get the configured storage provider (singleton).

    The provider is selected based on the USE_S3 environment variable:
    - USE_S3=true (default): S3/MinIO provider
    - USE_S3=false: Raises error (no alternative implemented yet)

    For MinIO (local development), set S3_ENDPOINT_URL to the MinIO endpoint
    (e.g., http://localhost:9000 or http://minio:9000 in Docker).

    Returns:
        The configured ResultsStorageProvider instance.
    """
    global _provider_instance

    if _provider_instance is not None:
        return _provider_instance

    use_s3 = os.getenv("USE_S3", "true").lower() in ("true", "1", "yes")

    if use_s3:
        from backend.common.storage.s3_provider import S3ResultsProvider

        _provider_instance = S3ResultsProvider()
        endpoint = os.getenv("S3_ENDPOINT_URL", "AWS S3")
        bucket = _provider_instance.bucket_name
        logger.info(f"Using S3 storage provider: {endpoint}, bucket: {bucket}")
    else:
        raise NotImplementedError(
            "Only S3/MinIO storage is currently supported. Set USE_S3=true."
        )

    return _provider_instance


def reset_storage_provider() -> None:
    """Reset the singleton (for testing)."""
    global _provider_instance
    _provider_instance = None
