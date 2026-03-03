"""Folder & Course management endpoints for the Projects service.

Mounted on the main Projects FastAPI app. Provides:
- User folder CRUD (create, list, update, delete)
- Public course CRUD (maintainer/admin)
- Deep-copy courses → user space
- Admin role management and course owner assignment
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from backend.common.auth import UserIdentity, get_current_user
from backend.common.auth.identity import UserRole
from backend.common.repositories.base import ProjectRepository
from backend.common.repositories.factory import get_project_repository
from backend.common.repositories.folder_repository import FolderRepository
from backend.common.repositories.user_repository import UserRepository
from backend.projects.documentation_service import DocumentationService, get_documentation_service
from backend.projects.schemas import (
    CourseCreate,
    CourseOwnerUpdate,
    DeepCopyRequest,
    FolderCreate,
    FolderResponse,
    FolderUpdate,
    ProjectListResponse,
    ProjectResponse,
    UserListResponse,
    UserRoleUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["folders"])

# ── Dependency helpers ────────────────────────────────────────────────────────

_folder_repo: Optional[FolderRepository] = None


def get_folder_repository() -> FolderRepository:
    global _folder_repo
    if _folder_repo is None:
        _folder_repo = FolderRepository()
    return _folder_repo


def get_repo() -> ProjectRepository:
    return get_project_repository()


def _get_user_repo() -> UserRepository:
    return UserRepository()


def _require_maintainer(user: UserIdentity) -> None:
    """Raise 403 if user is not maintainer or admin."""
    if user.role not in (UserRole.MAINTAINER, UserRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Maintainer or admin role required.",
        )


def _require_admin(user: UserIdentity) -> None:
    """Raise 403 if user is not admin."""
    if user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required.",
        )


# ══════════════════════════════════════════════════════════════════════════════
#  USER FOLDERS
# ══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/folders",
    response_model=FolderResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_folder(
    data: FolderCreate,
    user: UserIdentity = Depends(get_current_user),
    folder_repo: FolderRepository = Depends(get_folder_repository),
):
    """Create a new personal folder for the current user."""
    # Validate parent exists and belongs to user
    if data.parent_folder_id:
        parent = await folder_repo.get_folder(data.parent_folder_id)
        if not parent or parent["owner_id"] != user.id or parent["is_course"]:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                detail="Parent folder not found.",
            )

    folder = await folder_repo.create_folder(
        owner_id=user.id,
        name=data.name,
        parent_folder_id=data.parent_folder_id,
        is_course=False,
    )
    return folder


@router.get("/folders", response_model=List[FolderResponse])
async def list_folders(
    parent_folder_id: Optional[str] = Query(None),
    user: UserIdentity = Depends(get_current_user),
    folder_repo: FolderRepository = Depends(get_folder_repository),
):
    """List folders owned by the current user, optionally filtered by parent."""
    return await folder_repo.list_user_folders(user.id, parent_folder_id=parent_folder_id)


@router.get("/folders/{folder_id}", response_model=FolderResponse)
async def get_folder(
    folder_id: str,
    user: UserIdentity = Depends(get_current_user),
    folder_repo: FolderRepository = Depends(get_folder_repository),
):
    """Get a specific folder owned by the current user."""
    folder = await folder_repo.get_folder(folder_id)
    if not folder or folder["owner_id"] != user.id or folder["is_course"]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Folder not found.")
    return folder


@router.put("/folders/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: str,
    data: FolderUpdate,
    user: UserIdentity = Depends(get_current_user),
    folder_repo: FolderRepository = Depends(get_folder_repository),
):
    """Update a personal folder (rename, move)."""
    folder = await folder_repo.get_folder(folder_id)
    if not folder or folder["owner_id"] != user.id or folder["is_course"]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Folder not found.")

    if data.parent_folder_id is not None and data.parent_folder_id:
        parent = await folder_repo.get_folder(data.parent_folder_id)
        if not parent or parent["owner_id"] != user.id or parent["is_course"]:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Invalid parent folder.",
            )
        if data.parent_folder_id == folder_id:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="A folder cannot be its own parent.",
            )

    return await folder_repo.update_folder(
        folder_id,
        name=data.name,
        parent_folder_id=data.parent_folder_id,
    )


@router.delete("/folders/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_folder(
    folder_id: str,
    user: UserIdentity = Depends(get_current_user),
    folder_repo: FolderRepository = Depends(get_folder_repository),
    repo: ProjectRepository = Depends(get_repo),
):
    """Delete a personal folder. Projects inside are moved to root."""
    folder = await folder_repo.get_folder(folder_id)
    if not folder or folder["owner_id"] != user.id or folder["is_course"]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Folder not found.")

    # Move projects inside this folder to root
    projects = await repo.list_projects_in_folder(user.id, folder_id)
    for p in projects:
        await repo.update_project(p["id"], folder_id="")

    # Move subfolders to root (reparent)
    subfolders = await folder_repo.list_subfolders(folder_id)
    for sf in subfolders:
        await folder_repo.update_folder(sf["id"], parent_folder_id="")

    await folder_repo.delete_folder(folder_id)
    return None


@router.get(
    "/folders/{folder_id}/contents",
    response_model=List[ProjectListResponse],
)
async def list_folder_contents(
    folder_id: str,
    user: UserIdentity = Depends(get_current_user),
    folder_repo: FolderRepository = Depends(get_folder_repository),
    repo: ProjectRepository = Depends(get_repo),
):
    """List projects inside a specific user folder."""
    folder = await folder_repo.get_folder(folder_id)
    if not folder or folder["owner_id"] != user.id or folder["is_course"]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Folder not found.")

    projects = await repo.list_projects_in_folder(user.id, folder_id)
    for p in projects:
        doc = p.get("documentation", {})
        p["has_documentation"] = bool(doc.get("has_content", False))
        p["documentation_preview"] = doc.get("content_preview", "")
    return projects


# ══════════════════════════════════════════════════════════════════════════════
#  PUBLIC COURSES
# ══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/courses",
    response_model=FolderResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_course(
    data: CourseCreate,
    user: UserIdentity = Depends(get_current_user),
    folder_repo: FolderRepository = Depends(get_folder_repository),
):
    """Create a public course folder (maintainer/admin only)."""
    _require_maintainer(user)

    if data.parent_folder_id:
        parent = await folder_repo.get_folder(data.parent_folder_id)
        if not parent or not parent["is_course"]:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Parent must be an existing course folder.",
            )

    folder = await folder_repo.create_folder(
        owner_id=user.id,
        name=data.name,
        parent_folder_id=data.parent_folder_id,
        is_course=True,
    )
    return folder


@router.get("/courses", response_model=List[FolderResponse])
async def list_courses(
    parent_folder_id: Optional[str] = Query(None),
    folder_repo: FolderRepository = Depends(get_folder_repository),
    user: UserIdentity = Depends(get_current_user),
):
    """List public course folders (accessible to all authenticated users)."""
    return await folder_repo.list_course_folders(parent_folder_id=parent_folder_id)


@router.get("/courses/{folder_id}", response_model=FolderResponse)
async def get_course(
    folder_id: str,
    user: UserIdentity = Depends(get_current_user),
    folder_repo: FolderRepository = Depends(get_folder_repository),
):
    """Get a specific public course folder."""
    folder = await folder_repo.get_folder(folder_id)
    if not folder or not folder["is_course"]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Course not found.")
    return folder


@router.put("/courses/{folder_id}", response_model=FolderResponse)
async def update_course(
    folder_id: str,
    data: FolderUpdate,
    user: UserIdentity = Depends(get_current_user),
    folder_repo: FolderRepository = Depends(get_folder_repository),
):
    """Update a public course folder (maintainer/admin only)."""
    _require_maintainer(user)

    folder = await folder_repo.get_folder(folder_id)
    if not folder or not folder["is_course"]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Course not found.")

    if data.parent_folder_id is not None and data.parent_folder_id:
        parent = await folder_repo.get_folder(data.parent_folder_id)
        if not parent or not parent["is_course"]:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Parent must be an existing course folder.",
            )

    return await folder_repo.update_folder(
        folder_id,
        name=data.name,
        parent_folder_id=data.parent_folder_id,
    )


@router.delete("/courses/{folder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_course(
    folder_id: str,
    user: UserIdentity = Depends(get_current_user),
    folder_repo: FolderRepository = Depends(get_folder_repository),
):
    """Delete a public course folder (maintainer/admin only)."""
    _require_maintainer(user)

    folder = await folder_repo.get_folder(folder_id)
    if not folder or not folder["is_course"]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Course not found.")

    # Recursively delete subfolders
    subfolders = await folder_repo.list_subfolders(folder_id)
    for sf in subfolders:
        await folder_repo.delete_folder(sf["id"])

    await folder_repo.delete_folder(folder_id)
    return None


@router.get(
    "/courses/{folder_id}/projects",
    response_model=List[ProjectListResponse],
)
async def list_course_projects(
    folder_id: str,
    user: UserIdentity = Depends(get_current_user),
    folder_repo: FolderRepository = Depends(get_folder_repository),
    repo: ProjectRepository = Depends(get_repo),
):
    """List projects inside a course folder (visible to all)."""
    folder = await folder_repo.get_folder(folder_id)
    if not folder or not folder["is_course"]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Course not found.")

    # Course projects are owned by the course owner
    projects = await repo.list_projects_in_folder(folder["owner_id"], folder_id)
    for p in projects:
        doc = p.get("documentation", {})
        p["has_documentation"] = bool(doc.get("has_content", False))
        p["documentation_preview"] = doc.get("content_preview", "")
    return projects


# ══════════════════════════════════════════════════════════════════════════════
#  DEEP COPY — copy course folder / project into user's space
# ══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/courses/{folder_id}/copy",
    response_model=FolderResponse,
    status_code=status.HTTP_201_CREATED,
)
async def copy_course_to_user(
    folder_id: str,
    data: DeepCopyRequest,
    user: UserIdentity = Depends(get_current_user),
    folder_repo: FolderRepository = Depends(get_folder_repository),
    repo: ProjectRepository = Depends(get_repo),
    doc_svc: DocumentationService = Depends(get_documentation_service),
):
    """Deep-copy a public course (folder + subfolders + projects + docs)
    into the current user's personal folders."""
    source = await folder_repo.get_folder(folder_id)
    if not source or not source["is_course"]:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Course not found.")

    new_root = await _deep_copy_folder(
        source_folder_id=folder_id,
        target_parent_id=data.target_folder_id,
        user=user,
        folder_repo=folder_repo,
        repo=repo,
        doc_svc=doc_svc,
    )
    return new_root


