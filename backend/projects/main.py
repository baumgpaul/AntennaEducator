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
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),  # Console output
        logging.FileHandler('projects_service.log')  # File output
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
    UserCreate, UserLogin, UserResponse, Token,
    ProjectCreate, ProjectUpdate, ProjectResponse, ProjectListResponse,
    ProjectElementCreate, ProjectElementResponse,
    ResultCreate, ResultResponse
)
from backend.projects.auth import (
    get_password_hash, verify_password, create_access_token,
    get_current_user, ACCESS_TOKEN_EXPIRE_MINUTES
)

# Create database tables
Base.metadata.create_all(bind=engine)

# Initialize FastAPI app
app = FastAPI(
    title="PEEC Antenna Simulator - Projects Service",
    description="Project management and persistence API",
    version="0.1.0"
)

# CORS middleware - MUST be added FIRST (added first = executed last, which is correct)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    logger.debug("Health check requested")
    return {"status": "healthy", "service": "projects"}


# Authentication endpoints
@app.post("/api/v1/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a new user."""
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    hashed_password = get_password_hash(user_data.password)
    db_user = User(
        email=user_data.email,
        password_hash=hashed_password
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    return db_user


@app.post("/api/v1/auth/login", response_model=Token)
async def login(user_data: UserLogin, db: Session = Depends(get_db)):
    """Login and get access token."""
    # Find user
    user = db.query(User).filter(User.email == user_data.email).first()
    if not user or not verify_password(user_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email},  # Convert user ID to string
        expires_delta=access_token_expires
    )
    
    return Token(
        access_token=access_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@app.get("/api/v1/auth/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information."""
    return current_user


# Project endpoints
@app.post("/api/v1/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    project_data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new project."""
    db_project = Project(
        user_id=current_user.id,
        name=project_data.name,
        description=project_data.description,
        requested_fields=project_data.requested_fields,
        view_configurations=project_data.view_configurations
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    
    return db_project


@app.get("/api/v1/projects", response_model=List[ProjectListResponse])
async def list_projects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all projects for the current user."""
    projects = db.query(Project).filter(Project.user_id == current_user.id).all()
    return projects


@app.get("/api/v1/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific project with all elements and results."""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    return project


@app.put("/api/v1/projects/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    project_data: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a project."""
    logger.debug(f"Updating project {project_id} with data: {project_data}")
    
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Update fields
    if project_data.name is not None:
        project.name = project_data.name
    if project_data.description is not None:
        project.description = project_data.description
    if project_data.requested_fields is not None:
        project.requested_fields = project_data.requested_fields
    if project_data.view_configurations is not None:
        project.view_configurations = project_data.view_configurations
    
    db.commit()
    db.refresh(project)
    
    return project


@app.delete("/api/v1/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a project."""
    project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    db.delete(project)
    db.commit()
    
    return None


@app.post("/api/v1/projects/{project_id}/duplicate", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def duplicate_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Duplicate a project."""
    # Find original project
    original_project = db.query(Project).filter(
        Project.id == project_id,
        Project.user_id == current_user.id
    ).first()
    
    if not original_project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    
    # Create duplicate
    duplicate = Project(
        user_id=current_user.id,
        name=f"{original_project.name} (Copy)",
        description=original_project.description
    )
    db.add(duplicate)
    db.commit()
    db.refresh(duplicate)
    
    return duplicate


# Project elements endpoints
@app.post("/api/v1/projects/{project_id}/elements", response_model=ProjectElementResponse, status_code=status.HTTP_201_CREATED)
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


@app.delete("/api/v1/projects/{project_id}/elements/{element_id}", status_code=status.HTTP_204_NO_CONTENT)
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
@app.post("/api/v1/projects/{project_id}/results", response_model=ResultResponse, status_code=status.HTTP_201_CREATED)
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


@app.get("/api/v1/projects/{project_id}/results", response_model=List[ResultResponse])
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
