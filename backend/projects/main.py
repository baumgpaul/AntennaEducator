"""Projects Service — project CRUD and persistence.

This service is a workspace persistence layer. It stores project metadata
and JSON blobs for design state, simulation config, results, and UI state.
Large simulation results are stored in S3/MinIO and referenced by keys.
The actual physics lives in the preprocessor / solver / postprocessor services.
"""

import os
from datetime import datetime, timezone
from typing import List

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

import backend.auth.schemas

# Auth service endpoint handlers (re-mounted for combined Lambda deployment)
from backend.auth.main import get_current_user_info, login, register
from backend.common.auth import UserIdentity, get_current_user
from backend.common.repositories.base import ProjectRepository
from backend.common.repositories.factory import get_project_repository
from backend.common.repositories.folder_repository import FolderRepository
from backend.common.utils.error_handler import install_error_handlers
from backend.common.utils.logging_config import configure_logging
from backend.projects.documentation_service import DocumentationService, get_documentation_service

# Folder & course management routes
from backend.projects.folder_routes import router as folder_router
from backend.projects.results_service import ResultsService, get_results_service
from backend.projects.schemas import (
    DocumentationContentRequest,
    DocumentationContentResponse,
    ImageUploadRequest,
    ImageUploadResponse,
    ImageUrlResponse,
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
    generate_content_preview,
)

# Submission routes
from backend.projects.submission_routes import router as submission_router

logger = configure_logging("projects")

app = FastAPI(
    title="Antenna Simulator — Projects Service",
    description="Project management and persistence API",
    version="0.2.0",
)

# CORS — always enabled (Lambda Function URL CORS can be unreliable for
# preflight / non-simple requests; belt-and-suspenders with FastAPI middleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
logger.info("CORS middleware enabled")

install_error_handlers(app)

# Include folder/course management routes
app.include_router(folder_router)

# Include submission routes
app.include_router(submission_router)


def get_repository() -> ProjectRepository:
    return get_project_repository()


def _get_doc_service() -> DocumentationService:
    return get_documentation_service()


async def _can_access_project(project: dict, user: UserIdentity) -> bool:
    """Check if user owns the project or is a maintainer for its course folder."""
    if project["user_id"] == user.id:
        return True
    if user.role.value in ("maintainer", "admin"):
        folder_id = project.get("folder_id")
        if folder_id:
            try:
                folder_repo = FolderRepository()
                folder = await folder_repo.get_folder(folder_id)
                if folder and folder.get("is_course"):
                    return True
            except Exception:
                pass
    return False


# ── Health ────────────────────────────────────────────────────────────────────


@app.get("/health")
async def health_check():
    db_status = "unknown"
    try:
        repo = get_project_repository()
        db_status = "connected" if repo else "disconnected"
    except Exception as exc:
        db_status = f"error: {str(exc)[:50]}"

    return {
        "status": "healthy",
        "service": "projects",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database": db_status,
        "environment": os.getenv("ENVIRONMENT", "unknown"),
    }


# ── Auth endpoints (re-mounted from auth service for combined Lambda) ────────
app.post(
    "/api/auth/register",
    response_model=backend.auth.schemas.UserResponse,
    status_code=status.HTTP_201_CREATED,
)(register)
app.post("/api/auth/login", response_model=backend.auth.schemas.Token)(login)
app.get("/api/auth/me", response_model=backend.auth.schemas.UserResponse)(get_current_user_info)


# ── Project CRUD ──────────────────────────────────────────────────────────────


@app.post(
    "/api/projects",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_project(
    data: ProjectCreate,
    user: UserIdentity = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository),
    results_svc: ResultsService = Depends(get_results_service),
):
    # When creating inside a course folder, store under the course owner's PK
    # so list_course_projects (which queries by folder owner_id) can find it.
    owner_id = user.id
    folder_id = getattr(data, "folder_id", None)
    if folder_id:
        try:
            folder_repo = FolderRepository()
            folder = await folder_repo.get_folder(folder_id)
            if folder and folder.get("is_course"):
                owner_id = folder["owner_id"]
        except Exception:
            logger.warning("Could not resolve folder %s for owner lookup", folder_id)

    project = await repo.create_project(
        user_id=owner_id,
        name=data.name,
        description=data.description,
        folder_id=folder_id,
    )

    # Set optional JSON blobs if provided on create
    update_needed = any(
        [
            data.design_state,
            data.simulation_config,
            data.simulation_results,
            data.ui_state,
            data.documentation,
        ]
    )
    if update_needed:
        # Store large results in S3, keep only keys in DynamoDB
        slim_results = None
        if data.simulation_results:
            try:
                slim_results, _ = await results_svc.extract_and_store(
                    project["id"], data.simulation_results
                )
            except Exception as e:
                logger.error("S3 storage failed during project create: %s", e)
                raise HTTPException(
                    status.HTTP_502_BAD_GATEWAY,
                    detail="Failed to store simulation results.",
                )

        project = await repo.update_project(
            project_id=project["id"],
            design_state=data.design_state,
            simulation_config=data.simulation_config,
            simulation_results=slim_results,
            ui_state=data.ui_state,
            documentation=data.documentation,
        )

    return project


