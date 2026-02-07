"""Projects Service — project CRUD and persistence.

This service is a workspace persistence layer. It stores project metadata
and JSON blobs for design state, simulation config, results, and UI state.
The actual physics lives in the preprocessor / solver / postprocessor services.
"""

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import logging
import os
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger(__name__)

from backend.common.auth import UserIdentity, get_current_user, create_auth_provider
from backend.common.repositories.factory import get_project_repository
from backend.common.repositories.base import ProjectRepository
from backend.projects.schemas import (
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectListResponse,
)

# Auth service endpoint handlers (re-mounted for combined Lambda deployment)
from backend.auth.main import register, login, get_current_user_info
import backend.auth.schemas

app = FastAPI(
    title="Antenna Simulator — Projects Service",
    description="Project management and persistence API",
    version="0.2.0",
)

# CORS — only when NOT running inside Lambda
if not os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    logger.info("CORS middleware enabled (non-Lambda environment)")
else:
    logger.info("CORS handled by Lambda Function URL — middleware disabled")


def get_repository() -> ProjectRepository:
    return get_project_repository()


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health_check():
    from datetime import datetime, timezone

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
app.get("/api/auth/me", response_model=backend.auth.schemas.UserResponse)(
    get_current_user_info
)


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
):
    project = await repo.create_project(
        user_id=user.id,
        name=data.name,
        description=data.description,
    )

    # Set optional JSON blobs if provided on create
    update_needed = any([
        data.design_state,
        data.simulation_config,
        data.simulation_results,
        data.ui_state,
    ])
    if update_needed:
        project = await repo.update_project(
            project_id=project["id"],
            design_state=data.design_state,
            simulation_config=data.simulation_config,
            simulation_results=data.simulation_results,
            ui_state=data.ui_state,
        )

    return project


@app.get("/api/projects", response_model=List[ProjectListResponse])
async def list_projects(
    user: UserIdentity = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository),
):
    return await repo.list_projects(user_id=user.id)


@app.get("/api/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    user: UserIdentity = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository),
):
    project = await repo.get_project(project_id=project_id)
    if not project or project["user_id"] != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


@app.put("/api/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    data: ProjectUpdate,
    user: UserIdentity = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository),
):
    project = await repo.get_project(project_id=project_id)
    if not project or project["user_id"] != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Project not found")

    updated = await repo.update_project(
        project_id=project_id,
        name=data.name,
        description=data.description,
        design_state=data.design_state,
        simulation_config=data.simulation_config,
        simulation_results=data.simulation_results,
        ui_state=data.ui_state,
    )
    return updated


@app.delete("/api/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    user: UserIdentity = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository),
):
    project = await repo.get_project(project_id=project_id)
    if not project or project["user_id"] != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Project not found")
    await repo.delete_project(project_id=project_id)
    return None


@app.post(
    "/api/projects/{project_id}/duplicate",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
async def duplicate_project(
    project_id: str,
    user: UserIdentity = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository),
):
    original = await repo.get_project(project_id=project_id)
    if not original or original["user_id"] != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Project not found")

    duplicate = await repo.create_project(
        user_id=user.id,
        name=f"{original['name']} (Copy)",
        description=original.get("description", ""),
    )

    # Copy all JSON blobs
    duplicate = await repo.update_project(
        project_id=duplicate["id"],
        design_state=original.get("design_state"),
        simulation_config=original.get("simulation_config"),
        simulation_results=original.get("simulation_results"),
        ui_state=original.get("ui_state"),
    )
    return duplicate


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8010)
