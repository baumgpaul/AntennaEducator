"""
Project-related data models.
"""

from typing import Optional, Literal
from pydantic import BaseModel, Field
from uuid import UUID, uuid4
from datetime import datetime
from enum import Enum


class ProjectStatus(str, Enum):
    """Project status enumeration."""
    DRAFT = "draft"
    MESHED = "meshed"
    SOLVING = "solving"
    SOLVED = "solved"
    ERROR = "error"


class Project(BaseModel):
    """
    Top-level project containing geometry, solver jobs, and results.
    """
    id: UUID = Field(default_factory=uuid4)
    name: str = Field(
        description="Project name",
        min_length=1,
        max_length=255
    )
    description: Optional[str] = Field(
        default=None,
        description="Project description"
    )
    owner_id: Optional[UUID] = Field(
        default=None,
        description="User ID of the project owner (for multi-tenancy)"
    )
    status: ProjectStatus = Field(
        default=ProjectStatus.DRAFT,
        description="Current status of the project"
    )
    geometry_id: Optional[UUID] = Field(
        default=None,
        description="Reference to geometry"
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {
            UUID: str,
            datetime: lambda v: v.isoformat()
        }
    
    def update_status(self, new_status: ProjectStatus) -> None:
        """
        Update project status and timestamp.
        
        Args:
            new_status: New status to set
        """
        self.status = new_status
        self.updated_at = datetime.utcnow()


class ProjectCreate(BaseModel):
    """Schema for creating a new project."""
    name: str = Field(
        description="Project name",
        min_length=1,
        max_length=255
    )
    description: Optional[str] = Field(
        default=None,
        description="Project description"
    )


class ProjectUpdate(BaseModel):
    """Schema for updating an existing project."""
    name: Optional[str] = Field(
        default=None,
        description="Project name",
        min_length=1,
        max_length=255
    )
    description: Optional[str] = Field(
        default=None,
        description="Project description"
    )
    status: Optional[ProjectStatus] = Field(
        default=None,
        description="Project status"
    )


class ProjectResponse(BaseModel):
    """Schema for project API responses."""
    id: UUID
    name: str
    description: Optional[str]
    owner_id: Optional[UUID]
    status: ProjectStatus
    geometry_id: Optional[UUID]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
        json_encoders = {
            UUID: str,
            datetime: lambda v: v.isoformat()
        }
