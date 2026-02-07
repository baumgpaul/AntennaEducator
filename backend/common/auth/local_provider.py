"""LocalAuthProvider — bcrypt passwords + HS256 JWTs.

Used for standalone / Docker / on-prem deployments (``USE_COGNITO=false``).
"""

import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import jwt, JWTError
from passlib.context import CryptContext

from backend.common.auth.identity import UserIdentity, TokenResponse, TokenData
from backend.common.auth.provider import AuthProvider
from backend.common.repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
JWT_SECRET = os.getenv(
    "JWT_SECRET_KEY",
    "your-secret-key-change-in-production",
)
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
MIN_PASSWORD_LENGTH = 8

# bcrypt context (truncates input at 72 bytes — that's a bcrypt limitation)
_pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


class LocalAuthProvider(AuthProvider):
    """Standalone auth: bcrypt password hashing + locally-signed JWTs."""

    def __init__(self) -> None:
        self._user_repo = UserRepository()
        logger.info("LocalAuthProvider initialised")

    # ── Token validation ──────────────────────────────────────────────────

    def validate_token(self, token: str) -> TokenData:
        if not token or not token.strip():
            raise ValueError("Token must be a non-empty string")

        try:
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except jwt.ExpiredSignatureError:
            raise ValueError("Token expired")
        except JWTError as exc:
            raise ValueError(f"Invalid token: {exc}")

        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("Token missing required 'sub' claim")

        return TokenData(user_id=user_id, email=payload.get("email"))

    # ── Registration ──────────────────────────────────────────────────────

    async def register(
        self,
        email: str,
        username: str,
        password: str,
    ) -> UserIdentity:
        if len(password) < MIN_PASSWORD_LENGTH:
            raise ValueError(
                f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
            )

        # First user becomes admin
        is_first = self._user_repo.get_user_count() == 0

        hashed = _pwd_ctx.hash(password[:72])
        db_user = self._user_repo.create_user(
            email=email,
            username=username,
            password_hash=hashed,
            is_admin=is_first,
            is_locked=False,
        )

        logger.info("User registered: %s (admin=%s)", email, is_first)

        return UserIdentity(
            id=db_user["user_id"],
            email=db_user["email"],
            username=db_user["username"],
            is_admin=db_user.get("is_admin", False),
            is_locked=False,
            created_at=db_user.get("created_at"),
        )

    # ── Login ─────────────────────────────────────────────────────────────

    async def login(self, email: str, password: str) -> TokenResponse:
        db_user = self._user_repo.get_user_by_email(email)
        if not db_user:
            raise ValueError("Invalid email or password")

        if not _pwd_ctx.verify(password[:72], db_user.get("password_hash", "")):
            raise ValueError("Invalid email or password")

        if db_user.get("is_locked", False):
            raise ValueError("Account is locked. Please contact an administrator.")

        token = self._create_jwt(
            user_id=db_user["user_id"],
            email=db_user["email"],
        )

        return TokenResponse(
            access_token=token,
            token_type="bearer",
            expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )

    # ── Profile enrichment ────────────────────────────────────────────────

    async def get_user_profile(self, user_id: str) -> Optional[UserIdentity]:
        db_user = self._user_repo.get_user_by_id(user_id)
        if not db_user:
            return None

        return UserIdentity(
            id=db_user["user_id"],
            email=db_user["email"],
            username=db_user["username"],
            is_admin=db_user.get("is_admin", False),
            is_locked=db_user.get("is_locked", False),
            created_at=db_user.get("created_at"),
        )

    # ── Helpers ───────────────────────────────────────────────────────────

    @staticmethod
    def _create_jwt(user_id: str, email: str) -> str:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        return jwt.encode(
            {"sub": user_id, "email": email, "exp": expire},
            JWT_SECRET,
            algorithm=JWT_ALGORITHM,
        )
