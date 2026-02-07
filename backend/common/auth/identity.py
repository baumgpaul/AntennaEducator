"""UserIdentity — the unified user model returned by all auth providers.

This is a plain Pydantic model with NO ORM dependency.
Every service that needs the current user receives this, not a SQLAlchemy model.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class UserIdentity(BaseModel):
    """Authenticated user identity.

    Returned by ``get_current_user()`` regardless of auth mode.
    Carries just enough info for authorization checks and audit logging.
    """

    model_config = ConfigDict(frozen=True)

    id: str
    email: str
    username: str
    is_admin: bool = False
    is_locked: bool = False
    created_at: Optional[datetime] = None


class TokenResponse(BaseModel):
    """Standardised token response from any auth provider."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int = 3600


class TokenData(BaseModel):
    """Claims extracted from a validated JWT — before profile enrichment."""

    user_id: str
    email: Optional[str] = None
