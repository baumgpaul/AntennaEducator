"""Unit tests for documentation API endpoints.

Tests the REST API layer for documentation CRUD:
  GET    /api/projects/{pid}/documentation
  PUT    /api/projects/{pid}/documentation
  POST   /api/projects/{pid}/documentation/images
  GET    /api/projects/{pid}/documentation/images/{key}
  DELETE /api/projects/{pid}/documentation/images/{key}
"""

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from backend.common.auth import UserIdentity
from backend.projects.main import app

# ── Fixtures ──────────────────────────────────────────────────────────────────

TEST_USER = UserIdentity(
    id="user-test-123",
    email="test@example.com",
    username="testuser",
)

OTHER_USER = UserIdentity(
    id="user-other-456",
    email="other@example.com",
    username="otheruser",
)

MOCK_PROJECT = {
    "id": "proj-abc",
    "user_id": "user-test-123",
    "name": "Test Project",
    "description": "A test project",
    "design_state": {},
    "simulation_config": {},
    "simulation_results": {},
    "ui_state": {},
    "documentation": {},
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00",
}


@pytest.fixture
def mock_deps():
    """Override auth + repository + documentation service dependencies."""
    from backend.common.auth.dependencies import get_current_user
    from backend.projects.documentation_service import DocumentationService
    from backend.projects.main import _get_doc_service, get_repository

    mock_repo = MagicMock()
    mock_repo.get_project = AsyncMock(return_value=MOCK_PROJECT)
    mock_repo.update_project = AsyncMock(return_value=MOCK_PROJECT)

    mock_doc_svc = MagicMock(spec=DocumentationService)
    mock_doc_svc.save_content = AsyncMock(
        return_value="projects/proj-abc/documentation/content.json"
    )
    mock_doc_svc.load_content = AsyncMock(return_value=None)
    mock_doc_svc.delete_content = AsyncMock()
    mock_doc_svc.generate_upload_url = AsyncMock(
        return_value={
            "upload_url": "https://s3.example.com/presigned-put",
            "image_key": "img_abc123def456.png",
            "s3_key": "projects/proj-abc/documentation/images/img_abc123def456.png",
            "content_type": "image/png",
        }
    )
    mock_doc_svc.get_image_url = AsyncMock(return_value="https://s3.example.com/presigned-get")
    mock_doc_svc.delete_image = AsyncMock()

    app.dependency_overrides[get_current_user] = lambda: TEST_USER
    app.dependency_overrides[get_repository] = lambda: mock_repo
    app.dependency_overrides[_get_doc_service] = lambda: mock_doc_svc

    yield {"repo": mock_repo, "doc_svc": mock_doc_svc}

    app.dependency_overrides.clear()


@pytest.fixture
def client(mock_deps):
    """Create a test client with mocked dependencies."""
    return TestClient(app)


# ── GET /api/projects/{pid}/documentation ─────────────────────────────────────


class TestGetDocumentation:
    """Test retrieving documentation content."""

    def test_get_documentation_exists(self, client, mock_deps):
        """Should return stored documentation content."""
        mock_deps["doc_svc"].load_content.return_value = {
            "content": "# Hello World",
            "version": 1,
        }

        response = client.get("/api/projects/proj-abc/documentation")
        assert response.status_code == 200

        data = response.json()
        assert data["content"] == "# Hello World"
        assert data["version"] == 1
        mock_deps["doc_svc"].load_content.assert_called_once_with("proj-abc")

    def test_get_documentation_empty(self, client, mock_deps):
        """Should return empty content when no documentation exists."""
        mock_deps["doc_svc"].load_content.return_value = None

        response = client.get("/api/projects/proj-abc/documentation")
        assert response.status_code == 200

        data = response.json()
        assert data["content"] == ""
        assert data["version"] == 1

    def test_get_documentation_project_not_found(self, client, mock_deps):
        """Should return 404 for non-existent project."""
        mock_deps["repo"].get_project.return_value = None

        response = client.get("/api/projects/nonexistent/documentation")
        assert response.status_code == 404

    def test_get_documentation_wrong_user(self, client, mock_deps):
        """Should return 404 if project belongs to another user."""
        mock_deps["repo"].get_project.return_value = {
            **MOCK_PROJECT,
            "user_id": "user-other-456",
        }

        response = client.get("/api/projects/proj-abc/documentation")
        assert response.status_code == 404


# ── PUT /api/projects/{pid}/documentation ─────────────────────────────────────


class TestSaveDocumentation:
    """Test saving documentation content."""

    def test_save_documentation(self, client, mock_deps):
        """Should save content to S3 and update DynamoDB metadata."""
        response = client.put(
            "/api/projects/proj-abc/documentation",
            json={"content": "# Updated\n\nNew content here."},
        )
        assert response.status_code == 200

        mock_deps["doc_svc"].save_content.assert_called_once_with(
            "proj-abc", "# Updated\n\nNew content here."
        )
        # Should update documentation metadata in DynamoDB
        mock_deps["repo"].update_project.assert_called_once()
        call_kwargs = mock_deps["repo"].update_project.call_args[1]
        assert call_kwargs["project_id"] == "proj-abc"
        doc_meta = call_kwargs["documentation"]
        assert doc_meta["has_content"] is True
        assert doc_meta["content_preview"] == "Updated New content here."

    def test_save_empty_documentation(self, client, mock_deps):
        """Should save empty content and set has_content=False."""
        response = client.put(
            "/api/projects/proj-abc/documentation",
            json={"content": ""},
        )
        assert response.status_code == 200

        mock_deps["doc_svc"].save_content.assert_called_once_with("proj-abc", "")
        call_kwargs = mock_deps["repo"].update_project.call_args[1]
        assert call_kwargs["documentation"]["has_content"] is False
        assert call_kwargs["documentation"]["content_preview"] == ""

    def test_save_documentation_project_not_found(self, client, mock_deps):
        """Should return 404 for non-existent project."""
        mock_deps["repo"].get_project.return_value = None

        response = client.put(
            "/api/projects/nonexistent/documentation",
            json={"content": "# Test"},
        )
        assert response.status_code == 404


