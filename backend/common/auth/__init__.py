"""Shared authentication package — strategy pattern for local and Cognito auth."""

from backend.common.auth.dependencies import get_current_user
from backend.common.auth.factory import create_auth_provider
from backend.common.auth.identity import UserIdentity
from backend.common.auth.provider import AuthProvider

__all__ = [
    "UserIdentity",
    "AuthProvider",
    "create_auth_provider",
    "get_current_user",
]