@app.get("/api/projects", response_model=List[ProjectListResponse])
async def list_projects(
    user: UserIdentity = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository),
):
    projects = await repo.list_projects(user_id=user.id)
    # Compute has_documentation flag and preview for list response
    for p in projects:
        doc = p.get("documentation", {})
        p["has_documentation"] = bool(doc.get("has_content", False))
        p["documentation_preview"] = doc.get("content_preview", "")
    return projects


@app.get("/api/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    user: UserIdentity = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository),
    results_svc: ResultsService = Depends(get_results_service),
):
    project = await repo.get_project(project_id=project_id)
    if not project or not await _can_access_project(project, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Record when the project was last opened (for "Recent" list)
    now = datetime.now(timezone.utc).isoformat()
    repo.table.update_item(
        Key={
            "PK": f"USER#{project['user_id']}",
            "SK": f"PROJECT#{project_id}",
        },
        UpdateExpression="SET LastOpenedAt = :ts",
        ExpressionAttributeValues={":ts": now},
    )
    project["last_opened_at"] = now

    # Hydrate simulation_results from S3
    if project.get("simulation_results"):
        try:
            project["simulation_results"] = await results_svc.hydrate_results(
                project_id, project["simulation_results"]
            )
        except Exception as e:
            logger.warning("Failed to hydrate results for %s: %s", project_id, e)

    return project


@app.put("/api/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    data: ProjectUpdate,
    user: UserIdentity = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository),
    results_svc: ResultsService = Depends(get_results_service),
):
    project = await repo.get_project(project_id=project_id)
    if not project or not await _can_access_project(project, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Store large results in S3, keep only keys in DynamoDB
    slim_results = data.simulation_results
    if data.simulation_results:
        try:
            slim_results, _ = await results_svc.extract_and_store(
                project_id, data.simulation_results
            )
        except Exception as e:
            logger.error("S3 storage failed during project update: %s", e)
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY,
                detail="Failed to store simulation results.",
            )

    updated = await repo.update_project(
        project_id=project_id,
        name=data.name,
        description=data.description,
        design_state=data.design_state,
        simulation_config=data.simulation_config,
        simulation_results=slim_results,
        ui_state=data.ui_state,
        documentation=data.documentation,
        folder_id=data.folder_id,
    )

    # Hydrate results from S3 before returning (so frontend gets full data)
    if updated.get("simulation_results"):
        try:
            updated["simulation_results"] = await results_svc.hydrate_results(
                project_id, updated["simulation_results"]
            )
        except Exception as e:
            logger.warning("Failed to hydrate results for %s: %s", project_id, e)

    return updated


@app.delete("/api/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    user: UserIdentity = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository),
    results_svc: ResultsService = Depends(get_results_service),
    doc_svc: DocumentationService = Depends(_get_doc_service),
):
    project = await repo.get_project(project_id=project_id)
    if not project or not await _can_access_project(project, user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Delete results from S3 first
    try:
        await results_svc.delete_results(project_id)
    except Exception as e:
        logger.warning(f"Failed to delete S3 results for {project_id}: {e}")

    # Delete documentation (content + images) from S3
    try:
        await doc_svc.delete_all(project_id)
    except Exception as e:
        logger.warning(f"Failed to delete documentation for {project_id}: {e}")

    await repo.delete_project(project_id=project_id)
    return None


@app.post("/api/projects/{project_id}/reset", response_model=ProjectResponse)
async def reset_project_to_source(
    project_id: str,
    user: UserIdentity = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository),
    doc_svc: DocumentationService = Depends(_get_doc_service),
):
    """Reset a copied course project back to its original source state.

    Restores design_state, simulation_config, and ui_state from the source project,
    clears simulation_results, and re-copies source documentation content.
    """
    project = await repo.get_project(project_id=project_id)
    if not project or project["user_id"] != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Project not found")

    source_id = project.get("source_project_id")
    if not source_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Project has no source to reset to."
        )

    source = await repo.get_project(project_id=source_id)
    if not source:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Source project no longer exists.")

    # Restore state blobs from source; clear simulation results
    updated = await repo.update_project(
        project_id=project_id,
        design_state=source.get("design_state") or {},
        simulation_config=source.get("simulation_config") or {},
        simulation_results={},
        ui_state=source.get("ui_state") or {},
    )

    # Re-copy documentation content from source
    try:
        source_doc = await doc_svc.load_content(source_id)
        if source_doc and source_doc.get("content"):
            await doc_svc.save_content(project_id, source_doc["content"])
    except Exception as e:
        logger.warning(f"Failed to re-copy documentation during reset for {project_id}: {e}")

    return updated