@router.post(
    "/courses/projects/{project_id}/copy",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
async def copy_course_project_to_user(
    project_id: str,
    data: DeepCopyRequest,
    user: UserIdentity = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repo),
    doc_svc: DocumentationService = Depends(get_documentation_service),
):
    """Deep-copy a single course project (including documentation) into
    the current user's personal space."""
    original = await repo.get_project(project_id)
    if not original:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Project not found.")

    new_project = await _deep_copy_project(
        original,
        target_folder_id=data.target_folder_id,
        user=user,
        repo=repo,
        doc_svc=doc_svc,
    )
    return new_project


async def _deep_copy_folder(
    source_folder_id: str,
    target_parent_id: Optional[str],
    user: UserIdentity,
    folder_repo: FolderRepository,
    repo: ProjectRepository,
    doc_svc: DocumentationService,
) -> dict:
    """Recursively copy a course folder tree into the user's space."""
    source = await folder_repo.get_folder(source_folder_id)
    if not source:
        raise ValueError(f"Source folder {source_folder_id} not found")

    # Create the target folder in user's space (not a course)
    new_folder = await folder_repo.create_folder(
        owner_id=user.id,
        name=source["name"],
        parent_folder_id=target_parent_id,
        is_course=False,
    )

    # Copy projects in this folder
    projects = await repo.list_projects_in_folder(source["owner_id"], source_folder_id)
    for proj in projects:
        await _deep_copy_project(
            proj,
            target_folder_id=new_folder["id"],
            user=user,
            repo=repo,
            doc_svc=doc_svc,
        )

    # Recursively copy subfolders
    subfolders = await folder_repo.list_subfolders(source_folder_id)
    for sf in subfolders:
        await _deep_copy_folder(
            source_folder_id=sf["id"],
            target_parent_id=new_folder["id"],
            user=user,
            folder_repo=folder_repo,
            repo=repo,
            doc_svc=doc_svc,
        )

    return new_folder


