"""Who may put a project into which folder (TEST_PLAN B6).

Before: anyone could create a project in any course folder (content shown to
all enrolled users), and a student doing so got 404 on their own project
because it was stored under the course owner's partition.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.common.auth.dependencies import get_current_user
from backend.common.auth.identity import UserIdentity, UserRole
from backend.projects.main import app, get_repository

COURSE = {"id": "course-1", "owner_id": "maintainer-1", "is_course": True}
OWN_FOLDER = {"id": "folder-own", "owner_id": "student-1", "is_course": False}
OTHER_FOLDER = {"id": "folder-other", "owner_id": "someone-else", "is_course": False}
FOLDERS = {f["id"]: f for f in (COURSE, OWN_FOLDER, OTHER_FOLDER)}


def _user(user_id: str, role: UserRole) -> UserIdentity:
    return UserIdentity(id=user_id, email=f"{user_id}@example.com", username=user_id, role=role)


@pytest.fixture
def repo():
    mock = MagicMock()
    mock.create_project = AsyncMock(
        side_effect=lambda **kw: {
            "id": "p-new",
            "user_id": kw["user_id"],
            "name": kw["name"],
            "description": kw.get("description") or "",
            "folder_id": kw.get("folder_id"),
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        }
    )
    mock.get_project = AsyncMock(
        return_value={
            "id": "p-1",
            "user_id": "student-1",
            "name": "Mine",
            "description": "",
            "folder_id": None,
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:00Z",
        }
    )
    mock.update_project = AsyncMock(side_effect=lambda **kw: {**mock.get_project.return_value})
    app.dependency_overrides[get_repository] = lambda: mock
    with patch("backend.projects.main.FolderRepository") as folder_cls:
        folder_cls.return_value.get_folder = AsyncMock(side_effect=lambda fid: FOLDERS.get(fid))
        yield mock
    app.dependency_overrides.clear()


def _client_as(user: UserIdentity) -> TestClient:
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app)


class TestCreateInFolder:
    def test_student_cannot_create_in_course(self, repo):
        resp = _client_as(_user("student-1", UserRole.USER)).post(
            "/api/projects", json={"name": "Probe project", "folder_id": "course-1"}
        )
        assert resp.status_code == 403
        repo.create_project.assert_not_called()

    def test_maintainer_creates_in_course_under_course_owner(self, repo):
        resp = _client_as(_user("maintainer-2", UserRole.MAINTAINER)).post(
            "/api/projects", json={"name": "Probe project", "folder_id": "course-1"}
        )
        assert resp.status_code == 201
        assert repo.create_project.call_args.kwargs["user_id"] == "maintainer-1"

    def test_student_creates_in_own_folder(self, repo):
        resp = _client_as(_user("student-1", UserRole.USER)).post(
            "/api/projects", json={"name": "Probe project", "folder_id": "folder-own"}
        )
        assert resp.status_code == 201
        assert repo.create_project.call_args.kwargs["user_id"] == "student-1"

    def test_cannot_create_in_someone_elses_folder(self, repo):
        resp = _client_as(_user("student-1", UserRole.USER)).post(
            "/api/projects", json={"name": "Probe project", "folder_id": "folder-other"}
        )
        assert resp.status_code == 404

    def test_unknown_folder_is_404(self, repo):
        resp = _client_as(_user("student-1", UserRole.USER)).post(
            "/api/projects", json={"name": "Probe project", "folder_id": "nope"}
        )
        assert resp.status_code == 404


class TestMoveIntoFolder:
    def test_student_cannot_move_project_into_course(self, repo):
        resp = _client_as(_user("student-1", UserRole.USER)).put(
            "/api/projects/p-1", json={"folder_id": "course-1"}
        )
        assert resp.status_code == 403
        repo.update_project.assert_not_called()

    def test_student_can_move_into_own_folder(self, repo):
        resp = _client_as(_user("student-1", UserRole.USER)).put(
            "/api/projects/p-1", json={"folder_id": "folder-own"}
        )
        assert resp.status_code == 200
