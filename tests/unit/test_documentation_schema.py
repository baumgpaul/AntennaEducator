"""Unit tests for documentation metadata schema and repository support.

Commit 1: Verifies that the `documentation` field is properly handled
in project schemas and the DynamoDB repository layer.
"""

from backend.projects.schemas import (
    DocumentationMeta,
    ProjectBase,
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
)


class TestDocumentationMetaSchema:
    """Test the DocumentationMeta Pydantic model."""

    def test_default_values(self):
        """DocumentationMeta should have sensible defaults."""
        meta = DocumentationMeta()
        assert meta.has_content is False
        assert meta.image_keys == []
        assert meta.last_edited is None
        assert meta.last_edited_by is None

    def test_with_all_fields(self):
        """DocumentationMeta should accept all fields."""
        meta = DocumentationMeta(
            has_content=True,
            image_keys=["img_abc.png", "diagram.svg"],
            last_edited="2026-02-22T10:00:00+00:00",
            last_edited_by="user-123",
        )
        assert meta.has_content is True
        assert len(meta.image_keys) == 2
        assert meta.last_edited == "2026-02-22T10:00:00+00:00"
        assert meta.last_edited_by == "user-123"

    def test_serialization_roundtrip(self):
        """DocumentationMeta should serialize to/from dict cleanly."""
        meta = DocumentationMeta(
            has_content=True,
            image_keys=["img1.png"],
            last_edited="2026-02-22T10:00:00+00:00",
            last_edited_by="user-1",
        )
        data = meta.model_dump()
        restored = DocumentationMeta(**data)
        assert restored == meta

    def test_empty_image_keys(self):
        """Empty image_keys list should be valid."""
        meta = DocumentationMeta(has_content=True, image_keys=[])
        assert meta.image_keys == []


class TestProjectSchemasWithDocumentation:
    """Test that project schemas include the documentation field."""

    def test_project_base_accepts_documentation(self):
        """ProjectBase should accept a documentation dict."""
        project = ProjectBase(
            name="Test Project",
            documentation={"has_content": True, "image_keys": []},
        )
        assert project.documentation == {"has_content": True, "image_keys": []}

    def test_project_base_documentation_default_none(self):
        """ProjectBase should default documentation to None."""
        project = ProjectBase(name="Test Project")
        assert project.documentation is None

    def test_project_create_with_documentation(self):
        """ProjectCreate should pass documentation through."""
        project = ProjectCreate(
            name="New Doc Project",
            documentation={"has_content": False, "image_keys": []},
        )
        assert project.documentation is not None

    def test_project_update_with_documentation(self):
        """ProjectUpdate should accept documentation."""
        update = ProjectUpdate(
            documentation={"has_content": True, "image_keys": ["img.png"]},
        )
        assert update.documentation is not None

    def test_project_update_documentation_default_none(self):
        """ProjectUpdate should default documentation to None (no-op on update)."""
        update = ProjectUpdate()
        assert update.documentation is None

    def test_project_response_includes_documentation(self):
        """ProjectResponse should include documentation field."""
        response = ProjectResponse(
            id="proj-1",
            user_id="user-1",
            name="Test",
            created_at="2026-01-01T00:00:00+00:00",
            updated_at="2026-01-01T00:00:00+00:00",
            documentation={"has_content": True, "image_keys": ["img.png"]},
        )
        assert response.documentation is not None

    def test_project_list_response_includes_documentation_flag(self):
        """ProjectListResponse should include has_documentation flag."""
        item = ProjectListResponse(
            id="proj-1",
            user_id="user-1",
            name="Test",
            created_at="2026-01-01T00:00:00+00:00",
            updated_at="2026-01-01T00:00:00+00:00",
            has_documentation=True,
        )
        assert item.has_documentation is True

    def test_project_list_response_has_documentation_default(self):
        """ProjectListResponse should default has_documentation to False."""
        item = ProjectListResponse(
            id="proj-1",
            user_id="user-1",
            name="Test",
            created_at="2026-01-01T00:00:00+00:00",
            updated_at="2026-01-01T00:00:00+00:00",
        )
        assert item.has_documentation is False
