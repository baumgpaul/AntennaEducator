"""Schemas for auth service."""

from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserCreate(BaseModel):
    """Schema for user registration."""

    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8)


class UserLogin(BaseModel):
    """Schema for user login."""

    email: EmailStr
    password: str


class Token(BaseModel):
    """Schema for authentication token response."""

    access_token: str
    token_type: str = "bearer"
    expires_in: Optional[int] = None


class UserResponse(BaseModel):
    """Schema for user information response."""

    model_config = ConfigDict(from_attributes=True)

    id: int | str  # Can be int (SQL) or str (DynamoDB UUID)
    email: str
    username: str
    role: str = "user"
    is_approved: bool = True
    is_admin: bool = False
    is_locked: bool = False
    cognito_sub: Optional[str] = None
    created_at: Optional[str] = None
    simulation_tokens: int = 0
    flatrate_until: Optional[str] = None
