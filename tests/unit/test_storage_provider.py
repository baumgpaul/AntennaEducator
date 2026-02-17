"""Unit tests for S3/MinIO storage provider."""

import json
from unittest.mock import MagicMock, patch

import pytest

from backend.common.storage.provider import ResultsStorageProvider, ResultType
from backend.common.storage.s3_provider import S3ResultsProvider


class TestResultType:
    """Test ResultType enum."""

    def test_result_types_exist(self):
        """Verify all expected result types exist."""
        assert ResultType.SOLVER_RESULTS == "solver_results"
        assert ResultType.RADIATION_PATTERN == "radiation_pattern"
        assert ResultType.FIELD_DATA == "field_data"


class TestS3ResultsProvider:
    """Test S3ResultsProvider implementation."""

    @pytest.fixture
    def mock_s3_client(self):
        """Create a mock S3 client."""
        return MagicMock()

    @pytest.fixture
    def provider(self, mock_s3_client):
        """Create provider with mocked S3 client."""
        provider = S3ResultsProvider(
            bucket_name="test-bucket",
            endpoint_url="http://localhost:9000",
            s3_client=mock_s3_client,
        )
        provider._initialized = True  # Skip bucket creation
        return provider

    def test_get_key_format(self, provider):
        """Test storage key generation."""
        key = provider.get_key("project-123", ResultType.SOLVER_RESULTS)
        assert key == "results/project-123/solver_results.json"

        key = provider.get_key("project-456", ResultType.RADIATION_PATTERN)
        assert key == "results/project-456/radiation_pattern.json"

        key = provider.get_key("project-789", ResultType.FIELD_DATA)
        assert key == "results/project-789/field_data.json"

    @pytest.mark.asyncio
    async def test_store_result(self, provider, mock_s3_client):
        """Test storing a result to S3."""
        data = {"impedance": {"real": 73.0, "imag": 42.5}}

        key = await provider.store_result("proj-1", ResultType.SOLVER_RESULTS, data)

        assert key == "results/proj-1/solver_results.json"
        mock_s3_client.put_object.assert_called_once()
        call_kwargs = mock_s3_client.put_object.call_args.kwargs
        assert call_kwargs["Bucket"] == "test-bucket"
        assert call_kwargs["Key"] == "results/proj-1/solver_results.json"
        assert call_kwargs["ContentType"] == "application/json"
        # Verify JSON body
        body = call_kwargs["Body"].decode("utf-8")
        assert json.loads(body) == data

    @pytest.mark.asyncio
    async def test_get_result_found(self, provider, mock_s3_client):
        """Test retrieving an existing result."""
        expected_data = {"results": [1, 2, 3]}
        mock_s3_client.get_object.return_value = {
            "Body": MagicMock(read=lambda: json.dumps(expected_data).encode("utf-8"))
        }

        result = await provider.get_result("proj-1", ResultType.SOLVER_RESULTS)

        assert result == expected_data
        mock_s3_client.get_object.assert_called_once_with(
            Bucket="test-bucket",
            Key="results/proj-1/solver_results.json",
        )

    @pytest.mark.asyncio
    async def test_get_result_not_found(self, provider, mock_s3_client):
        """Test retrieving a non-existent result returns None."""
        from botocore.exceptions import ClientError

        mock_s3_client.get_object.side_effect = ClientError(
            {"Error": {"Code": "NoSuchKey"}}, "GetObject"
        )

        result = await provider.get_result("proj-1", ResultType.SOLVER_RESULTS)

        assert result is None

    @pytest.mark.asyncio
    async def test_result_exists_true(self, provider, mock_s3_client):
        """Test checking existence of an existing result."""
        mock_s3_client.head_object.return_value = {}

        exists = await provider.result_exists("proj-1", ResultType.SOLVER_RESULTS)

        assert exists is True
        mock_s3_client.head_object.assert_called_once()

    @pytest.mark.asyncio
    async def test_result_exists_false(self, provider, mock_s3_client):
        """Test checking existence of a non-existent result."""
        from botocore.exceptions import ClientError

        mock_s3_client.head_object.side_effect = ClientError(
            {"Error": {"Code": "404"}}, "HeadObject"
        )

        exists = await provider.result_exists("proj-1", ResultType.SOLVER_RESULTS)

        assert exists is False

    @pytest.mark.asyncio
    async def test_delete_results(self, provider, mock_s3_client):
        """Test deleting all results for a project."""
        # Mock paginator
        mock_paginator = MagicMock()
        mock_paginator.paginate.return_value = [
            {
                "Contents": [
                    {"Key": "results/proj-1/solver_results.json"},
                    {"Key": "results/proj-1/radiation_pattern.json"},
                ]
            }
        ]
        mock_s3_client.get_paginator.return_value = mock_paginator

        deleted = await provider.delete_results("proj-1")

        assert deleted == 2
        mock_s3_client.delete_objects.assert_called_once()


class TestS3ProviderInitialization:
    """Test S3 provider initialization and configuration."""

    def test_default_bucket_name_from_env(self):
        """Test bucket name defaults from environment."""
        with patch.dict("os.environ", {"RESULTS_BUCKET_NAME": "my-bucket"}):
            provider = S3ResultsProvider()
            assert provider.bucket_name == "my-bucket"

    def test_default_endpoint_from_env(self):
        """Test endpoint URL from environment."""
        with patch.dict("os.environ", {"S3_ENDPOINT_URL": "http://minio:9000"}):
            provider = S3ResultsProvider()
            assert provider.endpoint_url == "http://minio:9000"

    def test_custom_bucket_name(self):
        """Test custom bucket name override."""
        provider = S3ResultsProvider(bucket_name="custom-bucket")
        assert provider.bucket_name == "custom-bucket"
