"""FastAPI dependencies for authentication.

Every protected endpoint does::

    @app.get("/api/something")
    async def my_endpoint(user: UserIdentity = Depends(get_current_user)):
        ...

The dependency extracts the Bearer token, validates it via the configured
``AuthProvider``, enriches it with profile data, and returns a
``UserIdentity``.

Profile data is cached for ``_PROFILE_CACHE_TTL`` seconds to avoid
hitting DynamoDB on every single request.
"""

import logging
import time
from typing import Dict, Tuple

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.common.auth.factory import create_auth_provider
from backend.common.auth.identity import UserIdentity

logger = logging.getLogger(__name__)

# FastAPI extracts the token from the ``Authorization: Bearer <token>`` header
_bearer_scheme = HTTPBearer()

# ── In-memory profile cache ─────────────────────────────────────────
# Avoids a DynamoDB GetItem on every authenticated request.
# Admin / lock changes propagate within ``_PROFILE_CACHE_TTL`` seconds.
_PROFILE_CACHE_TTL = 60  # seconds
_profile_cache: Dict[str, Tuple[UserIdentity, float]] = {}


def invalidate_profile_cache(user_id: str) -> None:
    """Remove a specific profile from the cache (e.g. after admin action)."""
    _profile_cache.pop(user_id, None)


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

    # 2. Check profile cache
    now = time.monotonic()
    cached = _profile_cache.get(token_data.user_id)
    if cached is not None:
        user, cached_at = cached
        if (now - cached_at) < _PROFILE_CACHE_TTL:
            if user.is_locked:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Account is locked. Please contact an administrator.",
                )
            return user

    # 3. Enrich with profile data (admin flag, lock status …)
    user = await provider.get_user_profile(token_data.user_id, email_hint=token_data.email)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    # 4. Store in cache
    _profile_cache[token_data.user_id] = (user, now)

    # 5. Check lock status
    if user.is_locked:
        logger.warning("Locked user attempted access: %s", user.email)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is locked. Please contact an administrator.",
        )

    logger.debug("Authenticated: %s (%s)", user.id, user.email)
    return user