@app.post(
    "/api/projects/{project_id}/duplicate",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
async def duplicate_project(
    project_id: str,
    user: UserIdentity = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository),
    results_svc: ResultsService = Depends(get_results_service),
):
    original = await repo.get_project(project_id=project_id)
    if not original or original["user_id"] != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Project not found")

    duplicate = await repo.create_project(
        user_id=user.id,
        name=f"{original['name']} (Copy)",
        description=original.get("description", ""),
    )

    # Duplicate S3 results
    original_results = original.get("simulation_results", {})
    result_keys = original_results.get("result_keys", {})
    new_result_keys = {}

    if result_keys:
        new_result_keys = await results_svc.duplicate_results(
            project_id, duplicate["id"], result_keys
        )

    # Build new simulation_results with duplicated S3 keys
    new_simulation_results = dict(original_results)
    if new_result_keys:
        new_simulation_results["result_keys"] = new_result_keys

    # Copy all JSON blobs (documentation metadata only — S3 content/images
    # are NOT duplicated; the copy starts with has_content=False)
    duplicate = await repo.update_project(
        project_id=duplicate["id"],
        design_state=original.get("design_state"),
        simulation_config=original.get("simulation_config"),
        simulation_results=new_simulation_results if original_results else None,
        ui_state=original.get("ui_state"),
    )
    return duplicate


# ── Documentation Endpoints ───────────────────────────────────────────────────


async def _get_user_project(
    project_id: str,
    user: UserIdentity,
    repo: ProjectRepository,
) -> dict:
    """Fetch a project and verify ownership. Raises 404 if not found / not owned."""
    project = await repo.get_project(project_id=project_id)
    if not project or project["user_id"] != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@app.get(
    "/api/projects/{project_id}/documentation",
    response_model=DocumentationContentResponse,
)
async def get_documentation(
    project_id: str,
    user: UserIdentity = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository),
    doc_svc: DocumentationService = Depends(_get_doc_service),
):
    """Retrieve documentation content from S3."""
    await _get_user_project(project_id, user, repo)

    content_data = await doc_svc.load_content(project_id)
    if content_data is None:
        return DocumentationContentResponse(content="", version=1)
    return DocumentationContentResponse(**content_data)


@app.put(
    "/api/projects/{project_id}/documentation",
    response_model=DocumentationContentResponse,
)
async def save_documentation(
    project_id: str,
    data: DocumentationContentRequest,
    user: UserIdentity = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository),
    doc_svc: DocumentationService = Depends(_get_doc_service),
):
    """Save documentation content to S3 and update DynamoDB metadata."""
    project = await _get_user_project(project_id, user, repo)

    # Save content to S3
    await doc_svc.save_content(project_id, data.content)

    # Update documentation metadata in DynamoDB
    existing_doc = project.get("documentation", {})
    doc_meta = {
        "has_content": bool(data.content.strip()),
        "content_preview": generate_content_preview(data.content),
        "image_keys": existing_doc.get("image_keys", []),
        "last_edited": datetime.now(timezone.utc).isoformat(),
        "last_edited_by": user.id,
    }
    await repo.update_project(project_id=project_id, documentation=doc_meta)

    return DocumentationContentResponse(content=data.content, version=1)


@app.post(
    "/api/projects/{project_id}/documentation/images",
    response_model=ImageUploadResponse,
)
async def upload_image(
    project_id: str,
    data: ImageUploadRequest,
    user: UserIdentity = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository),
    doc_svc: DocumentationService = Depends(_get_doc_service),
):
    """Generate a presigned PUT URL for direct image upload to S3."""
    project = await _get_user_project(project_id, user, repo)

    try:
        result = await doc_svc.generate_upload_url(project_id, data.filename, data.content_type)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Update image manifest in DynamoDB
    existing_doc = project.get("documentation", {})
    image_keys = existing_doc.get("image_keys", []) + [result["image_key"]]
    await repo.update_project(
        project_id=project_id,
        documentation={**existing_doc, "image_keys": image_keys},
    )

    return ImageUploadResponse(**result)


@app.get(
    "/api/projects/{project_id}/documentation/images/{image_key}",
    response_model=ImageUrlResponse,
)
async def get_image_url(
    project_id: str,
    image_key: str,
    user: UserIdentity = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository),
    doc_svc: DocumentationService = Depends(_get_doc_service),
):
    """Get a presigned GET URL for a documentation image."""
    await _get_user_project(project_id, user, repo)

    try:
        url = await doc_svc.get_image_url(project_id, image_key)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))
    return ImageUrlResponse(url=url)


@app.delete(
    "/api/projects/{project_id}/documentation/images/{image_key}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_image(
    project_id: str,
    image_key: str,
    user: UserIdentity = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository),
    doc_svc: DocumentationService = Depends(_get_doc_service),
):
    """Delete a documentation image from S3 and update metadata."""
    project = await _get_user_project(project_id, user, repo)

    # Validate and delete from S3
    try:
        await doc_svc.delete_image(project_id, image_key)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Update metadata: remove image from manifest
    existing_doc = project.get("documentation", {})
    image_keys = [k for k in existing_doc.get("image_keys", []) if k != image_key]
    doc_meta = {
        **existing_doc,
        "image_keys": image_keys,
    }
    await repo.update_project(project_id=project_id, documentation=doc_meta)

    return None


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8010)
