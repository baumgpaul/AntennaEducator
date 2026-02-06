"""Auth provider factory — selects LocalAuthProvider or CognitoAuthProvider.

The choice is made once at import time via the ``USE_COGNITO`` env var.
All services import ``get_auth_provider()`` and get the same singleton.
"""

import os
import logging
from functools import lru_cache

from backend.common.auth.provider import AuthProvider

logger = logging.getLogger(__name__)

USE_COGNITO = os.getenv("USE_COGNITO", "false").lower() == "true"


@lru_cache(maxsize=1)
def create_auth_provider() -> AuthProvider:
    """Return the singleton auth provider for the current deployment mode."""
    if USE_COGNITO:
        from backend.common.auth.cognito_provider import CognitoAuthProvider

        logger.info("Auth mode: AWS Cognito")
        return CognitoAuthProvider()
    else:
        from backend.common.auth.local_provider import LocalAuthProvider

        logger.info("Auth mode: Local (bcrypt + JWT)")
        return LocalAuthProvider()
