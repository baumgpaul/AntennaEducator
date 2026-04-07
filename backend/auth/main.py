"""Auth Service — registration, login, user info endpoints.

In standalone mode this runs on port 8011.
In AWS mode this is NOT deployed — Cognito handles registration/login
and the projects Lambda re-mounts the /me endpoint.
"""

import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from backend.auth.schemas import Token, UserCreate, UserLogin, UserResponse
from backend.common.auth import UserIdentity, create_auth_provider, get_current_user
from backend.common.utils.error_handler import install_error_handlers
from backend.common.utils.logging_config import configure_logging

logger = configure_logging("auth")

app = FastAPI(
    title="Antenna Simulator — Auth Service",
    description="Authentication and user management API",
    version="0.2.0",
)

# CORS — only when NOT running inside Lambda
if not os.getenv("AWS_LAMBDA_FUNCTION_NAME"):
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

install_error_handlers(app)


@app.get("/health")
async def health_check():
    from datetime import datetime, timezone

    provider = create_auth_provider()
    return {
        "status": "healthy",
        "service": "auth",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "auth_mode": type(provider).__name__,
    }


@app.post(
    "/api/auth/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register(user_data: UserCreate):
    """Register a new user (local mode or Cognito)."""
    provider = create_auth_provider()
    try:
        identity = await provider.register(
            email=user_data.email,
            username=user_data.username,
            password=user_data.password,
        )
    except ValueError as exc:
        # Generic message to prevent username/email enumeration
        logger.info("Registration rejected: %s", exc)
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Registration failed. Please check your input.",
        )
    except Exception:
        logger.error("Registration error for user %r", user_data.username)
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registration failed. Please try again.",
        )

    return UserResponse(
        id=identity.id,
        email=identity.email,
        username=identity.username,
        role=identity.role.value,
        is_admin=identity.is_admin,
        is_locked=identity.is_locked,
        created_at=str(identity.created_at) if identity.created_at else None,
    )


@app.post("/api/auth/login", response_model=Token)
async def login(user_data: UserLogin):
    """Authenticate and return an access token."""
    provider = create_auth_provider()
    try:
        token_resp = await provider.login(
            email=user_data.email,
            password=user_data.password,
        )
    except ValueError as exc:
        detail = str(exc)
        is_locked = "locked" in detail.lower()
        logger.info("Login rejected (locked=%s)", is_locked)
        raise HTTPException(
            status.HTTP_403_FORBIDDEN if is_locked else status.HTTP_401_UNAUTHORIZED,
            detail="Account is locked." if is_locked else "Invalid credentials.",
        )
    except Exception:
        logger.error("Login error")
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed.",
        )

    return Token(
        access_token=token_resp.access_token,
        token_type=token_resp.token_type,
        expires_in=token_resp.expires_in,
    )


@app.get("/api/auth/me", response_model=UserResponse)
async def get_current_user_info(
    user: UserIdentity = Depends(get_current_user),
):
    """Return the authenticated user's profile.

    Always reads simulation_tokens and flatrate_until fresh from DynamoDB so
    the token balance shown in the UI is never stale (the profile cache in
    get_current_user has a 60 s TTL which would otherwise hide deductions).
    """
    from backend.common.repositories.user_repository import UserRepository

    simulation_tokens = user.simulation_tokens
    flatrate_until = user.flatrate_until
    try:
        repo = UserRepository()
        fresh = repo.get_user_by_id(user.id)
        if fresh:
            simulation_tokens = fresh.get("simulation_tokens", simulation_tokens)
            flatrate_until = fresh.get("flatrate_until", flatrate_until)
    except Exception as exc:
        logger.warning("Failed to fetch fresh token balance for %s: %s", user.id, exc)

    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        role=user.role.value,
        is_admin=user.is_admin,
        is_locked=user.is_locked,
        created_at=str(user.created_at) if user.created_at else None,
        simulation_tokens=simulation_tokens,
        flatrate_until=str(flatrate_until) if flatrate_until else None,
    )


# Lambda handler
def handler(event, context):
    from mangum import Mangum

    return Mangum(app)(event, context)
