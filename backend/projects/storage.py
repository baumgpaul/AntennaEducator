"""MinIO storage client for mesh and result data."""

from minio import Minio
from minio.error import S3Error
import os
import io
import json
import logging
import time
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# MinIO configuration
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "antenna-data")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"

# Initialize MinIO client
minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=MINIO_SECURE
)


def ensure_bucket_exists():
    """Ensure the MinIO bucket exists, create if it doesn't."""
    try:
        if not minio_client.bucket_exists(MINIO_BUCKET):
            minio_client.make_bucket(MINIO_BUCKET)
            logger.info(f"Created MinIO bucket: {MINIO_BUCKET}")
        else:
            logger.debug(f"MinIO bucket already exists: {MINIO_BUCKET}")
    except S3Error as e:
        logger.error(f"Error ensuring bucket exists: {e}", exc_info=True)
        raise


def upload_json(key: str, data: Dict[Any, Any], max_retries: int = 3) -> str:
    """
    Upload JSON data to MinIO with retry logic.
    
    Args:
        key: Object key (path) in MinIO
        data: Dictionary to serialize as JSON
        max_retries: Maximum number of retry attempts
        
    Returns:
        S3 key of the uploaded object
        
    Raises:
        S3Error: If upload fails after retries
    """
    ensure_bucket_exists()
    
    # Serialize to JSON bytes once
    json_bytes = json.dumps(data).encode('utf-8')
    
    for attempt in range(max_retries):
        try:
            json_stream = io.BytesIO(json_bytes)
            
            # Upload to MinIO
            minio_client.put_object(
                MINIO_BUCKET,
                key,
                json_stream,
                length=len(json_bytes),
                content_type="application/json"
            )
            
            logger.info(f"Successfully uploaded to MinIO: {key}")
            return key
            
        except S3Error as e:
            logger.warning(f"Upload attempt {attempt + 1}/{max_retries} failed for {key}: {e}")
            
            if attempt < max_retries - 1:
                # Exponential backoff: 1s, 2s, 4s
                sleep_time = 2 ** attempt
                logger.info(f"Retrying in {sleep_time} seconds...")
                time.sleep(sleep_time)
            else:
                logger.error(f"Failed to upload {key} after {max_retries} attempts", exc_info=True)
                raise


def download_json(key: str) -> Optional[Dict[Any, Any]]:
    """
    Download JSON data from MinIO.
    
    Args:
        key: Object key (path) in MinIO
        
    Returns:
        Parsed JSON dictionary or None if not found
        
    Raises:
        S3Error: If download fails
    """
    try:
        response = minio_client.get_object(MINIO_BUCKET, key)
        json_bytes = response.read()
        result = json.loads(json_bytes.decode('utf-8'))
        logger.debug(f"Successfully downloaded from MinIO: {key}")
        return result
    except S3Error as e:
        if e.code == "NoSuchKey":
            logger.debug(f"Object not found in MinIO: {key}")
            return None
        logger.error(f"Error downloading {key} from MinIO: {e}", exc_info=True)
        raise


def delete_object(key: str) -> bool:
    """
    Delete an object from MinIO.
    
    Args:
        key: Object key (path) in MinIO
        
    Returns:
        True if deleted, False if not found
        
    Raises:
        S3Error: If deletion fails
    """
    try:
        minio_client.remove_object(MINIO_BUCKET, key)
        logger.info(f"Successfully deleted from MinIO: {key}")
        return True
    except S3Error as e:
        if e.code == "NoSuchKey":
            logger.debug(f"Object not found for deletion: {key}")
            return False
        logger.error(f"Error deleting {key} from MinIO: {e}", exc_info=True)
        raise


def get_presigned_url(key: str, expires_seconds: int = 3600) -> str:
    """
    Get a presigned URL for downloading an object.
    
    Args:
        key: Object key (path) in MinIO
        expires_seconds: URL expiration time in seconds
        
    Returns:
        Presigned URL string
        
    Raises:
        S3Error: If URL generation fails
    """
    try:
        from datetime import timedelta
        url = minio_client.presigned_get_object(
            MINIO_BUCKET,
            key,
            expires=timedelta(seconds=expires_seconds)
        )
        logger.debug(f"Generated presigned URL for {key} (expires in {expires_seconds}s)")
        return url
    except S3Error as e:
        logger.error(f"Error generating presigned URL for {key}: {e}", exc_info=True)
        raise
