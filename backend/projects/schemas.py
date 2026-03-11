"""Pydantic schemas for the Projects API — v2.

Changes from v1:
- ``description`` is human text only (no more JSON-encoded elements)
- New JSON blob fields: ``design_state``, ``simulation_config``,
  ``simulation_results``, ``ui_state``
- Removed: ``ProjectElement*``, ``Result*``, ``requested_fields``,
  ``view_configurations``, ``solver_state``
- Auth schemas moved to ``backend.auth.schemas``
"""

import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

# Maximum length for the plain-text content preview stored in DynamoDB.
CONTENT_PREVIEW_MAX_LENGTH = 200


def generate_content_preview(markdown: str) -> str:
    """Strip Markdown formatting and return a short plain-text preview.

    Used to store a lightweight snippet in DynamoDB so the project list
    can display a documentation summary without fetching from S3.
    """
    if not markdown or not markdown.strip():
        return ""
    text = markdown
    # Remove images: ![alt](url)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
    # Remove links but keep text: [text](url) → text
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    # Remove headings markers
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.MULTILINE)
    # Remove bold/italic markers
    text = re.sub(r"(\*{1,3}|_{1,3})", "", text)
    # Remove inline code backticks
    text = re.sub(r"`{1,3}", "", text)
    # Remove block math $$...$$
    text = re.sub(r"\$\$[^$]*\$\$", "[formula]", text, flags=re.DOTALL)
    # Remove inline math $...$
    text = re.sub(r"\$[^$]+\$", "[formula]", text)
    # Remove blockquote markers
    text = re.sub(r"^>\s?", "", text, flags=re.MULTILINE)
    # Remove horizontal rules
    text = re.sub(r"^[-*_]{3,}\s*$", "", text, flags=re.MULTILINE)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > CONTENT_PREVIEW_MAX_LENGTH:
        return text[:CONTENT_PREVIEW_MAX_LENGTH].rsplit(" ", 1)[0] + "…"
    return text


# ── Documentation Metadata ────────────────────────────────────────────────────


class DocumentationMeta(BaseModel):
    """Lightweight metadata stored in DynamoDB for documentation.

    The actual Markdown content and images live in S3 under
    ``projects/{project_id}/documentation/``.
    Only flags and the image manifest are kept here to stay
    well within the DynamoDB 400 KB item limit.
    """

    has_content: bool = False
    content_preview: str = ""
    image_keys: List[str] = Field(default_factory=list)
    last_edited: Optional[str] = None
    last_edited_by: Optional[str] = None


# ── Folder Schemas ────────────────────────────────────────────────────────────


class FolderCreate(BaseModel):
    """Schema for creating a folder."""

    name: str = Field(..., min_length=1, max_length=100)
    parent_folder_id: Optional[str] = Field(
        None,
        description="Parent folder ID. None = root level.",
    )


class FolderUpdate(BaseModel):
    """Schema for updating a folder — all fields optional."""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    parent_folder_id: Optional[str] = Field(
        None,
        description="Move folder under a new parent (empty string = root).",
    )


class FolderResponse(BaseModel):
    """Full folder response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    owner_id: str
    name: str
    parent_folder_id: Optional[str] = None
    is_course: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class CourseCreate(BaseModel):
    """Schema for creating a public course folder (maintainer/admin only)."""

    name: str = Field(..., min_length=1, max_length=100)
    parent_folder_id: Optional[str] = Field(
        None,
        description="Parent course folder ID. None = top-level course.",
    )


class CourseOwnerUpdate(BaseModel):
    """Schema for reassigning a course owner (admin only)."""

    new_owner_id: str = Field(..., description="New owner user ID.")


class DeepCopyRequest(BaseModel):
    """Schema for deep-copying a course (or project) into the user's space."""

    target_folder_id: Optional[str] = Field(
        None,
        description="Destination folder in the user's space. None = root.",
    )


class UserRoleUpdate(BaseModel):
    """Schema for admin role management."""

    role: str = Field(
        ...,
        description="New role: 'user', 'maintainer', or 'admin'.",
    )


