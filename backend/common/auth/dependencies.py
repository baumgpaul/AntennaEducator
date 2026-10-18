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
from typing import Dict, Optional, Tuple

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.common.auth.activity import record_activity
from backend.common.auth.factory import create_auth_provider
from backend.common.auth.identity import UserIdentity

logger = logging.getLogger(__name__)

# FastAPI extracts the token from the ``Authorization: Bearer <token>`` header
_bearer_scheme = HTTPBearer(auto_error=False)

# Behind CloudFront with Origin Access Control, CloudFront signs the request to
# the Lambda Function URL by *overwriting* the Authorization header, so the
# frontend sends the access token in this header as well (it wins when set).
ACCESS_TOKEN_HEADER = "x-access-token"


def _extract_token(request: Request, credentials: Optional[HTTPAuthorizationCredentials]) -> str:
    token = request.headers.get(ACCESS_TOKEN_HEADER)
    if token:
        return token.removeprefix("Bearer ").strip()
    if credentials is not None and credentials.scheme.lower() == "bearer":
        return credentials.credentials
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


# ── In-memory profile cache ─────────────────────────────────────────
# Avoids a DynamoDB GetItem on every authenticated request.
# Admin / lock changes propagate within ``_PROFILE_CACHE_TTL`` seconds.
_PROFILE_CACHE_TTL = 60  # seconds
_profile_cache: Dict[str, Tuple[UserIdentity, float]] = {}


def invalidate_profile_cache(user_id: str) -> None:
    """Remove a specific profile from the cache (e.g. after admin action)."""
    _profile_cache.pop(user_id, None)


_PENDING_DETAIL = "Account is pending approval by an administrator."


async def _resolve_user(token: str) -> UserIdentity:
    """Validate the bearer token and return the (cached) profile.

    Raises:
        HTTPException 401: invalid / expired token, unknown user.
        HTTPException 403: user account is locked.
    """
    provider = create_auth_provider()

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

    # 2. Check profile cache, else 3. enrich with profile data (role, lock, approval …)
    now = time.monotonic()
    cached = _profile_cache.get(token_data.user_id)
    if cached is not None and (now - cached[1]) < _PROFILE_CACHE_TTL:
        user = cached[0]
    else:
        user = await provider.get_user_profile(token_data.user_id, email_hint=token_data.email)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found",
            )
        _profile_cache[token_data.user_id] = (user, now)
        record_activity(user.id)

    # 4. Check lock status
    if user.is_locked:
        logger.warning("Locked user attempted access: %s", user.email)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is locked. Please contact an administrator.",
        )

    logger.debug("Authenticated: %s (%s)", user.id, user.email)
    return user


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> UserIdentity:
    """FastAPI dependency — returns the authenticated, **approved** ``UserIdentity``.

    Raises:
        HTTPException 401: invalid / expired token, unknown user.
        HTTPException 403: account locked or still pending admin approval.
    """
    user = await _resolve_user(_extract_token(request, credentials))
    if not user.is_approved:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=_PENDING_DETAIL)
    return user


async def get_current_user_allow_pending(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> UserIdentity:
    """Like ``get_current_user`` but also admits accounts awaiting approval.

    Only for endpoints a pending user needs (``/api/auth/me``), so the
    frontend can show "waiting for approval" instead of a generic error.
    """
    return await _resolve_user(_extract_token(request, credentials))
