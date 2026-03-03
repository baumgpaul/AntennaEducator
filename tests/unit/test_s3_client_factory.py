"""Unit tests for the shared S3 client factory."""

from unittest.mock import patch

from backend.common.storage.s3_client import create_s3_client, default_bucket_name


class TestDefaultBucketName:
    """Test default_bucket_name()."""

    def test_reads_results_bucket_name_env(self):
        with patch.dict("os.environ", {"RESULTS_BUCKET_NAME": "custom-bucket"}):
            assert default_bucket_name() == "custom-bucket"

    def test_falls_back_to_environment_suffix(self):
        with patch.dict(
            "os.environ",
            {"ENVIRONMENT": "staging"},
            clear=True,
        ):
            assert default_bucket_name() == "antenna-simulator-results-staging"

    def test_falls_back_to_dev_when_no_env(self):
        with patch.dict("os.environ", {}, clear=True):
            assert default_bucket_name() == "antenna-simulator-results-dev"


class TestCreateS3Client:
    """Test create_s3_client()."""

    @patch("backend.common.storage.s3_client.boto3")
    def test_plain_aws_client(self, mock_boto3):
        """Without endpoint_url, creates a simple regional client."""
        create_s3_client(region_name="us-east-1")

        mock_boto3.client.assert_called_once_with(
            "s3", region_name="us-east-1"
        )

    @patch("backend.common.storage.s3_client.boto3")
    def test_local_minio_client(self, mock_boto3):
        """localhost endpoint adds MinIO credentials."""
        create_s3_client(endpoint_url="http://localhost:9000", region_name="eu-west-1")

        call_kwargs = mock_boto3.client.call_args
        assert call_kwargs[1]["endpoint_url"] == "http://localhost:9000"
        assert call_kwargs[1]["aws_access_key_id"] == "minioadmin"
        assert call_kwargs[1]["aws_secret_access_key"] == "minioadmin"

    @patch("backend.common.storage.s3_client.boto3")
    def test_minio_docker_client(self, mock_boto3):
        """Docker minio:9000 endpoint adds MinIO credentials."""
        create_s3_client(endpoint_url="http://minio:9000", region_name="eu-west-1")

        call_kwargs = mock_boto3.client.call_args
        assert call_kwargs[1]["endpoint_url"] == "http://minio:9000"
        assert "aws_access_key_id" in call_kwargs[1]

    @patch("backend.common.storage.s3_client.boto3")
    def test_real_s3_endpoint_no_local_creds(self, mock_boto3):
        """Non-local endpoint should NOT inject MinIO credentials."""
        create_s3_client(
            endpoint_url="https://s3.eu-west-1.amazonaws.com",
            region_name="eu-west-1",
        )

        call_kwargs = mock_boto3.client.call_args[1]
        assert "aws_access_key_id" not in call_kwargs

    @patch("backend.common.storage.s3_client.boto3")
    def test_defaults_from_env(self, mock_boto3):
        """Reads S3_ENDPOINT_URL and AWS_REGION from env."""
        with patch.dict(
            "os.environ",
            {"S3_ENDPOINT_URL": "http://localhost:9000", "AWS_REGION": "ap-southeast-1"},
        ):
            create_s3_client()

        call_kwargs = mock_boto3.client.call_args[1]
        assert call_kwargs["endpoint_url"] == "http://localhost:9000"
        assert call_kwargs["region_name"] == "ap-southeast-1"

    @patch("backend.common.storage.s3_client.boto3")
    def test_127_0_0_1_detected_as_local(self, mock_boto3):
        """127.0.0.1 endpoint should inject local credentials."""
        create_s3_client(endpoint_url="http://127.0.0.1:9000")

        call_kwargs = mock_boto3.client.call_args[1]
        assert "aws_access_key_id" in call_kwargs
