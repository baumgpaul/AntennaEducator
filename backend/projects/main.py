"""Projects Service - FastAPI application for project management."""

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List
from datetime import timedelta
import logging
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Configure logging
# Lambda: Only console output (CloudWatch Logs), no file logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler()  # Console output only (goes to CloudWatch)
    ]
)
logger = logging.getLogger(__name__)

# DEBUG: Log environment state
logger.info("="*80)
logger.info("ENVIRONMENT DEBUG INFO")
logger.info(f"Current working directory: {os.getcwd()}")
logger.info(f"DISABLE_AUTH env var: {os.getenv('DISABLE_AUTH', 'NOT SET')}")
logger.info(f".env file exists: {os.path.exists('.env')}")
if os.path.exists('.env'):
    with open('.env', 'r') as f:
        logger.info(f".env contents preview: {f.readline().strip()}")
logger.info("="*80)

from backend.projects.database import engine, get_db, Base
from backend.projects.models import User, Project, ProjectElement, Result
from backend.projects.schemas import (
    ProjectCreate, ProjectUpdate, ProjectResponse, ProjectListResponse,
    ProjectElementCreate, ProjectElementResponse,
    ResultCreate, ResultResponse
)
from backend.projects.auth import (
    get_current_user, ACCESS_TOKEN_EXPIRE_MINUTES, USE_COGNITO
)

# Import auth endpoints temporarily for combined AWS deployment
# TODO: Remove these imports once separate auth Lambda is deployed
import backend.auth.main
import backend.auth.schemas
from backend.auth.main import register, login, get_current_user_info

# Import repository for DynamoDB support
from backend.common.repositories.factory import get_project_repository
from backend.common.repositories.base import ProjectRepository

# Create database tables only if using SQLAlchemy (not DynamoDB)
if os.getenv("USE_DYNAMODB", "false").lower() != "true":
    Base.metadata.create_all(bind=engine)

# Initialize FastAPI app
app = FastAPI(
    title="PEEC Antenna Simulator - Projects Service",
    description="Project management and persistence API",
    version="0.1.0"
)

# CORS middleware - only add if not running in Lambda (Lambda Function URL handles CORS)
# Lambda sets AWS_LAMBDA_FUNCTION_NAME environment variable
if not os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Allow all origins for development
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    logger.info("CORS middleware enabled (non-Lambda environment)")
else:
    logger.info("CORS handled by Lambda Function URL - middleware disabled")


