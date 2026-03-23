"""Shared authentication package — strategy pattern for local and Cognito auth."""

from backend.common.auth.dependencies import get_current_user, invalidate_profile_cache
from backend.common.auth.factory import create_auth_provider
from backend.common.auth.identity import UserIdentity, UserRole
from backend.common.auth.provider import AuthProvider
from backend.common.auth.token_costs import DEFAULT_STARTER_TOKENS, ENDPOINT_COSTS
from backend.common.auth.token_dependency import require_simulation_tokens

__all__ = [
    "UserIdentity",
    "UserRole",
    "AuthProvider",
    "create_auth_provider",
    "get_current_user",
    "invalidate_profile_cache",
    "require_simulation_tokens",
    "ENDPOINT_COSTS",
    "DEFAULT_STARTER_TOKENS",
]
