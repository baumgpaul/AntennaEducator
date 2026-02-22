"""Unit tests for DocumentationService — S3-backed markdown + image storage."""

from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError

from backend.projects.documentation_service import DocumentationService


class TestDocumentationService:
    """Test DocumentationService for S3 documentation management."""

    @pytest.fixture
    def mock_s3_client(self):
        """Create a mock S3 client."""
        return MagicMock()

    @pytest.fixture
    def service(self, mock_s3_client):
        """Create DocumentationService with mocked S3."""
        return DocumentationService(
            bucket_name="test-bucket",
            s3_client=mock_s3_client,
        )

    # ── Content save/load ─────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_save_content(self, service, mock_s3_client):
        """save_content should store markdown as JSON in S3."""
        await service.save_content("proj-1", "# Hello World\n\nSome text.")

        mock_s3_client.put_object.assert_called_once()
        call_kwargs = mock_s3_client.put_object.call_args[1]
        assert call_kwargs["Bucket"] == "test-bucket"
        assert call_kwargs["Key"] == "projects/proj-1/documentation/content.json"
        assert call_kwargs["ContentType"] == "application/json"
        # Body should be valid JSON with content + version
        import json

        body = json.loads(call_kwargs["Body"])
        assert body["content"] == "# Hello World\n\nSome text."
        assert body["version"] == 1

    @pytest.mark.asyncio
    async def test_save_empty_content(self, service, mock_s3_client):
        """save_content with empty string should still persist."""
        await service.save_content("proj-1", "")

        mock_s3_client.put_object.assert_called_once()
        import json

        body = json.loads(mock_s3_client.put_object.call_args[1]["Body"])
        assert body["content"] == ""

    @pytest.mark.asyncio
    async def test_load_content_exists(self, service, mock_s3_client):
        """load_content should return markdown from S3."""
        import json

        mock_s3_client.get_object.return_value = {
            "Body": MagicMock(
                read=MagicMock(
                    return_value=json.dumps(
                        {"content": "# Title\n\nBody text.", "version": 1}
                    ).encode("utf-8")
                )
            )
        }

        result = await service.load_content("proj-1")
        assert result == {"content": "# Title\n\nBody text.", "version": 1}

        mock_s3_client.get_object.assert_called_once_with(
            Bucket="test-bucket",
            Key="projects/proj-1/documentation/content.json",
        )

    @pytest.mark.asyncio
    async def test_load_content_not_found(self, service, mock_s3_client):
        """load_content should return None when no documentation exists."""
        error_response = {"Error": {"Code": "NoSuchKey"}}
        mock_s3_client.get_object.side_effect = ClientError(error_response, "GetObject")

        result = await service.load_content("proj-1")
        assert result is None

    @pytest.mark.asyncio
    async def test_delete_content(self, service, mock_s3_client):
        """delete_content should remove the content.json from S3."""
        await service.delete_content("proj-1")

        mock_s3_client.delete_object.assert_called_once_with(
            Bucket="test-bucket",
            Key="projects/proj-1/documentation/content.json",
        )

    # ── Image upload (presigned URL) ──────────────────────────────────────

    @pytest.mark.asyncio
    async def test_generate_upload_url(self, service, mock_s3_client):
        """generate_upload_url should return a presigned PUT URL + image key."""
        mock_s3_client.generate_presigned_url.return_value = "https://s3.example.com/presigned-put"

        result = await service.generate_upload_url("proj-1", "screenshot.png", "image/png")

        assert "upload_url" in result
        assert "image_key" in result
        assert result["upload_url"] == "https://s3.example.com/presigned-put"
        assert result["image_key"].endswith(".png")
        # S3 key should be under projects/{pid}/documentation/images/
        assert result["s3_key"].startswith("projects/proj-1/documentation/images/")

        mock_s3_client.generate_presigned_url.assert_called_once()
        call_args = mock_s3_client.generate_presigned_url.call_args
        assert call_args[0][0] == "put_object"
        params = call_args[1]["Params"]
        assert params["Bucket"] == "test-bucket"
        assert params["ContentType"] == "image/png"

    @pytest.mark.asyncio
    async def test_generate_upload_url_default_content_type(self, service, mock_s3_client):
        """generate_upload_url should default to image/png."""
        mock_s3_client.generate_presigned_url.return_value = "https://s3.example.com/presigned-put"

        result = await service.generate_upload_url("proj-1", "photo.jpg")

        call_params = mock_s3_client.generate_presigned_url.call_args[1]["Params"]
        assert call_params["ContentType"] == "image/jpeg"

    @pytest.mark.asyncio
    async def test_generate_upload_url_rejects_invalid_type(self, service, mock_s3_client):
        """generate_upload_url should reject non-image content types."""
        with pytest.raises(ValueError, match="Unsupported"):
            await service.generate_upload_url("proj-1", "malware.exe", "application/octet-stream")

    @pytest.mark.asyncio
    async def test_generate_upload_url_size_limit(self, service, mock_s3_client):
        """generate_upload_url presigned URL should have expiration."""
        mock_s3_client.generate_presigned_url.return_value = "https://s3.example.com/presigned-put"

        await service.generate_upload_url("proj-1", "img.png", "image/png")

        call_kwargs = mock_s3_client.generate_presigned_url.call_args[1]
        # Should expire within a reasonable time (e.g., 15 minutes)
        assert call_kwargs["ExpiresIn"] <= 900

    # ── Image retrieval (presigned GET URL) ───────────────────────────────

    @pytest.mark.asyncio
    async def test_get_image_url(self, service, mock_s3_client):
        """get_image_url should return a presigned GET URL."""
        mock_s3_client.generate_presigned_url.return_value = "https://s3.example.com/presigned-get"

        url = await service.get_image_url("proj-1", "img_abc123def456.png")

        assert url == "https://s3.example.com/presigned-get"
        call_args = mock_s3_client.generate_presigned_url.call_args
        assert call_args[0][0] == "get_object"
        params = call_args[1]["Params"]
        assert params["Key"] == "projects/proj-1/documentation/images/img_abc123def456.png"

    # ── Image deletion ────────────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_delete_image(self, service, mock_s3_client):
        """delete_image should remove a single image from S3."""
        await service.delete_image("proj-1", "img_abc123def456.png")

        mock_s3_client.delete_object.assert_called_once_with(
            Bucket="test-bucket",
            Key="projects/proj-1/documentation/images/img_abc123def456.png",
        )

    @pytest.mark.asyncio
    async def test_delete_all_documentation(self, service, mock_s3_client):
        """delete_all should remove content + all images for a project."""
        # Mock listing objects
        mock_s3_client.get_paginator.return_value.paginate.return_value = [
            {
                "Contents": [
                    {"Key": "projects/proj-1/documentation/content.json"},
                    {"Key": "projects/proj-1/documentation/images/img1.png"},
                    {"Key": "projects/proj-1/documentation/images/img2.jpg"},
                ]
            }
        ]

        deleted = await service.delete_all("proj-1")

        assert deleted == 3
        mock_s3_client.delete_objects.assert_called_once()
        delete_call = mock_s3_client.delete_objects.call_args[1]
        assert len(delete_call["Delete"]["Objects"]) == 3

    @pytest.mark.asyncio
    async def test_delete_all_empty_project(self, service, mock_s3_client):
        """delete_all should handle project with no documentation."""
        mock_s3_client.get_paginator.return_value.paginate.return_value = [{"Contents": []}]

        deleted = await service.delete_all("proj-1")
        assert deleted == 0

    # ── Key generation ────────────────────────────────────────────────────

    def test_content_key(self, service):
        """content_key should return the correct S3 key."""
        assert service.content_key("proj-1") == "projects/proj-1/documentation/content.json"

    def test_image_key(self, service):
        """image_key should return the correct S3 key."""
        assert (
            service.image_key("proj-1", "img_abc.png")
            == "projects/proj-1/documentation/images/img_abc.png"
        )

    # ── Content type detection ────────────────────────────────────────────

    def test_detect_content_type_png(self, service):
        """Should detect PNG from filename."""
        assert service._detect_content_type("screenshot.png") == "image/png"

    def test_detect_content_type_jpg(self, service):
        """Should detect JPEG from .jpg extension."""
        assert service._detect_content_type("photo.jpg") == "image/jpeg"

    def test_detect_content_type_jpeg(self, service):
        """Should detect JPEG from .jpeg extension."""
        assert service._detect_content_type("photo.jpeg") == "image/jpeg"

    def test_detect_content_type_svg(self, service):
        """Should detect SVG from filename."""
        assert service._detect_content_type("diagram.svg") == "image/svg+xml"

    def test_detect_content_type_gif(self, service):
        """Should detect GIF from filename."""
        assert service._detect_content_type("animation.gif") == "image/gif"

    def test_detect_content_type_webp(self, service):
        """Should detect WebP from filename."""
        assert service._detect_content_type("photo.webp") == "image/webp"

    def test_detect_content_type_unknown(self, service):
        """Should default to image/png for unknown extensions."""
        assert service._detect_content_type("file.bmp") == "image/png"

    # ── Image key validation ──────────────────────────────────────────────

    def test_validate_image_key_valid(self, service):
        """Should accept valid image keys."""
        service.validate_image_key("img_abc123def456.png")
        service.validate_image_key("img_0123456789ab.jpeg")
        service.validate_image_key("img_fedcba987654.svg")
        service.validate_image_key("img_aabbccddee01.webp")

    def test_validate_image_key_path_traversal(self, service):
        """Should reject path traversal attempts."""
        with pytest.raises(ValueError, match="Invalid image key"):
            service.validate_image_key("../../secrets.json")

    def test_validate_image_key_no_prefix(self, service):
        """Should reject keys without the img_ prefix."""
        with pytest.raises(ValueError, match="Invalid image key"):
            service.validate_image_key("screenshot.png")

    def test_validate_image_key_too_short(self, service):
        """Should reject keys with wrong hex length."""
        with pytest.raises(ValueError, match="Invalid image key"):
            service.validate_image_key("img_abc.png")

    def test_validate_image_key_special_chars(self, service):
        """Should reject keys with special characters."""
        with pytest.raises(ValueError, match="Invalid image key"):
            service.validate_image_key("img_abc123def456/../x.png")
