"""Projects have a simulation method (kind): peec (default) or fem."""

from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from backend.common.auth.dependencies import get_current_user
from backend.common.auth.identity import UserIdentity, UserRole
from backend.common.repositories.dynamodb_repository import DynamoDBProjectRepository
from backend.projects import main

NOW = "2026-10-20T00:00:00+00:00"


def _created(kind):
    return {
        "id": "p1",
        "user_id": "u1",
        "name": "Model",
        "kind": kind,
        "description": "",
        "folder_id": None,
        "design_state": {},
        "simulation_config": {},
        "simulation_results": {},
        "ui_state": {},
        "documentation": {},
        "created_at": NOW,
        "updated_at": NOW,
    }


def _post(role, body):
    repo = AsyncMock()
    repo.create_project.side_effect = lambda **kw: _created(kw.get("kind", "peec"))
    main.app.dependency_overrides[get_current_user] = lambda: UserIdentity(
        id="u1", email="u@x.example", username="u", role=role
    )
    main.app.dependency_overrides[main.get_repository] = lambda: repo
    try:
        return TestClient(main.app).post("/api/projects", json=body), repo
    finally:
        main.app.dependency_overrides.clear()


def test_projects_are_peec_by_default():
    resp, repo = _post(UserRole.USER, {"name": "Dipole"})
    assert resp.status_code == 201
    assert repo.create_project.await_args.kwargs["kind"] == "peec"
    assert resp.json()["kind"] == "peec"


def test_maintainers_can_create_fem_projects():
    resp, repo = _post(UserRole.MAINTAINER, {"name": "Coax", "kind": "fem"})
    assert resp.status_code == 201
    assert repo.create_project.await_args.kwargs["kind"] == "fem"
    assert resp.json()["kind"] == "fem"


def test_students_cannot_create_fem_projects_during_the_preview():
    resp, repo = _post(UserRole.USER, {"name": "Coax", "kind": "fem"})
    assert resp.status_code == 403
    repo.create_project.assert_not_awaited()


def test_unknown_kind_is_rejected():
    resp, _ = _post(UserRole.ADMIN, {"name": "X", "kind": "fdtd"})
    assert resp.status_code == 422


def test_stored_items_without_kind_are_antenna_projects():
    """Projects created before FEM have no Kind attribute."""
    item = {"ProjectId": "p1", "UserId": "u1", "Name": "Old", "CreatedAt": NOW, "UpdatedAt": NOW}
    assert DynamoDBProjectRepository._to_dict(item)["kind"] == "peec"
    assert DynamoDBProjectRepository._to_dict({**item, "Kind": "fem"})["kind"] == "fem"


def test_copies_keep_the_method():
    original = {**_created("fem"), "user_id": "u1"}
    repo = AsyncMock()
    repo.get_project.side_effect = lambda project_id: (
        original if project_id == "p1" else {**original, "id": "p2"}
    )
    repo.create_project.return_value = {"id": "p2"}
    docs = AsyncMock()
    docs.load_content.return_value = None
    main.app.dependency_overrides[get_current_user] = lambda: UserIdentity(
        id="u1", email="u@x.example", username="u", role=UserRole.MAINTAINER
    )
    main.app.dependency_overrides[main.get_repository] = lambda: repo
    main.app.dependency_overrides[main.get_results_service] = lambda: AsyncMock()
    main.app.dependency_overrides[main._get_doc_service] = lambda: docs
    try:
        resp = TestClient(main.app).post("/api/projects/p1/duplicate")
    finally:
        main.app.dependency_overrides.clear()
    assert resp.status_code == 201, resp.text
    assert repo.create_project.await_args.kwargs["kind"] == "fem"
