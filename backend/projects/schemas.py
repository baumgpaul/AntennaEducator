"""Pydantic schemas for API request/response validation."""

from pydantic import BaseModel, EmailStr, Field, ConfigDict
from datetime import datetime
from typing import Optional, List, Any


# User Schemas
class UserBase(BaseModel):
    """Base user schema."""
    email: EmailStr


class UserCreate(UserBase):
    """Schema for user registration."""
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8, max_length=100)


class UserLogin(UserBase):
    """Schema for user login."""
    password: str


class UserResponse(UserBase):
    """Schema for user response."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    username: str
    created_at: datetime


# Token Schemas
class Token(BaseModel):
    """JWT token response."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 3600  # seconds


class TokenData(BaseModel):
    """Data extracted from JWT token."""
    user_id: Optional[str] = None  # Can be int (local DB) or UUID string (Cognito)
    email: Optional[str] = None


# Project Element Schemas
class ProjectElementBase(BaseModel):
    """Base schema for project elements."""
    element_name: str = Field(..., description="Element name")
    config_json: str = Field(..., description="JSON string of element configuration")


class ProjectElementCreate(ProjectElementBase):
    """Schema for creating a project element."""
    pass


class ProjectElementResponse(ProjectElementBase):
    """Schema for project element response."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    project_id: int
    created_at: datetime


# Result Schemas
class ResultBase(BaseModel):
    """Base schema for simulation results (field solution only)."""
    frequency: float = Field(..., description="Frequency in Hz")
    currents_s3_key: Optional[str] = Field(None, description="S3 key for current data")
    mesh_s3_key: Optional[str] = Field(None, description="S3 key for mesh data")


class ResultCreate(ResultBase):
    """Schema for creating a result."""
    pass


class ResultResponse(ResultBase):
    """Schema for result response."""
    model_config = ConfigDict(from_attributes=True)
    
    id: int
    project_id: int
    created_at: datetime


# Project Schemas
class ProjectBase(BaseModel):
    """Base schema for projects."""
    name: str = Field(..., min_length=3, max_length=100)
    description: Optional[str] = Field(None, max_length=50000)  # Allow large JSON strings for elements
    requested_fields: Optional[List[Any]] = Field(None, description="Field definitions for solver (JSON array)")
    view_configurations: Optional[List[Any]] = Field(None, description="View configurations for postprocessing (JSON array)")
    solver_state: Optional[dict] = Field(None, description="Solver results, state, and field data (JSON object)")


class ProjectCreate(ProjectBase):
    """Schema for creating a project."""
    pass


class ProjectUpdate(BaseModel):
    """Schema for updating a project."""
    name: Optional[str] = Field(None, min_length=3, max_length=100)
    description: Optional[str] = Field(None, max_length=50000)  # Allow large JSON strings for elements
    requested_fields: Optional[List[Any]] = Field(None, description="Field definitions for solver (JSON array)")
    view_configurations: Optional[List[Any]] = Field(None, description="View configurations for postprocessing (JSON array)")
    solver_state: Optional[dict] = Field(None, description="Solver results, state, and field data (JSON object)")


class ProjectResponse(ProjectBase):
    """Schema for project response."""
    model_config = ConfigDict(from_attributes=True)
    
    id: str  # UUID string for DynamoDB compatibility
    user_id: str  # UUID string for DynamoDB compatibility
    created_at: datetime
    updated_at: datetime
    elements: List[ProjectElementResponse] = []
    results: List[ResultResponse] = []


class ProjectListResponse(ProjectBase):
    """Schema for project list response (without elements/results)."""
    model_config = ConfigDict(from_attributes=True)
    
    id: str  # UUID string for DynamoDB compatibility
    user_id: str  # UUID string for DynamoDB compatibility
    created_at: datetime
    updated_at: datetime
