"""Tests for the global error handler middleware."""

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from backend.common.utils.error_handler import install_error_handlers


def _make_app() -> FastAPI:
    """Create a minimal app with error handlers installed."""
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/ok")
    async def ok():
        return {"status": "ok"}

    @app.get("/http-error")
    async def http_error():
        raise HTTPException(status_code=422, detail="bad input")

    @app.get("/crash")
    async def crash():
        raise RuntimeError("unexpected boom")

    return app


@pytest.fixture()
def client():
    return TestClient(_make_app())


class TestRequestIdMiddleware:
    def test_response_has_request_id(self, client):
        resp = client.get("/ok")
        assert resp.status_code == 200
        assert "x-request-id" in resp.headers

    def test_request_id_forwarded(self, client):
        resp = client.get("/ok", headers={"X-Request-ID": "abc-123"})
        assert resp.headers["x-request-id"] == "abc-123"


class TestGlobalExceptionHandler:
    def test_unhandled_exception_returns_500(self, client):
        resp = client.get("/crash")
        assert resp.status_code == 500
        body = resp.json()
        assert body["detail"] == "Internal server error"
        # Must NOT leak the actual crash message
        assert "boom" not in str(body)

    def test_unhandled_exception_has_request_id(self, client):
        resp = client.get("/crash")
        assert "x-request-id" in resp.headers

    def test_http_exception_not_swallowed(self, client):
        resp = client.get("/http-error")
        assert resp.status_code == 422
        assert resp.json()["detail"] == "bad input"
