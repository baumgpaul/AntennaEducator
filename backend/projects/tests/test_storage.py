"""Tests for MinIO storage functionality."""

import pytest
from unittest.mock import Mock, patch, MagicMock
import json


class TestStorageModule:
    """Test storage module functions."""
    
    @patch('backend.projects.storage.minio_client')
    def test_ensure_bucket_exists_creates_bucket(self, mock_client):
        """Test bucket creation when it doesn't exist."""
        from backend.projects.storage import ensure_bucket_exists
        
        mock_client.bucket_exists.return_value = False
        ensure_bucket_exists()
        
        mock_client.bucket_exists.assert_called_once()
        mock_client.make_bucket.assert_called_once()
    
    @patch('backend.projects.storage.minio_client')
    def test_ensure_bucket_exists_skips_if_exists(self, mock_client):
        """Test bucket creation skipped when bucket exists."""
        from backend.projects.storage import ensure_bucket_exists
        
        mock_client.bucket_exists.return_value = True
        ensure_bucket_exists()
        
        mock_client.bucket_exists.assert_called_once()
        mock_client.make_bucket.assert_not_called()
    
    @patch('backend.projects.storage.minio_client')
    def test_upload_json_success(self, mock_client):
        """Test successful JSON upload."""
        from backend.projects.storage import upload_json
        
        mock_client.bucket_exists.return_value = True
        
        test_data = {"key": "value", "number": 42}
        key = "test/data.json"
        
        result = upload_json(key, test_data)
        
        assert result == key
        mock_client.put_object.assert_called_once()
        
        # Verify the uploaded data
        call_args = mock_client.put_object.call_args
        assert call_args[0][1] == key
        assert call_args[1]["content_type"] == "application/json"
    
    @patch('backend.projects.storage.minio_client')
    def test_download_json_success(self, mock_client):
        """Test successful JSON download."""
        from backend.projects.storage import download_json
        
        test_data = {"downloaded": True, "value": 123}
        mock_response = Mock()
        mock_response.read.return_value = json.dumps(test_data).encode('utf-8')
        mock_client.get_object.return_value = mock_response
        
        result = download_json("test/data.json")
        
        assert result == test_data
        mock_client.get_object.assert_called_once()
    
    @patch('backend.projects.storage.minio_client')
    def test_download_json_not_found(self, mock_client):
        """Test download returns None when object not found."""
        from backend.projects.storage import download_json
        from minio.error import S3Error
        
        # Create S3Error with 'code' attribute
        error = S3Error(
            message="The specified key does not exist",
            resource="resource",
            request_id="request_id",
            host_id="host_id",
            response=Mock(status=404),
            code="NoSuchKey",
            bucket_name="test-bucket",
            object_name="nonexistent.json"
        )
        mock_client.get_object.side_effect = error
        
        result = download_json("nonexistent.json")
        
        assert result is None
    
    @patch('backend.projects.storage.minio_client')
    def test_delete_object_success(self, mock_client):
        """Test successful object deletion."""
        from backend.projects.storage import delete_object
        
        result = delete_object("test/file.json")
        
        assert result is True
        mock_client.remove_object.assert_called_once()
    
    @patch('backend.projects.storage.minio_client')
    def test_delete_object_not_found(self, mock_client):
        """Test delete returns False when object not found."""
        from backend.projects.storage import delete_object
        from minio.error import S3Error
        
        # Create S3Error with 'code' attribute
        error = S3Error(
            message="The specified key does not exist",
            resource="resource",
            request_id="request_id",
            host_id="host_id",
            response=Mock(status=404),
            code="NoSuchKey",
            bucket_name="test-bucket",
            object_name="nonexistent.json"
        )
        mock_client.remove_object.side_effect = error
        
        result = delete_object("nonexistent.json")
        
        assert result is False
    
    @patch('backend.projects.storage.minio_client')
    def test_get_presigned_url(self, mock_client):
        """Test presigned URL generation."""
        from backend.projects.storage import get_presigned_url
        
        expected_url = "http://minio:9000/bucket/key?signature=abc123"
        mock_client.presigned_get_object.return_value = expected_url
        
        result = get_presigned_url("test/file.json", expires_seconds=3600)
        
        assert result == expected_url
        mock_client.presigned_get_object.assert_called_once()