# Dependency for repository
def get_repository() -> ProjectRepository:
    """Get project repository instance."""
    return get_project_repository()


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint with detailed status."""
    from datetime import datetime
    logger.debug("Health check requested")
    
    # Check database connectivity
    db_status = "unknown"
    try:
        repo = get_project_repository()
        db_status = "connected" if repo else "disconnected"
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        db_status = f"error: {str(e)[:50]}"
    
    return {
        "status": "healthy",
        "service": "projects",
        "timestamp": datetime.utcnow().isoformat(),
        "database": db_status,
        "environment": os.getenv("ENVIRONMENT", "unknown")
    }


# ============================================================================
# AUTH ENDPOINTS (temporary - until separate auth Lambda is deployed)
# These are imported from backend.auth.main and re-exposed here for combined AWS deployment
# Docker deployment uses separate auth service on port 8011
# ============================================================================
app.post("/api/auth/register", response_model=backend.auth.schemas.UserResponse, status_code=status.HTTP_201_CREATED)(register)
app.post("/api/auth/login", response_model=backend.auth.schemas.Token)(login)
app.get("/api/auth/me", response_model=backend.auth.schemas.UserResponse)(get_current_user_info)


# Project endpoints
@app.post("/api/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository)
):
    """Create a new project."""
    # Use repository to create project
    project = await repo.create_project(
        user_id=str(current_user.id),
        name=project_data.name,
        description=project_data.description
    )
    
    # Update with additional fields if provided
    if project_data.requested_fields or project_data.view_configurations:
        project = await repo.update_project(
            project_id=project['id'],
            requested_fields=project_data.requested_fields,
            view_configurations=project_data.view_configurations
        )
    
    return project


@app.get("/api/projects", response_model=List[ProjectListResponse])
async def list_projects(
    current_user: User = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository)
):
    """List all projects for the current user."""
    projects = await repo.list_projects(user_id=str(current_user.id))
    return projects


@app.get("/api/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository)
):
    """Get a specific project with all elements and results."""
    project = await repo.get_project(project_id=project_id)
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Verify ownership
    if project['user_id'] != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    return project


@app.put("/api/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    project_data: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository)
):
    """Update a project."""
    logger.debug(f"Updating project {project_id} with data: {project_data}")
    
    # First verify project exists and user owns it
    project = await repo.get_project(project_id=project_id)
    if not project or project['user_id'] != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Update project using repository
    updated_project = await repo.update_project(
        project_id=project_id,
        name=project_data.name,
        description=project_data.description,
        requested_fields=project_data.requested_fields,
        view_configurations=project_data.view_configurations,
        solver_state=project_data.solver_state
    )
    
    return updated_project


@app.delete("/api/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository)
):
    """Delete a project."""
    # Verify project exists and user owns it
    project = await repo.get_project(project_id=project_id)
    if not project or project['user_id'] != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Delete using repository
    await repo.delete_project(project_id=project_id)
    
    return None


@app.post("/api/projects/{project_id}/duplicate", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def duplicate_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    repo: ProjectRepository = Depends(get_repository)
):
    """Duplicate a project."""
    # Find original project
    original_project = await repo.get_project(project_id=project_id)
    
    if not original_project or original_project['user_id'] != str(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Create duplicate
    duplicate = await repo.create_project(
        user_id=str(current_user.id),
        name=f"{original_project['name']} (Copy)",
        description=original_project.get('description', '')
    )
    
    # Copy additional fields
    if original_project.get('requested_fields') or original_project.get('view_configurations') or original_project.get('solver_state'):
        duplicate = await repo.update_project(
            project_id=duplicate['id'],
            requested_fields=original_project.get('requested_fields'),
            view_configurations=original_project.get('view_configurations'),
            solver_state=original_project.get('solver_state')
        )
    
    return duplicate


# Project elements endpoints
@app.post("/api/projects/{project_id}/elements", response_model=ProjectElementResponse, status_code=status.HTTP_201_CREATED)
async def add_element(
    project_id: int,
    element_data: ProjectElementCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add an element to a project."""
    # Verify project ownership
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Create element
    db_element = ProjectElement(
        project_id=project_id,
        element_name=element_data.element_name,
        config_json=element_data.config_json
    )
    db.add(db_element)
    db.commit()
    db.refresh(db_element)
    
    return db_element


@app.delete("/api/projects/{project_id}/elements/{element_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_element(
    project_id: int,
    element_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete an element from a project."""
    # Verify project ownership
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Find and delete element
    element = db.query(ProjectElement).filter(
        ProjectElement.id == element_id,
        ProjectElement.project_id == project_id
    ).first()
    
    if not element:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Element not found"
        )
    
    db.delete(element)
    db.commit()
    
    return None


# Results endpoints
@app.post("/api/projects/{project_id}/results", response_model=ResultResponse, status_code=status.HTTP_201_CREATED)
async def save_result(
    project_id: int,
    result_data: ResultCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Save a simulation result."""
    # Verify project ownership
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Create result
    db_result = Result(
        project_id=project_id,
        frequency=result_data.frequency,

        currents_s3_key=result_data.currents_s3_key,
        mesh_s3_key=result_data.mesh_s3_key
    )
    db.add(db_result)
    db.commit()
    db.refresh(db_result)
    
    return db_result


@app.get("/api/projects/{project_id}/results", response_model=List[ResultResponse])
async def list_results(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all results for a project."""
    # Verify project ownership
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    results = db.query(Result).filter(Result.project_id == project_id).all()
    return results


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8010)
