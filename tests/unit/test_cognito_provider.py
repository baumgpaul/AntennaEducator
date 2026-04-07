"""Tests for CognitoAuthProvider — fail-fast validation and init."""

import os
from unittest.mock import patch

import pytest


class TestCognitoProviderInit:
    """Cognito provider must fail fast on missing config."""

    @patch.dict(
        os.environ,
        {"COGNITO_USER_POOL_ID": "", "COGNITO_CLIENT_ID": "some-client-id"},
    )
    def test_missing_user_pool_id_raises(self):
        # Must reimport to pick up env changes in module-level vars
        import importlib

        import backend.common.auth.cognito_provider as mod

        importlib.reload(mod)
        with pytest.raises(ValueError, match="COGNITO_USER_POOL_ID"):
            mod.CognitoAuthProvider()

    @patch.dict(
        os.environ,
        {"COGNITO_USER_POOL_ID": "eu-west-1_abc", "COGNITO_CLIENT_ID": ""},
    )
    def test_missing_client_id_raises(self):
        import importlib

        import backend.common.auth.cognito_provider as mod

        importlib.reload(mod)
        with pytest.raises(ValueError, match="COGNITO_CLIENT_ID"):
            mod.CognitoAuthProvider()

    @patch.dict(
        os.environ,
        {
            "COGNITO_USER_POOL_ID": "eu-west-1_testpool",
            "COGNITO_CLIENT_ID": "test-client-id",
        },
    )
    @patch("boto3.client")
    @patch("boto3.resource")
    def test_valid_config_initialises(self, mock_resource, mock_client):
        import importlib

        import backend.common.auth.cognito_provider as mod

        importlib.reload(mod)
        provider = mod.CognitoAuthProvider()
        assert provider is not None
