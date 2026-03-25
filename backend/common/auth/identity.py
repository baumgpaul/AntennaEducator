"""UserIdentity — the unified user model returned by all auth providers.

This is a plain Pydantic model with NO ORM dependency.
Every service that needs the current user receives this, not a SQLAlchemy model.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, computed_field


class UserRole(str, Enum):
    """User authorization level.

    - ``user``:       Can only edit own projects. Cannot modify public courses.
    - ``maintainer``: Can also create/edit public courses.
    - ``admin``:      Can elevate user roles and assign course owners.
    """

    USER = "user"
    MAINTAINER = "maintainer"
    ADMIN = "admin"


class UserIdentity(BaseModel):
    """Authenticated user identity.

    Returned by ``get_current_user()`` regardless of auth mode.
    Carries just enough info for authorization checks and audit logging.
    """

    model_config = ConfigDict(frozen=True)

    id: str
    email: str
    username: str
    role: UserRole = UserRole.USER
    is_locked: bool = False
    created_at: Optional[datetime] = None
    simulation_tokens: int = 0
    flatrate_until: Optional[datetime] = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_admin(self) -> bool:
        """Backward-compatible admin check."""
        return self.role == UserRole.ADMIN

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_maintainer(self) -> bool:
        """Check if user has maintainer or admin privileges."""
        return self.role in (UserRole.MAINTAINER, UserRole.ADMIN)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def has_active_flatrate(self) -> bool:
        """Check if user has an active (non-expired) flatrate."""
        if self.flatrate_until is None:
            return False
        return self.flatrate_until > datetime.now(timezone.utc)


class TokenResponse(BaseModel):
    """Standardised token response from any auth provider."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int = 3600


class TokenData(BaseModel):
    """Claims extracted from a validated JWT — before profile enrichment."""

    user_id: str
    email: Optional[str] = None