async def _deep_copy_project(
    original: dict,
    target_folder_id: Optional[str],
    user: UserIdentity,
    repo: ProjectRepository,
    doc_svc: DocumentationService,
) -> dict:
    """Deep-copy a single project including documentation from S3."""
    new_project = await repo.create_project(
        user_id=user.id,
        name=original["name"],
        description=original.get("description", ""),
        folder_id=target_folder_id,
    )

    # Copy all JSON blobs
    await repo.update_project(
        project_id=new_project["id"],
        design_state=original.get("design_state"),
        simulation_config=original.get("simulation_config"),
        ui_state=original.get("ui_state"),
    )

    # Deep-copy documentation from S3
    source_id = original["id"]
    try:
        content_data = await doc_svc.load_content(source_id)
        if content_data and content_data.get("content"):
            await doc_svc.save_content(new_project["id"], content_data["content"])

            # Copy documentation metadata
            doc_meta = original.get("documentation", {})
            if doc_meta:
                new_doc_meta = {
                    "has_content": doc_meta.get("has_content", False),
                    "content_preview": doc_meta.get("content_preview", ""),
                    "image_keys": [],  # Images are not copied yet
                    "last_edited": doc_meta.get("last_edited"),
                    "last_edited_by": user.id,
                }
                await repo.update_project(
                    project_id=new_project["id"],
                    documentation=new_doc_meta,
                )
    except Exception as exc:
        logger.warning(
            "Failed to copy documentation from %s to %s: %s",
            source_id,
            new_project["id"],
            exc,
        )

    # Re-fetch to return updated project
    updated = await repo.get_project(new_project["id"])
    return updated or new_project


