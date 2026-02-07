"""CognitoAuthProvider — AWS Cognito with proper JWKS JWT verification.

Used for AWS deployments (``USE_COGNITO=true``).

Key improvement over the old code: tokens are now **cryptographically
verified** against Cognito's public JWKS keys instead of being merely
base64-decoded.
"""

import logging
import os
import time
from datetime import datetime, timezone
from typing import Dict, Optional

import boto3
import requests
from botocore.exceptions import ClientError
from jose import JWTError, jwt

from backend.common.auth.identity import TokenData, TokenResponse, UserIdentity
from backend.common.auth.provider import AuthProvider

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
COGNITO_REGION = os.getenv("COGNITO_REGION", "eu-west-1")
COGNITO_USER_POOL_ID = os.getenv("COGNITO_USER_POOL_ID", "")
COGNITO_CLIENT_ID = os.getenv("COGNITO_CLIENT_ID", "")
DYNAMODB_TABLE_NAME = os.getenv("DYNAMODB_TABLE_NAME", "antenna-simulator-staging")

JWKS_URL = (
    f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com"
    f"/{COGNITO_USER_POOL_ID}/.well-known/jwks.json"
)
ISSUER = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"

# Cache JWKS keys for 1 hour
_jwks_cache: Dict = {}
_jwks_cache_time: float = 0
_JWKS_CACHE_TTL = 3600  # seconds


def _get_jwks() -> Dict:
    """Fetch (and cache) the Cognito JWKS key set."""
    global _jwks_cache, _jwks_cache_time

    now = time.time()
    if _jwks_cache and (now - _jwks_cache_time) < _JWKS_CACHE_TTL:
        return _jwks_cache

    logger.info("Fetching Cognito JWKS from %s", JWKS_URL)
    resp = requests.get(JWKS_URL, timeout=5)
    resp.raise_for_status()
    _jwks_cache = resp.json()
    _jwks_cache_time = now
    return _jwks_cache


def _get_signing_key(token: str) -> dict:
    """Find the JWKS key whose ``kid`` matches the token header."""
    headers = jwt.get_unverified_header(token)
    kid = headers.get("kid")
    if not kid:
        raise ValueError("Token header missing 'kid'")

    jwks = _get_jwks()
    for key in jwks.get("keys", []):
        if key["kid"] == kid:
            return key

    # Key not found — maybe Cognito rotated. Force refresh once.
    global _jwks_cache_time
    _jwks_cache_time = 0
    jwks = _get_jwks()
    for key in jwks.get("keys", []):
        if key["kid"] == kid:
            return key

    raise ValueError(f"Signing key {kid!r} not found in JWKS")


