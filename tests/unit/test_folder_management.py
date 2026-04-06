"""Unit tests for folder management, courses, deep copy, and admin role management.

Tests cover:
- FolderRepository CRUD (mock DynamoDB)
- User folder API endpoints
- Public course endpoints (maintainer/admin only)
- Deep-copy course → user space
- Admin role management endpoints
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.common.auth.identity import UserIdentity, UserRole
from backend.common.repositories.folder_repository import COURSES_PK, FolderRepository
from backend.projects.main import app

# ── Test Users ────────────────────────────────────────────────────────────────

NORMAL_USER = UserIdentity(
    id="user-normal-001",
    email="normal@example.com",
    username="normaluser",
    role=UserRole.USER,
)

MAINTAINER_USER = UserIdentity(
    id="user-maint-002",
    email="maintainer@example.com",
    username="maintaineruser",
    role=UserRole.MAINTAINER,
)

ADMIN_USER = UserIdentity(
    id="user-admin-003",
    email="admin@example.com",
    username="adminuser",
    role=UserRole.ADMIN,
)

MOCK_FOLDER = {
    "id": "folder-abc",
    "owner_id": "user-normal-001",
    "name": "My Folder",
    "parent_folder_id": None,
    "is_course": False,
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00",
}

MOCK_COURSE_FOLDER = {
    "id": "course-xyz",
    "owner_id": "user-maint-002",
    "name": "RF 101",
    "parent_folder_id": None,
    "is_course": True,
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00",
}

MOCK_PROJECT = {
    "id": "proj-abc",
    "user_id": "user-normal-001",
    "name": "Test Project",
    "description": "A test",
    "folder_id": "folder-abc",
    "design_state": {"elements": []},
    "simulation_config": {},
    "simulation_results": {},
    "ui_state": {},
    "documentation": {"has_content": True, "content_preview": "Hello"},
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00",
}

MOCK_COURSE_PROJECT = {
    "id": "proj-course-1",
    "user_id": "user-maint-002",
    "name": "Course Project 1",
    "description": "A course project",
    "folder_id": "course-xyz",
    "design_state": {"elements": [{"type": "dipole"}]},
    "simulation_config": {"method": "peec"},
    "simulation_results": {},
    "ui_state": {},
    "documentation": {"has_content": True, "content_preview": "Course doc"},
    "created_at": "2026-01-01T00:00:00+00:00",
    "updated_at": "2026-01-01T00:00:00+00:00",
}


# ══════════════════════════════════════════════════════════════════════════════
#  FOLDER REPOSITORY UNIT TESTS
# ══════════════════════════════════════════════════════════════════════════════


class TestFolderRepositoryToDict:
    """Test FolderRepository._to_dict static method."""

    def test_to_dict_full_item(self):
        item = {
            "FolderId": "f-1",
            "OwnerId": "u-1",
            "Name": "Test",
            "ParentFolderId": "f-0",
            "IsCourse": False,
            "CreatedAt": "2026-01-01T00:00:00+00:00",
            "UpdatedAt": "2026-01-01T00:00:00+00:00",
        }
        result = FolderRepository._to_dict(item)
        assert result["id"] == "f-1"
        assert result["owner_id"] == "u-1"
        assert result["name"] == "Test"
        assert result["parent_folder_id"] == "f-0"
        assert result["is_course"] is False

    def test_to_dict_empty_parent(self):
        """Empty ParentFolderId should map to None."""
        item = {
            "FolderId": "f-1",
            "OwnerId": "u-1",
            "Name": "Root",
            "ParentFolderId": "",
            "IsCourse": False,
            "CreatedAt": "t",
            "UpdatedAt": "t",
        }
        result = FolderRepository._to_dict(item)
        assert result["parent_folder_id"] is None

    def test_to_dict_course_folder(self):
        item = {
            "FolderId": "c-1",
            "OwnerId": "u-1",
            "Name": "RF 101",
            "ParentFolderId": "",
            "IsCourse": True,
            "CreatedAt": "t",
            "UpdatedAt": "t",
        }
        result = FolderRepository._to_dict(item)
        assert result["is_course"] is True


class TestFolderRepositoryCRUD:
    """Test FolderRepository CRUD operations with mocked DynamoDB."""

    @pytest.fixture
    def mock_table(self):
        return MagicMock()

    @pytest.fixture
    def repo(self, mock_table):
        repo = FolderRepository(table_name="test-table")
        repo._table = mock_table
        return repo

    @pytest.mark.asyncio
    async def test_create_folder_user(self, repo, mock_table):
        folder = await repo.create_folder(owner_id="u-1", name="My Folder")
        assert folder["name"] == "My Folder"
        assert folder["owner_id"] == "u-1"
        assert folder["is_course"] is False
        assert folder["parent_folder_id"] is None

        # Verify DynamoDB put_item was called with USER# PK
        call_args = mock_table.put_item.call_args
        item = call_args[1]["Item"] if "Item" in call_args[1] else call_args[0][0]
        assert item["PK"] == "USER#u-1"
        assert item["IsCourse"] is False

    @pytest.mark.asyncio
    async def test_create_folder_course(self, repo, mock_table):
        folder = await repo.create_folder(owner_id="u-1", name="RF 101", is_course=True)
        assert folder["is_course"] is True

        call_args = mock_table.put_item.call_args
        item = call_args[1]["Item"] if "Item" in call_args[1] else call_args[0][0]
        assert item["PK"] == COURSES_PK

    @pytest.mark.asyncio
    async def test_create_subfolder(self, repo, mock_table):
        folder = await repo.create_folder(owner_id="u-1", name="Sub", parent_folder_id="parent-123")
        assert folder["parent_folder_id"] == "parent-123"

    @pytest.mark.asyncio
    async def test_get_folder_found(self, repo, mock_table):
        mock_table.query.return_value = {
            "Items": [
                {
                    "FolderId": "f-1",
                    "OwnerId": "u-1",
                    "Name": "Test",
                    "ParentFolderId": "",
                    "IsCourse": False,
                    "CreatedAt": "t",
                    "UpdatedAt": "t",
                }
            ]
        }
        result = await repo.get_folder("f-1")
        assert result is not None
        assert result["id"] == "f-1"

    @pytest.mark.asyncio
    async def test_get_folder_not_found(self, repo, mock_table):
        mock_table.query.return_value = {"Items": []}
        result = await repo.get_folder("nonexistent")
        assert result is None

    @pytest.mark.asyncio
    async def test_list_user_folders(self, repo, mock_table):
        mock_table.query.return_value = {
            "Items": [
                {
                    "FolderId": "f-1",
                    "OwnerId": "u-1",
                    "Name": "Folder A",
                    "ParentFolderId": "",
                    "IsCourse": False,
                    "CreatedAt": "t",
                    "UpdatedAt": "t",
                },
                {
                    "FolderId": "f-2",
                    "OwnerId": "u-1",
                    "Name": "Folder B",
                    "ParentFolderId": "f-1",
                    "IsCourse": False,
                    "CreatedAt": "t",
                    "UpdatedAt": "t",
                },
            ]
        }
        all_folders = await repo.list_user_folders("u-1")
        assert len(all_folders) == 2

        # Filter by specific parent — only Folder B has parent "f-1"
        child_folders = await repo.list_user_folders("u-1", parent_folder_id="f-1")
        assert len(child_folders) == 1
        assert child_folders[0]["name"] == "Folder B"

    @pytest.mark.asyncio
    async def test_list_course_folders(self, repo, mock_table):
        mock_table.query.return_value = {
            "Items": [
                {
                    "FolderId": "c-1",
                    "OwnerId": "u-1",
                    "Name": "RF 101",
                    "ParentFolderId": "",
                    "IsCourse": True,
                    "CreatedAt": "t",
                    "UpdatedAt": "t",
                }
            ]
        }
        courses = await repo.list_course_folders()
        assert len(courses) == 1
        assert courses[0]["is_course"] is True

    @pytest.mark.asyncio
    async def test_delete_folder(self, repo, mock_table):
        mock_table.query.return_value = {
            "Items": [
                {
                    "FolderId": "f-1",
                    "OwnerId": "u-1",
                    "Name": "Test",
                    "ParentFolderId": "",
                    "IsCourse": False,
                    "CreatedAt": "t",
                    "UpdatedAt": "t",
                }
            ]
        }
        result = await repo.delete_folder("f-1")
        assert result is True
        mock_table.delete_item.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_folder_not_found(self, repo, mock_table):
        mock_table.query.return_value = {"Items": []}
        result = await repo.delete_folder("nonexistent")
        assert result is False


class TestFolderRepositoryOwnership:
    """Test course ownership management."""

    @pytest.fixture
    def mock_table(self):
        return MagicMock()

    @pytest.fixture
    def repo(self, mock_table):
        repo = FolderRepository(table_name="test-table")
        repo._table = mock_table
        return repo

    @pytest.mark.asyncio
    async def test_reassign_course_owner(self, repo, mock_table):
        course_item = {
            "FolderId": "c-1",
            "OwnerId": "old-owner",
            "Name": "RF 101",
            "ParentFolderId": "",
            "IsCourse": True,
            "CreatedAt": "t",
            "UpdatedAt": "t",
        }
        mock_table.query.return_value = {"Items": [course_item]}
        mock_table.update_item.return_value = {
            "Attributes": {**course_item, "OwnerId": "new-owner"}
        }

        result = await repo.reassign_course_owner("c-1", "new-owner")
        assert result["owner_id"] == "new-owner"

    @pytest.mark.asyncio
    async def test_reassign_non_course_raises(self, repo, mock_table):
        non_course_item = {
            "FolderId": "f-1",
            "OwnerId": "u-1",
            "Name": "My Folder",
            "ParentFolderId": "",
            "IsCourse": False,
            "CreatedAt": "t",
            "UpdatedAt": "t",
        }
        mock_table.query.return_value = {"Items": [non_course_item]}

        with pytest.raises(ValueError, match="not a course"):
            await repo.reassign_course_owner("f-1", "new-owner")


# ══════════════════════════════════════════════════════════════════════════════
#  API ENDPOINT TESTS
# ══════════════════════════════════════════════════════════════════════════════


def _setup_mocks(
    user: UserIdentity,
    folder_repo: MagicMock = None,
    project_repo: MagicMock = None,
    doc_svc: MagicMock = None,
):
    """Override FastAPI dependencies with mocks."""
    from backend.common.auth.dependencies import get_current_user
    from backend.projects.documentation_service import get_documentation_service
    from backend.projects.folder_routes import get_folder_repository, get_repo
    from backend.projects.main import _get_doc_service, get_repository

    if folder_repo is None:
        folder_repo = MagicMock(spec=FolderRepository)
    if project_repo is None:
        project_repo = MagicMock()
    if doc_svc is None:
        doc_svc = MagicMock()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_folder_repository] = lambda: folder_repo
    app.dependency_overrides[get_repo] = lambda: project_repo
    app.dependency_overrides[get_repository] = lambda: project_repo
    app.dependency_overrides[_get_doc_service] = lambda: doc_svc
    app.dependency_overrides[get_documentation_service] = lambda: doc_svc

    return {"folder_repo": folder_repo, "repo": project_repo, "doc_svc": doc_svc}


def _cleanup():
    app.dependency_overrides.clear()


# ── User Folder Endpoints ────────────────────────────────────────────────────


class TestUserFolderEndpoints:
    """Test /api/folders/* endpoints for normal users."""

    @pytest.fixture(autouse=True)
    def setup(self):
        yield
        _cleanup()

    def test_create_folder(self):
        mocks = _setup_mocks(NORMAL_USER)
        mocks["folder_repo"].create_folder = AsyncMock(return_value=MOCK_FOLDER)

        client = TestClient(app)
        resp = client.post("/api/folders", json={"name": "My Folder"})
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "My Folder"
        assert data["is_course"] is False

    def test_create_subfolder(self):
        mocks = _setup_mocks(NORMAL_USER)
        parent = {**MOCK_FOLDER, "id": "parent-1"}
        mocks["folder_repo"].get_folder = AsyncMock(return_value=parent)
        mocks["folder_repo"].create_folder = AsyncMock(
            return_value={**MOCK_FOLDER, "parent_folder_id": "parent-1"}
        )

        client = TestClient(app)
        resp = client.post(
            "/api/folders",
            json={"name": "Sub", "parent_folder_id": "parent-1"},
        )
        assert resp.status_code == 201

    def test_create_subfolder_invalid_parent(self):
        mocks = _setup_mocks(NORMAL_USER)
        mocks["folder_repo"].get_folder = AsyncMock(return_value=None)

        client = TestClient(app)
        resp = client.post(
            "/api/folders",
            json={"name": "Sub", "parent_folder_id": "nonexistent"},
        )
        assert resp.status_code == 404

    def test_list_folders(self):
        mocks = _setup_mocks(NORMAL_USER)
        mocks["folder_repo"].list_user_folders = AsyncMock(return_value=[MOCK_FOLDER])

        client = TestClient(app)
        resp = client.get("/api/folders")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_get_folder(self):
        mocks = _setup_mocks(NORMAL_USER)
        mocks["folder_repo"].get_folder = AsyncMock(return_value=MOCK_FOLDER)

        client = TestClient(app)
        resp = client.get(f"/api/folders/{MOCK_FOLDER['id']}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "My Folder"

    def test_get_folder_not_found(self):
        mocks = _setup_mocks(NORMAL_USER)
        mocks["folder_repo"].get_folder = AsyncMock(return_value=None)

        client = TestClient(app)
        resp = client.get("/api/folders/nonexistent")
        assert resp.status_code == 404

    def test_get_folder_wrong_owner(self):
        mocks = _setup_mocks(NORMAL_USER)
        other_folder = {**MOCK_FOLDER, "owner_id": "other-user"}
        mocks["folder_repo"].get_folder = AsyncMock(return_value=other_folder)

        client = TestClient(app)
        resp = client.get(f"/api/folders/{MOCK_FOLDER['id']}")
        assert resp.status_code == 404

    def test_update_folder(self):
        mocks = _setup_mocks(NORMAL_USER)
        updated = {**MOCK_FOLDER, "name": "Renamed"}
        mocks["folder_repo"].get_folder = AsyncMock(return_value=MOCK_FOLDER)
        mocks["folder_repo"].update_folder = AsyncMock(return_value=updated)

        client = TestClient(app)
        resp = client.put(
            f"/api/folders/{MOCK_FOLDER['id']}",
            json={"name": "Renamed"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Renamed"

    def test_delete_folder(self):
        mocks = _setup_mocks(NORMAL_USER)
        mocks["folder_repo"].get_folder = AsyncMock(return_value=MOCK_FOLDER)
        mocks["folder_repo"].delete_folder = AsyncMock(return_value=True)
        mocks["folder_repo"].list_subfolders = AsyncMock(return_value=[])
        mocks["repo"].list_projects_in_folder = AsyncMock(return_value=[])

        client = TestClient(app)
        resp = client.delete(f"/api/folders/{MOCK_FOLDER['id']}")
        assert resp.status_code == 204

    def test_delete_folder_moves_projects_to_root(self):
        mocks = _setup_mocks(NORMAL_USER)
        mocks["folder_repo"].get_folder = AsyncMock(return_value=MOCK_FOLDER)
        mocks["folder_repo"].delete_folder = AsyncMock(return_value=True)
        mocks["folder_repo"].list_subfolders = AsyncMock(return_value=[])
        mocks["repo"].list_projects_in_folder = AsyncMock(return_value=[MOCK_PROJECT])
        mocks["repo"].update_project = AsyncMock(return_value=MOCK_PROJECT)

        client = TestClient(app)
        resp = client.delete(f"/api/folders/{MOCK_FOLDER['id']}")
        assert resp.status_code == 204
        # Projects should be moved to root (folder_id="")
        mocks["repo"].update_project.assert_called_once_with(MOCK_PROJECT["id"], folder_id="")

    def test_list_folder_contents(self):
        mocks = _setup_mocks(NORMAL_USER)
        mocks["folder_repo"].get_folder = AsyncMock(return_value=MOCK_FOLDER)
        mocks["repo"].list_projects_in_folder = AsyncMock(return_value=[MOCK_PROJECT])

        client = TestClient(app)
        resp = client.get(f"/api/folders/{MOCK_FOLDER['id']}/contents")
        assert resp.status_code == 200
        assert len(resp.json()) == 1


# ── Course Endpoints ─────────────────────────────────────────────────────────


class TestCourseEndpoints:
    """Test /api/courses/* endpoints."""

    @pytest.fixture(autouse=True)
    def setup(self):
        yield
        _cleanup()

    def test_create_course_as_maintainer(self):
        mocks = _setup_mocks(MAINTAINER_USER)
        mocks["folder_repo"].create_folder = AsyncMock(return_value=MOCK_COURSE_FOLDER)

        client = TestClient(app)
        resp = client.post("/api/courses", json={"name": "RF 101"})
        assert resp.status_code == 201
        assert resp.json()["is_course"] is True

    def test_create_course_as_admin(self):
        mocks = _setup_mocks(ADMIN_USER)
        mocks["folder_repo"].create_folder = AsyncMock(return_value=MOCK_COURSE_FOLDER)

        client = TestClient(app)
        resp = client.post("/api/courses", json={"name": "RF 101"})
        assert resp.status_code == 201

    def test_create_course_as_normal_user_forbidden(self):
        mocks = _setup_mocks(NORMAL_USER)

        client = TestClient(app)
        resp = client.post("/api/courses", json={"name": "RF 101"})
        assert resp.status_code == 403

    def test_list_courses(self):
        mocks = _setup_mocks(NORMAL_USER)
        mocks["folder_repo"].list_course_folders = AsyncMock(return_value=[MOCK_COURSE_FOLDER])

        client = TestClient(app)
        resp = client.get("/api/courses")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_get_course(self):
        mocks = _setup_mocks(NORMAL_USER)
        mocks["folder_repo"].get_folder = AsyncMock(return_value=MOCK_COURSE_FOLDER)

        client = TestClient(app)
        resp = client.get(f"/api/courses/{MOCK_COURSE_FOLDER['id']}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "RF 101"

    def test_get_non_course_returns_404(self):
        mocks = _setup_mocks(NORMAL_USER)
        mocks["folder_repo"].get_folder = AsyncMock(return_value=MOCK_FOLDER)

        client = TestClient(app)
        resp = client.get(f"/api/courses/{MOCK_FOLDER['id']}")
        assert resp.status_code == 404

    def test_update_course_as_maintainer(self):
        mocks = _setup_mocks(MAINTAINER_USER)
        updated = {**MOCK_COURSE_FOLDER, "name": "RF 201"}
        mocks["folder_repo"].get_folder = AsyncMock(return_value=MOCK_COURSE_FOLDER)
        mocks["folder_repo"].update_folder = AsyncMock(return_value=updated)

        client = TestClient(app)
        resp = client.put(
            f"/api/courses/{MOCK_COURSE_FOLDER['id']}",
            json={"name": "RF 201"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "RF 201"

    def test_update_course_as_normal_user_forbidden(self):
        mocks = _setup_mocks(NORMAL_USER)

        client = TestClient(app)
        resp = client.put(
            f"/api/courses/{MOCK_COURSE_FOLDER['id']}",
            json={"name": "Hack"},
        )
        assert resp.status_code == 403

    def test_delete_course_as_maintainer(self):
        mocks = _setup_mocks(MAINTAINER_USER)
        mocks["folder_repo"].get_folder = AsyncMock(return_value=MOCK_COURSE_FOLDER)
        mocks["folder_repo"].delete_folder = AsyncMock(return_value=True)
        mocks["folder_repo"].list_subfolders = AsyncMock(return_value=[])

        client = TestClient(app)
        resp = client.delete(f"/api/courses/{MOCK_COURSE_FOLDER['id']}")
        assert resp.status_code == 204

    def test_delete_course_as_normal_user_forbidden(self):
        mocks = _setup_mocks(NORMAL_USER)

        client = TestClient(app)
        resp = client.delete(f"/api/courses/{MOCK_COURSE_FOLDER['id']}")
        assert resp.status_code == 403

    def test_list_course_projects(self):
        mocks = _setup_mocks(NORMAL_USER)
        mocks["folder_repo"].get_folder = AsyncMock(return_value=MOCK_COURSE_FOLDER)
        mocks["repo"].list_all_projects_in_folder = AsyncMock(return_value=[MOCK_COURSE_PROJECT])

        client = TestClient(app)
        resp = client.get(f"/api/courses/{MOCK_COURSE_FOLDER['id']}/projects")
        assert resp.status_code == 200
        assert len(resp.json()) == 1


# ── Deep Copy Endpoints ──────────────────────────────────────────────────────


class TestDeepCopyEndpoints:
    """Test deep copy of courses and projects."""

    @pytest.fixture(autouse=True)
    def setup(self):
        yield
        _cleanup()

    def test_copy_course_to_user(self):
        mocks = _setup_mocks(NORMAL_USER)

        new_folder = {
            **MOCK_FOLDER,
            "id": "new-folder-1",
            "name": "RF 101",
        }
        mocks["folder_repo"].get_folder = AsyncMock(return_value=MOCK_COURSE_FOLDER)
        mocks["folder_repo"].create_folder = AsyncMock(return_value=new_folder)
        mocks["folder_repo"].list_subfolders = AsyncMock(return_value=[])
        mocks["repo"].list_all_projects_in_folder = AsyncMock(return_value=[])

        client = TestClient(app)
        resp = client.post(
            f"/api/courses/{MOCK_COURSE_FOLDER['id']}/copy",
            json={},
        )
        assert resp.status_code == 201
        assert resp.json()["name"] == "RF 101"
        assert resp.json()["is_course"] is False

    def test_copy_course_with_projects(self):
        mocks = _setup_mocks(NORMAL_USER)

        new_folder = {
            **MOCK_FOLDER,
            "id": "new-folder-1",
            "name": "RF 101",
        }
        new_project = {
            **MOCK_PROJECT,
            "id": "new-proj-1",
            "user_id": NORMAL_USER.id,
        }
        mocks["folder_repo"].get_folder = AsyncMock(return_value=MOCK_COURSE_FOLDER)
        mocks["folder_repo"].create_folder = AsyncMock(return_value=new_folder)
        mocks["folder_repo"].list_subfolders = AsyncMock(return_value=[])
        mocks["repo"].list_all_projects_in_folder = AsyncMock(return_value=[MOCK_COURSE_PROJECT])
        mocks["repo"].create_project = AsyncMock(return_value=new_project)
        mocks["repo"].update_project = AsyncMock(return_value=new_project)
        mocks["repo"].get_project = AsyncMock(return_value=new_project)
        mocks["doc_svc"].load_content = AsyncMock(
            return_value={"content": "# Course Documentation"}
        )
        mocks["doc_svc"].save_content = AsyncMock()

        client = TestClient(app)
        resp = client.post(
            f"/api/courses/{MOCK_COURSE_FOLDER['id']}/copy",
            json={},
        )
        assert resp.status_code == 201

        # Verify project was created for the user
        mocks["repo"].create_project.assert_called_once()
        call_kwargs = mocks["repo"].create_project.call_args[1]
        assert call_kwargs["user_id"] == NORMAL_USER.id

        # Verify documentation was copied
        mocks["doc_svc"].save_content.assert_called_once()

    def test_copy_single_project(self):
        mocks = _setup_mocks(NORMAL_USER)

        new_project = {
            **MOCK_PROJECT,
            "id": "new-proj-1",
            "user_id": NORMAL_USER.id,
        }
        mocks["repo"].get_project = AsyncMock(side_effect=[MOCK_COURSE_PROJECT, new_project])
        mocks["repo"].create_project = AsyncMock(return_value=new_project)
        mocks["repo"].update_project = AsyncMock(return_value=new_project)
        mocks["doc_svc"].load_content = AsyncMock(return_value=None)

        client = TestClient(app)
        resp = client.post(
            f"/api/courses/projects/{MOCK_COURSE_PROJECT['id']}/copy",
            json={"target_folder_id": "my-folder"},
        )
        assert resp.status_code == 201

    def test_copy_nonexistent_course_returns_404(self):
        mocks = _setup_mocks(NORMAL_USER)
        mocks["folder_repo"].get_folder = AsyncMock(return_value=None)

        client = TestClient(app)
        resp = client.post("/api/courses/nonexistent/copy", json={})
        assert resp.status_code == 404


# ── Admin Endpoints ──────────────────────────────────────────────────────────


class TestAdminEndpoints:
    """Test /api/admin/* endpoints."""

    @pytest.fixture(autouse=True)
    def setup(self):
        yield
        _cleanup()

    @patch("backend.projects.folder_routes._get_user_repo")
    def test_update_user_role(self, mock_get_user_repo):
        mocks = _setup_mocks(ADMIN_USER)

        mock_user_repo = MagicMock()
        mock_user_repo.get_user_by_id.return_value = {
            "user_id": "target-user",
            "email": "target@example.com",
            "username": "target",
            "role": "maintainer",
            "is_admin": False,
            "is_locked": False,
            "created_at": "2026-01-01T00:00:00+00:00",
        }
        mock_get_user_repo.return_value = mock_user_repo

        client = TestClient(app)
        resp = client.put(
            "/api/admin/users/target-user/role",
            json={"role": "maintainer"},
        )
        assert resp.status_code == 200
        mock_user_repo.update_user_role.assert_called_once_with("target-user", "maintainer")

    @patch("backend.projects.folder_routes._get_user_repo")
    def test_update_role_as_normal_user_forbidden(self, mock_get_user_repo):
        mocks = _setup_mocks(NORMAL_USER)

        client = TestClient(app)
        resp = client.put(
            "/api/admin/users/target-user/role",
            json={"role": "admin"},
        )
        assert resp.status_code == 403

    @patch("backend.projects.folder_routes._get_user_repo")
    def test_update_role_as_maintainer_forbidden(self, mock_get_user_repo):
        mocks = _setup_mocks(MAINTAINER_USER)

        client = TestClient(app)
        resp = client.put(
            "/api/admin/users/target-user/role",
            json={"role": "admin"},
        )
        assert resp.status_code == 403

    @patch("backend.projects.folder_routes._get_user_repo")
    def test_admin_cannot_change_own_role(self, mock_get_user_repo):
        mocks = _setup_mocks(ADMIN_USER)

        mock_user_repo = MagicMock()
        mock_user_repo.get_user_by_id.return_value = {
            "user_id": ADMIN_USER.id,
            "email": "admin@example.com",
            "username": "admin",
            "role": "admin",
        }
        mock_get_user_repo.return_value = mock_user_repo

        client = TestClient(app)
        resp = client.put(
            f"/api/admin/users/{ADMIN_USER.id}/role",
            json={"role": "user"},
        )
        assert resp.status_code == 400
        assert "own role" in resp.json()["detail"].lower()

    @patch("backend.projects.folder_routes._get_user_repo")
    def test_update_role_invalid_role(self, mock_get_user_repo):
        mocks = _setup_mocks(ADMIN_USER)

        mock_user_repo = MagicMock()
        mock_user_repo.get_user_by_id.return_value = {
            "user_id": "target-user",
            "email": "target@example.com",
            "username": "target",
            "role": "user",
        }
        mock_user_repo.update_user_role.side_effect = ValueError("Invalid role 'superadmin'")
        mock_get_user_repo.return_value = mock_user_repo

        client = TestClient(app)
        resp = client.put(
            "/api/admin/users/target-user/role",
            json={"role": "superadmin"},
        )
        assert resp.status_code == 400

    @patch("backend.projects.folder_routes._get_user_repo")
    def test_list_users_as_admin(self, mock_get_user_repo):
        mocks = _setup_mocks(ADMIN_USER)

        mock_user_repo = MagicMock()
        mock_user_repo.table.scan.return_value = {
            "Items": [
                {
                    "UserId": "u-1",
                    "Email": "a@b.com",
                    "Username": "alice",
                    "IsAdmin": False,
                    "IsLocked": False,
                    "Role": "user",
                    "CreatedAt": "2026-01-01",
                },
            ]
        }
        mock_user_repo._to_dict = UserRepository_to_dict
        mock_get_user_repo.return_value = mock_user_repo

        client = TestClient(app)
        resp = client.get("/api/admin/users")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    @patch("backend.projects.folder_routes._get_user_repo")
    def test_list_users_as_normal_user_forbidden(self, mock_get_user_repo):
        mocks = _setup_mocks(NORMAL_USER)

        client = TestClient(app)
        resp = client.get("/api/admin/users")
        assert resp.status_code == 403

    def test_assign_course_owner_as_admin(self):
        mocks = _setup_mocks(ADMIN_USER)
        updated_course = {**MOCK_COURSE_FOLDER, "owner_id": "new-owner"}
        mocks["folder_repo"].reassign_course_owner = AsyncMock(return_value=updated_course)

        with patch("backend.projects.folder_routes._get_user_repo") as mock_get:
            mock_user_repo = MagicMock()
            mock_user_repo.get_user_by_id.return_value = {
                "user_id": "new-owner",
                "email": "new@b.com",
                "username": "new",
                "role": "maintainer",
            }
            mock_get.return_value = mock_user_repo

            client = TestClient(app)
            resp = client.put(
                f"/api/admin/courses/{MOCK_COURSE_FOLDER['id']}/owner",
                json={"new_owner_id": "new-owner"},
            )
            assert resp.status_code == 200
            assert resp.json()["owner_id"] == "new-owner"

    def test_assign_course_owner_as_normal_user_forbidden(self):
        mocks = _setup_mocks(NORMAL_USER)

        client = TestClient(app)
        resp = client.put(
            f"/api/admin/courses/{MOCK_COURSE_FOLDER['id']}/owner",
            json={"new_owner_id": "new-owner"},
        )
        assert resp.status_code == 403


# ── Helper to emulate UserRepository._to_dict for list_users test ────────────


def UserRepository_to_dict(item):
    """Mimics the static _to_dict from UserRepository for test purposes."""
    return {
        "user_id": item["UserId"],
        "email": item["Email"],
        "username": item.get("Username", ""),
        "role": item.get("Role", "admin" if item.get("IsAdmin") else "user"),
        "is_locked": item.get("IsLocked", False),
        "created_at": item.get("CreatedAt"),
    }
