"""Unit tests for the project_type query filter on list_projects endpoint."""

import pytest
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from backend.common.auth import UserIdentity, get_current_user
from backend.common.repositories.base import ProjectRepository
from backend.projects.main import app, get_repository


# Fake user for auth override
_fake_user = UserIdentity(id="user-1", email="test@example.com", username="testuser")


def _override_current_user():
    return _fake_user


@pytest.fixture(autouse=True)
def override_auth():
    app.dependency_overrides[get_current_user] = _override_current_user
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def mock_repo():
    repo = AsyncMock(spec=ProjectRepository)
    app.dependency_overrides[get_repository] = lambda: repo
    yield repo
    app.dependency_overrides.pop(get_repository, None)


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def sample_projects():
    """Sample project dicts as returned by the repository."""
    return [
        {
            "id": "proj-1",
            "user_id": "user-1",
            "name": "PEEC Dipole",
            "project_type": "peec",
            "description": "",
            "created_at": "2025-01-01T00:00:00",
            "updated_at": "2025-01-01T00:00:00",
            "documentation": {},
        },
        {
            "id": "proj-2",
            "user_id": "user-1",
            "name": "FDTD Waveguide",
            "project_type": "fdtd",
            "description": "",
            "created_at": "2025-01-02T00:00:00",
            "updated_at": "2025-01-02T00:00:00",
            "documentation": {},
        },
        {
            "id": "proj-3",
            "user_id": "user-1",
            "name": "PEEC Loop",
            "project_type": "peec",
            "description": "",
            "created_at": "2025-01-03T00:00:00",
            "updated_at": "2025-01-03T00:00:00",
            "documentation": {},
        },
    ]


class TestProjectTypeFilter:
    """Tests for the ?project_type= query parameter on GET /api/projects."""

    def test_no_filter_returns_all(self, client, mock_repo, sample_projects):
        mock_repo.list_projects.return_value = sample_projects
        response = client.get("/api/projects")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3

    def test_filter_peec(self, client, mock_repo, sample_projects):
        mock_repo.list_projects.return_value = sample_projects
        response = client.get("/api/projects?project_type=peec")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert all(p["project_type"] == "peec" for p in data)

    def test_filter_fdtd(self, client, mock_repo, sample_projects):
        mock_repo.list_projects.return_value = sample_projects
        response = client.get("/api/projects?project_type=fdtd")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["name"] == "FDTD Waveguide"

    def test_invalid_filter_rejected(self, client, mock_repo, sample_projects):
        mock_repo.list_projects.return_value = sample_projects
        response = client.get("/api/projects?project_type=fem")
        assert response.status_code == 422  # Validation error
