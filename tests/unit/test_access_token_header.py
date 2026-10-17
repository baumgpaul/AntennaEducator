"""Access token via X-Access-Token (CloudFront OAC overwrites Authorization)."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.common.auth.identity import TokenData, UserIdentity, UserRole


@pytest.fixture
def client():
    from backend.common.auth import dependencies
    from backend.projects.main import app

    provider = MagicMock()
    provider.validate_token.side_effect = lambda t: (
        TokenData(user_id="u-1") if t == "good-token" else (_ for _ in ()).throw(ValueError("bad"))
    )

    async def _profile(*_a, **_k):
        return UserIdentity(id="u-1", email="u@example.com", username="u", role=UserRole.USER)

    provider.get_user_profile.side_effect = _profile
    dependencies._profile_cache.clear()
    with (
        patch.object(dependencies, "create_auth_provider", return_value=provider),
        patch("backend.common.repositories.user_repository.UserRepository") as repo,
    ):
        repo.return_value.get_user_by_id.return_value = None
        yield TestClient(app)
    dependencies._profile_cache.clear()


def test_bearer_authorization_still_works(client):
    assert (
        client.get("/api/auth/me", headers={"Authorization": "Bearer good-token"}).status_code
        == 200
    )


def test_x_access_token_works(client):
    assert client.get("/api/auth/me", headers={"X-Access-Token": "good-token"}).status_code == 200


def test_x_access_token_wins_over_cloudfront_signature(client):
    headers = {
        "Authorization": "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20261017/eu-west-1/lambda",
        "X-Access-Token": "good-token",
    }
    assert client.get("/api/auth/me", headers=headers).status_code == 200


def test_signature_without_access_token_is_401(client):
    headers = {"Authorization": "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/..."}
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_no_token_is_401(client):
    assert client.get("/api/auth/me").status_code == 401


def test_bad_token_is_401(client):
    assert client.get("/api/auth/me", headers={"X-Access-Token": "bad-token"}).status_code == 401
