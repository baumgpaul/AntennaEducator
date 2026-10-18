"""B15: duplicating a project copies everything and stays in its folder."""

from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from backend.common.auth.dependencies import get_current_user
from backend.common.auth.identity import UserIdentity, UserRole
from backend.projects import main

USER = UserIdentity(id="u1", email="u@x.example", username="u", role=UserRole.USER)
ORIGINAL = {
    "id": "p1",
    "user_id": "u1",
    "name": "Dipole",
    "description": "",
    "folder_id": "f1",
    "source_project_id": "course-p9",
    "design_state": {"elements": [1]},
    "simulation_config": {},
    "simulation_results": {"result_keys": {"solver": "results/p1/solver.json"}},
    "ui_state": {},
    "documentation": {"has_content": True, "image_keys": ["a.png"]},
    "created_at": "2026-10-01T00:00:00+00:00",
    "updated_at": "2026-10-01T00:00:00+00:00",
}


def _client(repo, results, docs):
    main.app.dependency_overrides[get_current_user] = lambda: USER
    main.app.dependency_overrides[main.get_repository] = lambda: repo
    main.app.dependency_overrides[main.get_results_service] = lambda: results
    main.app.dependency_overrides[main._get_doc_service] = lambda: docs
    return TestClient(main.app)


def test_duplicate_copies_results_and_docs_into_same_folder():
    repo = AsyncMock()
    copy = {**ORIGINAL, "id": "p2", "name": "Dipole (Copy)"}
    repo.get_project.side_effect = lambda project_id: ORIGINAL if project_id == "p1" else copy
    repo.create_project.return_value = {"id": "p2"}
    results = AsyncMock()
    results.duplicate_results.return_value = {"solver": "results/p2/solver.json"}
    docs = AsyncMock()
    docs.load_content.return_value = {"content": "# Notes"}
    docs.duplicate_images.return_value = ["a.png"]
    try:
        resp = _client(repo, results, docs).post("/api/projects/p1/duplicate")
    finally:
        main.app.dependency_overrides.clear()

    assert resp.status_code == 201
    kwargs = repo.create_project.await_args.kwargs
    assert kwargs["folder_id"] == "f1"
    assert kwargs["name"] == "Dipole (Copy)"
    assert kwargs["source_project_id"] == "course-p9"  # not "p1": no reset-to-original
    results.duplicate_results.assert_awaited_once()
    docs.save_content.assert_awaited_once_with("p2", "# Notes")
    docs.duplicate_images.assert_awaited_once()


def test_cannot_duplicate_someone_elses_project():
    repo = AsyncMock()
    repo.get_project.return_value = {**ORIGINAL, "user_id": "other"}
    try:
        resp = _client(repo, AsyncMock(), AsyncMock()).post("/api/projects/p1/duplicate")
    finally:
        main.app.dependency_overrides.clear()
    assert resp.status_code == 404
    repo.create_project.assert_not_awaited()