# ══════════════════════════════════════════════════════════════════════════════
#  ADMIN — role management & course owner assignment
# ══════════════════════════════════════════════════════════════════════════════


@router.put(
    "/admin/users/{user_id}/role",
    response_model=UserListResponse,
)
async def update_user_role(
    user_id: str,
    data: UserRoleUpdate,
    user: UserIdentity = Depends(get_current_user),
):
    """Admin-only: change a user's role (user / maintainer / admin)."""
    _require_admin(user)

    user_repo = _get_user_repo()

    target = user_repo.get_user_by_id(user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="User not found.")

    if user_id == user.id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Cannot change your own role.",
        )

    try:
        user_repo.update_user_role(user_id, data.role)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc))

    # Invalidate profile cache so the change takes effect immediately
    from backend.common.auth import invalidate_profile_cache

    invalidate_profile_cache(user_id)

    # Re-fetch updated user
    updated = user_repo.get_user_by_id(user_id)
    return updated


@router.get("/admin/users", response_model=List[UserListResponse])
async def list_users(
    user: UserIdentity = Depends(get_current_user),
):
    """Admin-only: list all users."""
    _require_admin(user)

    user_repo = _get_user_repo()
    # Scan all users (fine for small user bases)
    try:
        resp = user_repo.table.scan(
            FilterExpression="begins_with(PK, :prefix) AND SK = :sk",
            ExpressionAttributeValues={":prefix": "USER#", ":sk": "METADATA"},
        )
        items = resp.get("Items", [])
        return [user_repo._to_dict(item) for item in items]
    except Exception as exc:
        logger.error("Error listing users: %s", exc)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list users.",
        )


@router.put("/admin/courses/{folder_id}/owner", response_model=FolderResponse)
async def assign_course_owner(
    folder_id: str,
    data: CourseOwnerUpdate,
    user: UserIdentity = Depends(get_current_user),
    folder_repo: FolderRepository = Depends(get_folder_repository),
):
    """Admin-only: reassign ownership of a course folder."""
    _require_admin(user)

    user_repo = _get_user_repo()
    target = user_repo.get_user_by_id(data.new_owner_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Target user not found.")

    try:
        updated = await folder_repo.reassign_course_owner(folder_id, data.new_owner_id)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc))

    return updated
