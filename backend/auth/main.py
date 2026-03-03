"""Auth Service — registration, login, user info endpoints.

In standalone mode this runs on port 8011.
In AWS mode this is NOT deployed — Cognito handles registration/login
and the projects Lambda re-mounts the /me endpoint.
"""

import logging
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler()],
)
logger = logging.getLogger(__name__)

from backend.auth.schemas import Token, UserCreate, UserLogin, UserResponse
from backend.common.auth import UserIdentity, create_auth_provider, get_current_user

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
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error("Registration error: %s", exc)
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
        code = (
            status.HTTP_403_FORBIDDEN
            if "locked" in detail.lower()
            else status.HTTP_401_UNAUTHORIZED
        )
        raise HTTPException(code, detail=detail)
    except Exception as exc:
        logger.error("Login error: %s", exc)
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
    """Return the authenticated user's profile."""
    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        role=user.role.value,
        is_admin=user.is_admin,
        is_locked=user.is_locked,
        created_at=str(user.created_at) if user.created_at else None,
    )


# Lambda handler
def handler(event, context):
    from mangum import Mangum

    return Mangum(app)(event, context)
