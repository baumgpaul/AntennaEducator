"""#78: frontend error reports end up as one CLIENT_ERROR log line."""

import json
import logging

from fastapi.testclient import TestClient

from backend.projects.main import app


def test_report_is_logged_without_login(caplog):
    with caplog.at_level(logging.WARNING, logger="backend.projects.client_errors"):
        resp = TestClient(app).post(
            "/api/client-errors",
            json={"message": "TypeError: x is undefined", "kind": "render", "url": "/design"},
        )
    assert resp.status_code == 204
    (record,) = [r for r in caplog.records if r.getMessage().startswith("CLIENT_ERROR ")]
    payload = json.loads(record.getMessage().removeprefix("CLIENT_ERROR "))
    assert payload["message"] == "TypeError: x is undefined"
    assert payload["kind"] == "render"


def test_oversized_report_is_rejected():
    resp = TestClient(app).post("/api/client-errors", json={"message": "x" * 1001})
    assert resp.status_code == 422
