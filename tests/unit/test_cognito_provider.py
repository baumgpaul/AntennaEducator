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


# ── Token validation ──────────────────────────────────────────────────────────

_CLIENT_ID = "test-client-id"
_POOL_ID = "eu-west-1_testpool"
_ISSUER = f"https://cognito-idp.eu-west-1.amazonaws.com/{_POOL_ID}"


@pytest.fixture(scope="module")
def rsa_keys():
    """An RSA key pair standing in for Cognito's JWKS signing key."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from jose import jwk

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    public_pem = key.public_key().public_bytes(
        serialization.Encoding.PEM,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    public_jwk = jwk.construct(public_pem, "RS256").to_dict()
    public_jwk["kid"] = "test-kid"
    return private_pem, public_jwk


@pytest.fixture
def provider(rsa_keys):
    import backend.common.auth.cognito_provider as mod

    _, public_jwk = rsa_keys
    with (
        patch.object(mod, "COGNITO_USER_POOL_ID", _POOL_ID),
        patch.object(mod, "COGNITO_CLIENT_ID", _CLIENT_ID),
        patch.object(mod, "ISSUER", _ISSUER),
        patch.object(mod, "_get_signing_key", return_value=public_jwk),
        patch("boto3.client"),
        patch("boto3.resource"),
    ):
        yield mod.CognitoAuthProvider()


def _sign(rsa_keys, **claims) -> str:
    from datetime import datetime, timedelta, timezone

    from jose import jwt

    private_pem, _ = rsa_keys
    payload = {
        "sub": "user-sub-1",
        "iss": _ISSUER,
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        **claims,
    }
    return jwt.encode(payload, private_pem, algorithm="RS256", headers={"kid": "test-kid"})


class TestCognitoValidateToken:
    def test_id_token_for_our_client_accepted(self, provider, rsa_keys):
        token = _sign(rsa_keys, token_use="id", aud=_CLIENT_ID, email="a@b.com")
        data = provider.validate_token(token)
        assert data.user_id == "user-sub-1"
        assert data.email == "a@b.com"

    def test_access_token_for_our_client_accepted(self, provider, rsa_keys):
        token = _sign(rsa_keys, token_use="access", client_id=_CLIENT_ID)
        assert provider.validate_token(token).user_id == "user-sub-1"

    def test_access_token_for_other_client_rejected(self, provider, rsa_keys):
        token = _sign(rsa_keys, token_use="access", client_id="some-other-client")
        with pytest.raises(ValueError, match="app client"):
            provider.validate_token(token)

    def test_id_token_for_other_client_rejected(self, provider, rsa_keys):
        token = _sign(rsa_keys, token_use="id", aud="some-other-client")
        with pytest.raises(ValueError, match="Invalid Cognito token"):
            provider.validate_token(token)

    def test_missing_token_use_rejected(self, provider, rsa_keys):
        token = _sign(rsa_keys, client_id=_CLIENT_ID)
        with pytest.raises(ValueError, match="token_use"):
            provider.validate_token(token)

    def test_wrong_issuer_rejected(self, provider, rsa_keys):
        token = _sign(
            rsa_keys,
            token_use="access",
            client_id=_CLIENT_ID,
            iss="https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_otherpool",
        )
        with pytest.raises(ValueError, match="Invalid Cognito token"):
            provider.validate_token(token)
