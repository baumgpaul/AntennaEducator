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
    generate_content_preview,
)


class TestDocumentationMetaSchema:
    """Test the DocumentationMeta Pydantic model."""

    def test_default_values(self):
        """DocumentationMeta should have sensible defaults."""
        meta = DocumentationMeta()
        assert meta.has_content is False
        assert meta.content_preview == ""
        assert meta.image_keys == []
        assert meta.last_edited is None
        assert meta.last_edited_by is None

    def test_with_all_fields(self):
        """DocumentationMeta should accept all fields."""
        meta = DocumentationMeta(
            has_content=True,
            content_preview="Antenna design notes",
            image_keys=["img_abc.png", "diagram.svg"],
            last_edited="2026-02-22T10:00:00+00:00",
            last_edited_by="user-123",
        )
        assert meta.has_content is True
        assert meta.content_preview == "Antenna design notes"
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

    def test_project_list_response_documentation_preview(self):
        """ProjectListResponse should include documentation_preview."""
        item = ProjectListResponse(
            id="proj-1",
            user_id="user-1",
            name="Test",
            created_at="2026-01-01T00:00:00+00:00",
            updated_at="2026-01-01T00:00:00+00:00",
            has_documentation=True,
            documentation_preview="Antenna design notes for dipole",
        )
        assert item.documentation_preview == "Antenna design notes for dipole"

    def test_project_list_response_documentation_preview_default(self):
        """ProjectListResponse should default documentation_preview to empty."""
        item = ProjectListResponse(
            id="proj-1",
            user_id="user-1",
            name="Test",
            created_at="2026-01-01T00:00:00+00:00",
            updated_at="2026-01-01T00:00:00+00:00",
        )
        assert item.documentation_preview == ""


class TestGenerateContentPreview:
    """Test the generate_content_preview helper function."""

    def test_empty_string(self):
        assert generate_content_preview("") == ""

    def test_whitespace_only(self):
        assert generate_content_preview("   \n\n  ") == ""

    def test_plain_text(self):
        text = "This is a simple paragraph."
        assert generate_content_preview(text) == "This is a simple paragraph."

    def test_strips_headings(self):
        text = "# Main Title\n\nSome content here."
        preview = generate_content_preview(text)
        assert "# " not in preview
        assert "Main Title" in preview
        assert "Some content here." in preview

    def test_strips_bold_italic(self):
        text = "This is **bold** and *italic* text."
        preview = generate_content_preview(text)
        assert "**" not in preview
        assert "*" not in preview
        assert "bold" in preview
        assert "italic" in preview

    def test_strips_images(self):
        text = "Before ![alt text](http://img.png) after."
        preview = generate_content_preview(text)
        assert "![" not in preview
        assert "Before" in preview
        assert "after." in preview

    def test_keeps_link_text(self):
        text = "See [documentation](https://example.com) for details."
        preview = generate_content_preview(text)
        assert "documentation" in preview
        assert "https://example.com" not in preview

    def test_replaces_block_math(self):
        text = "Before $$\\int_0^1 x^2 dx$$ after."
        preview = generate_content_preview(text)
        assert "[formula]" in preview
        assert "\\int" not in preview

    def test_replaces_inline_math(self):
        text = "The impedance $Z = R + jX$ is complex."
        preview = generate_content_preview(text)
        assert "[formula]" in preview
        assert "$" not in preview

    def test_strips_blockquotes(self):
        text = "> This is a quote\n\nNormal text."
        preview = generate_content_preview(text)
        assert "> " not in preview
        assert "quote" in preview

    def test_strips_code_backticks(self):
        text = "Use `print()` to output."
        preview = generate_content_preview(text)
        assert "`" not in preview
        assert "print()" in preview

    def test_truncates_long_text(self):
        text = "word " * 100  # 500 chars
        preview = generate_content_preview(text)
        assert len(preview) <= 201  # 200 + ellipsis
        assert preview.endswith("\u2026")

    def test_truncates_at_word_boundary(self):
        """Should not cut in the middle of a word."""
        text = "a " * 150
        preview = generate_content_preview(text)
        assert (
            not preview.endswith("a\u2026")
            or preview.endswith(" a\u2026")
            or preview.endswith("a\u2026")
        )
        # Just verify it's not cutting mid-word for longer words
        text2 = "longword " * 40
        preview2 = generate_content_preview(text2)
        assert preview2.endswith("\u2026")
        # Should end at a word boundary
        without_ellipsis = preview2[:-1]
        assert without_ellipsis.endswith("longword")

    def test_strips_horizontal_rule(self):
        text = "Before\n\n---\n\nAfter"
        preview = generate_content_preview(text)
        assert "---" not in preview
        assert "Before" in preview
        assert "After" in preview