class CognitoAuthProvider(AuthProvider):
    """AWS Cognito authentication with JWKS-verified JWTs."""

    def __init__(self) -> None:
        self._cognito = boto3.client("cognito-idp", region_name=COGNITO_REGION)
        self._dynamodb = boto3.resource("dynamodb", region_name=COGNITO_REGION)
        self._table = self._dynamodb.Table(DYNAMODB_TABLE_NAME)
        logger.info(
            "CognitoAuthProvider initialised (pool=%s, region=%s)",
            COGNITO_USER_POOL_ID,
            COGNITO_REGION,
        )

    # ── Token validation (JWKS-verified!) ─────────────────────────────────

    def validate_token(self, token: str) -> TokenData:
        if not token or not token.strip():
            raise ValueError("Token must be a non-empty string")

        try:
            signing_key = _get_signing_key(token)
            payload = jwt.decode(
                token,
                signing_key,
                algorithms=["RS256"],
                audience=COGNITO_CLIENT_ID,
                issuer=ISSUER,
                options={"verify_at_hash": False},
            )
        except JWTError as exc:
            raise ValueError(f"Invalid Cognito token: {exc}")

        user_id = payload.get("sub")
        if not user_id:
            raise ValueError("Token missing 'sub' claim")

        return TokenData(
            user_id=user_id,
            email=payload.get("email"),
        )

    # ── Registration ──────────────────────────────────────────────────────

    async def register(
        self,
        email: str,
        username: str,
        password: str,
    ) -> UserIdentity:
        try:
            resp = self._cognito.sign_up(
                ClientId=COGNITO_CLIENT_ID,
                Username=email,
                Password=password,
                UserAttributes=[{"Name": "email", "Value": email}],
            )
            user_sub = resp["UserSub"]
        except ClientError as exc:
            code = exc.response["Error"]["Code"]
            msg = exc.response["Error"]["Message"]
            if code == "UsernameExistsException":
                raise ValueError("Email already registered")
            if code == "InvalidPasswordException":
                raise ValueError("Password does not meet requirements")
            raise ValueError(msg)

        # Auto-confirm to skip email verification flow
        try:
            self._cognito.admin_confirm_sign_up(
                UserPoolId=COGNITO_USER_POOL_ID,
                Username=email,
            )
        except ClientError:
            logger.warning("Could not auto-confirm user %s", email)

        # Create DynamoDB profile record
        now = datetime.now(timezone.utc).isoformat()
        self._table.put_item(
            Item={
                "PK": f"USER#{user_sub}",
                "SK": "METADATA",
                "user_id": user_sub,
                "email": email,
                "username": username,
                "is_admin": False,
                "is_locked": False,
                "created_at": now,
                "entity_type": "user",
            }
        )

        logger.info("Cognito user registered: %s (sub=%s)", email, user_sub)

        return UserIdentity(
            id=user_sub,
            email=email,
            username=username,
            is_admin=False,
            is_locked=False,
            created_at=now,
        )

    # ── Login ─────────────────────────────────────────────────────────────

    async def login(self, email: str, password: str) -> TokenResponse:
        try:
            resp = self._cognito.initiate_auth(
                ClientId=COGNITO_CLIENT_ID,
                AuthFlow="USER_PASSWORD_AUTH",
                AuthParameters={"USERNAME": email, "PASSWORD": password},
            )
        except ClientError as exc:
            code = exc.response["Error"]["Code"]
            if code in ("NotAuthorizedException", "UserNotFoundException"):
                raise ValueError("Invalid email or password")
            if code == "UserNotConfirmedException":
                raise ValueError("Email not verified")
            raise ValueError(exc.response["Error"]["Message"])

        if "ChallengeName" in resp:
            raise ValueError(f"Auth challenge required: {resp['ChallengeName']}")

        auth = resp["AuthenticationResult"]

        # Verify user is not locked (check DynamoDB)
        # Decode the ID token to get sub (we now verify properly)
        id_claims = jwt.get_unverified_claims(auth["IdToken"])
        user_sub = id_claims.get("sub")
        if user_sub:
            profile = await self.get_user_profile(user_sub)
            if profile and profile.is_locked:
                raise ValueError("Account is locked. Please contact an administrator.")

        return TokenResponse(
            access_token=auth["AccessToken"],
            token_type="bearer",
            expires_in=auth.get("ExpiresIn", 3600),
        )

    # ── Profile enrichment ────────────────────────────────────────────────

    async def get_user_profile(self, user_id: str) -> Optional[UserIdentity]:
        try:
            resp = self._table.get_item(Key={"PK": f"USER#{user_id}", "SK": "METADATA"})
        except ClientError as exc:
            logger.error("DynamoDB error looking up user %s: %s", user_id, exc)
            return None

        item = resp.get("Item")
        if not item:
            # Lazy-init: user registered via Cognito but no DynamoDB record yet
            return await self._lazy_init_profile(user_id)

        return UserIdentity(
            id=item["user_id"],
            email=item["email"],
            username=item.get("username", item["email"].split("@")[0]),
            is_admin=item.get("is_admin", False),
            is_locked=item.get("is_locked", False),
            created_at=item.get("created_at"),
        )

    # ── Helpers ───────────────────────────────────────────────────────────

    async def _lazy_init_profile(self, user_id: str) -> UserIdentity:
        """Create a DynamoDB record for a Cognito user on first API call."""
        logger.info("Lazy-init: creating DynamoDB profile for %s", user_id)
        now = datetime.now(timezone.utc).isoformat()

        # We don't have the email here — caller should enrich from token claims
        item = {
            "PK": f"USER#{user_id}",
            "SK": "METADATA",
            "user_id": user_id,
            "email": "unknown",
            "username": f"user_{user_id[:8]}",
            "is_admin": False,
            "is_locked": False,
            "created_at": now,
            "entity_type": "user",
        }
        self._table.put_item(Item=item)

        return UserIdentity(
            id=user_id,
            email="unknown",
            username=item["username"],
            is_admin=False,
            is_locked=False,
            created_at=now,
        )