# ── POST /api/projects/{pid}/documentation/images ────────────────────────────


class TestUploadImage:
    """Test image upload URL generation."""

    def test_generate_upload_url(self, client, mock_deps):
        """Should return presigned upload URL + image key."""
        response = client.post(
            "/api/projects/proj-abc/documentation/images",
            json={"filename": "screenshot.png", "content_type": "image/png"},
        )
        assert response.status_code == 200

        data = response.json()
        assert "upload_url" in data
        assert "image_key" in data
        assert "s3_key" in data
        mock_deps["doc_svc"].generate_upload_url.assert_called_once_with(
            "proj-abc", "screenshot.png", "image/png"
        )

    def test_generate_upload_url_auto_detect_type(self, client, mock_deps):
        """Should work without explicit content_type."""
        response = client.post(
            "/api/projects/proj-abc/documentation/images",
            json={"filename": "photo.jpg"},
        )
        assert response.status_code == 200
        mock_deps["doc_svc"].generate_upload_url.assert_called_once_with(
            "proj-abc", "photo.jpg", None
        )

    def test_generate_upload_url_invalid_type(self, client, mock_deps):
        """Should return 400 for unsupported content types."""
        mock_deps["doc_svc"].generate_upload_url.side_effect = ValueError(
            "Unsupported content type"
        )

        response = client.post(
            "/api/projects/proj-abc/documentation/images",
            json={"filename": "malware.exe", "content_type": "application/octet-stream"},
        )
        assert response.status_code == 400

    def test_generate_upload_url_project_not_found(self, client, mock_deps):
        """Should return 404 for non-existent project."""
        mock_deps["repo"].get_project.return_value = None

        response = client.post(
            "/api/projects/nonexistent/documentation/images",
            json={"filename": "img.png"},
        )
        assert response.status_code == 404


# ── GET /api/projects/{pid}/documentation/images/{key} ───────────────────────


class TestGetImageUrl:
    """Test image URL retrieval."""

    def test_get_image_url(self, client, mock_deps):
        """Should return presigned GET URL for an image."""
        response = client.get("/api/projects/proj-abc/documentation/images/img_abc123.png")
        assert response.status_code == 200

        data = response.json()
        assert data["url"] == "https://s3.example.com/presigned-get"
        mock_deps["doc_svc"].get_image_url.assert_called_once_with("proj-abc", "img_abc123.png")


# ── DELETE /api/projects/{pid}/documentation/images/{key} ────────────────────


class TestDeleteImage:
    """Test image deletion."""

    def test_delete_image(self, client, mock_deps):
        """Should delete image from S3 and update metadata."""
        # Project has documentation with the image in its manifest
        mock_deps["repo"].get_project.return_value = {
            **MOCK_PROJECT,
            "documentation": {
                "has_content": True,
                "image_keys": ["img_abc123.png", "other.jpg"],
            },
        }

        response = client.delete("/api/projects/proj-abc/documentation/images/img_abc123.png")
        assert response.status_code == 204

        mock_deps["doc_svc"].delete_image.assert_called_once_with("proj-abc", "img_abc123.png")
        # Should update DynamoDB to remove image from manifest
        mock_deps["repo"].update_project.assert_called_once()
        call_kwargs = mock_deps["repo"].update_project.call_args[1]
        assert "img_abc123.png" not in call_kwargs["documentation"]["image_keys"]
        assert "other.jpg" in call_kwargs["documentation"]["image_keys"]

    def test_delete_image_project_not_found(self, client, mock_deps):
        """Should return 404 for non-existent project."""
        mock_deps["repo"].get_project.return_value = None

        response = client.delete("/api/projects/nonexistent/documentation/images/img.png")
        assert response.status_code == 404


# ── GET /api/projects (list with documentation preview) ──────────────────────


class TestListProjectsDocumentation:
    """Test that list_projects returns documentation preview."""

    def test_list_projects_with_preview(self, client, mock_deps):
        """Should include documentation_preview in list response."""
        mock_deps["repo"].list_projects = AsyncMock(
            return_value=[
                {
                    "id": "proj-1",
                    "user_id": "user-test-123",
                    "name": "My Project",
                    "description": "A project",
                    "documentation": {
                        "has_content": True,
                        "content_preview": "Antenna design notes",
                        "image_keys": [],
                    },
                    "created_at": "2026-01-01T00:00:00+00:00",
                    "updated_at": "2026-01-01T00:00:00+00:00",
                }
            ]
        )

        response = client.get("/api/projects")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["has_documentation"] is True
        assert data[0]["documentation_preview"] == "Antenna design notes"

    def test_list_projects_no_documentation(self, client, mock_deps):
        """Should default preview to empty when no documentation."""
        mock_deps["repo"].list_projects = AsyncMock(
            return_value=[
                {
                    "id": "proj-2",
                    "user_id": "user-test-123",
                    "name": "Empty Project",
                    "description": "",
                    "documentation": {},
                    "created_at": "2026-01-01T00:00:00+00:00",
                    "updated_at": "2026-01-01T00:00:00+00:00",
                }
            ]
        )

        response = client.get("/api/projects")
        assert response.status_code == 200
        data = response.json()
        assert data[0]["has_documentation"] is False
        assert data[0]["documentation_preview"] == ""
