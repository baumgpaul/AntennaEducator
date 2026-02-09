"""AuthProvider — abstract base class for authentication strategies.

Concrete implementations:
  - ``LocalAuthProvider``   (bcrypt + HS256 JWT)
  - ``CognitoAuthProvider`` (AWS Cognito + JWKS verification)
"""

from abc import ABC, abstractmethod
from typing import Optional

from backend.common.auth.identity import TokenData, TokenResponse, UserIdentity


class AuthProvider(ABC):
    """Strategy interface for authentication."""

    # -- Token validation (used by every protected endpoint) ----------------

    @abstractmethod
    def validate_token(self, token: str) -> TokenData:
        """Validate a JWT and return the raw claims.

        Args:
            token: Bearer token string.

        Returns:
            ``TokenData`` with ``user_id`` and optional ``email``.

        Raises:
            ValueError: If the token is invalid, expired, or malformed.
        """

    # -- Registration & login (used only by the auth service) ---------------

    @abstractmethod
    async def register(
        self,
        email: str,
        username: str,
        password: str,
    ) -> UserIdentity:
        """Register a new user.

        Returns:
            ``UserIdentity`` of the newly created user.

        Raises:
            ValueError: If registration fails (duplicate email, weak password …).
        """

    @abstractmethod
    async def login(self, email: str, password: str) -> TokenResponse:
        """Authenticate a user and return a token.

        Returns:
            ``TokenResponse`` with access token.

        Raises:
            ValueError: Invalid credentials, locked account, etc.
        """

    # -- Profile enrichment -------------------------------------------------

    @abstractmethod
    async def get_user_profile(
        self, user_id: str, email_hint: Optional[str] = None
    ) -> Optional[UserIdentity]:
        """Look up a user's profile data (admin flag, lock status …).

        Called by ``get_current_user()`` after token validation to enrich
        the ``TokenData`` into a full ``UserIdentity``.

        Args:
            user_id: The user's unique identifier.
            email_hint: Email from JWT claims — avoids relying on a
                potentially stale or missing DynamoDB value.

        Returns:
            ``UserIdentity`` or ``None`` if the user record does not exist.
        """