class UserListResponse(BaseModel):
    """Schema for listing users (admin only)."""

    model_config = ConfigDict(from_attributes=True)

    user_id: str
    email: str
    username: str
    role: str = "user"
    is_locked: bool = False
    created_at: Optional[str] = None


# ── Project Schemas ───────────────────────────────────────────────────────────


class ProjectBase(BaseModel):
    """Fields shared by create / update / response."""

    name: str = Field(..., min_length=3, max_length=100)
    project_type: str = Field(
        "peec",
        description="Simulation method: 'peec' (default) or 'fdtd'.",
        pattern=r"^(peec|fdtd)$",
    )
    description: Optional[str] = Field(
        None,
        description="Human-readable project description (also accepts legacy JSON-encoded elements)",
    )
    design_state: Optional[Dict[str, Any]] = Field(
        None,
        description=(
            "Full snapshot of the design: elements, sources, lumped elements, "
            "positions, rotations, visibility. Versioned via 'version' key."
        ),
    )
    simulation_config: Optional[Dict[str, Any]] = Field(
        None,
        description=(
            "Solver / postprocessor settings: method (peec / fem), "
            "frequency config, requested fields, postprocessing views."
        ),
    )
    simulation_results: Optional[Dict[str, Any]] = Field(
        None,
        description=(
            "Solver output summary + S3 references for heavy data. "
            "Contains method, frequency sweep results, result S3 keys, metadata."
        ),
    )
    ui_state: Optional[Dict[str, Any]] = Field(
        None,
        description="Frontend-only state: selected tabs, camera position, etc.",
    )
    documentation: Optional[Dict[str, Any]] = Field(
        None,
        description=(
            "Documentation metadata (has_content flag, image manifest). "
            "Full content stored in S3."
        ),
    )


class ProjectCreate(ProjectBase):
    """Schema for creating a project."""

    folder_id: Optional[str] = Field(
        None, description="Folder to place the project in. None = root."
    )


class ProjectUpdate(BaseModel):
    """Schema for updating a project — all fields optional."""

    name: Optional[str] = Field(None, min_length=3, max_length=100)
    project_type: Optional[str] = Field(
        None,
        description="Simulation method: 'peec' or 'fdtd'.",
        pattern=r"^(peec|fdtd)$",
    )
    description: Optional[str] = Field(None)
    design_state: Optional[Dict[str, Any]] = None
    simulation_config: Optional[Dict[str, Any]] = None
    simulation_results: Optional[Dict[str, Any]] = None
    ui_state: Optional[Dict[str, Any]] = None
    documentation: Optional[Dict[str, Any]] = None
    folder_id: Optional[str] = Field(None, description="Move project to a different folder.")


class ProjectResponse(ProjectBase):
    """Full project response (single project view)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    folder_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    last_opened_at: Optional[datetime] = None


class ProjectListResponse(BaseModel):
    """Lightweight project list item (no large JSON blobs)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    name: str
    project_type: str = "peec"
    description: Optional[str] = None
    folder_id: Optional[str] = None
    has_documentation: bool = False
    documentation_preview: str = ""
    created_at: datetime
    updated_at: datetime
    last_opened_at: Optional[datetime] = None


# ── Documentation API Schemas ─────────────────────────────────────────────────


class DocumentationContentRequest(BaseModel):
    """Request body for saving documentation content."""

    content: str = Field(
        "",
        max_length=500_000,
        description="Markdown content to save (max 500 KB).",
    )


class DocumentationContentResponse(BaseModel):
    """Response body for documentation content."""

    content: str = ""
    version: int = 1


class ImageUploadRequest(BaseModel):
    """Request body for generating an image upload URL."""

    filename: str = Field(
        ...,
        max_length=255,
        description="Original filename (for extension detection).",
    )
    content_type: Optional[str] = Field(
        None,
        description="MIME type. Auto-detected from filename if omitted.",
    )


class ImageUploadResponse(BaseModel):
    """Response body for a presigned image upload URL."""

    upload_url: str
    image_key: str
    s3_key: str
    content_type: str


class ImageUrlResponse(BaseModel):
    """Response body for a presigned image GET URL."""

    url: str
