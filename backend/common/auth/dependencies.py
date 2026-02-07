"""FastAPI dependencies for authentication.

Every protected endpoint does::

    @app.get("/api/something")
    async def my_endpoint(user: UserIdentity = Depends(get_current_user)):
        ...

The dependency extracts the Bearer token, validates it via the configured
``AuthProvider``, enriches it with profile data, and returns a
``UserIdentity``.
"""

import logging

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.common.auth.factory import create_auth_provider
from backend.common.auth.identity import UserIdentity

logger = logging.getLogger(__name__)

# FastAPI extracts the token from the ``Authorization: Bearer <token>`` header
_bearer_scheme = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> UserIdentity:
    """FastAPI dependency — returns the authenticated ``UserIdentity``.

    Raises:
        HTTPException 401: invalid / expired token, unknown user.
        HTTPException 403: user account is locked.
    """
    provider = create_auth_provider()
    token = credentials.credentials

    # 1. Validate token (signature + expiry)
    try:
        token_data = provider.validate_token(token)
    except ValueError as exc:
        logger.warning("Token validation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 2. Enrich with profile data (admin flag, lock status …)
    user = await provider.get_user_profile(token_data.user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # 3. Check lock status
    if user.is_locked:
        logger.warning("Locked user attempted access: %s", user.email)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is locked. Please contact an administrator.",
        )

    logger.debug("Authenticated: %s (%s)", user.id, user.email)
    return user
