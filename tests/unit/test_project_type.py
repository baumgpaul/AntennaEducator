"""Unit tests for the project_type field added for FDTD support.

Verifies that project_type is accepted in schemas and defaults to 'peec'.
"""

import pytest
from pydantic import ValidationError

from backend.projects.schemas import (
    ProjectBase,
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectUpdate,
)


class TestProjectTypeField:
    """Tests for the project_type field across project schemas."""

    def test_default_project_type_is_peec(self):
        """ProjectBase should default project_type to 'peec'."""
        project = ProjectBase(name="Test Project")
        assert project.project_type == "peec"

    def test_explicit_peec_type(self):
        project = ProjectBase(name="PEEC Project", project_type="peec")
        assert project.project_type == "peec"

    def test_explicit_fdtd_type(self):
        project = ProjectBase(name="FDTD Project", project_type="fdtd")
        assert project.project_type == "fdtd"

    def test_invalid_project_type_rejected(self):
        with pytest.raises(ValidationError):
            ProjectBase(name="Bad Project", project_type="fem")

    def test_create_with_fdtd_type(self):
        create = ProjectCreate(name="My FDTD Sim", project_type="fdtd")
        assert create.project_type == "fdtd"
        assert create.name == "My FDTD Sim"

    def test_create_defaults_to_peec(self):
        create = ProjectCreate(name="My PEEC Sim")
        assert create.project_type == "peec"

    def test_update_with_project_type(self):
        update = ProjectUpdate(project_type="fdtd")
        assert update.project_type == "fdtd"

    def test_update_without_project_type(self):
        update = ProjectUpdate(name="Renamed")
        assert update.project_type is None

    def test_update_invalid_type_rejected(self):
        with pytest.raises(ValidationError):
            ProjectUpdate(project_type="invalid")

    def test_list_response_default_peec(self):
        resp = ProjectListResponse(
            id="proj-1",
            user_id="user-1",
            name="Test",
            created_at="2025-01-01T00:00:00",
            updated_at="2025-01-01T00:00:00",
        )
        assert resp.project_type == "peec"

    def test_list_response_fdtd(self):
        resp = ProjectListResponse(
            id="proj-2",
            user_id="user-1",
            name="FDTD Test",
            project_type="fdtd",
            created_at="2025-01-01T00:00:00",
            updated_at="2025-01-01T00:00:00",
        )
        assert resp.project_type == "fdtd"

    def test_response_inherits_project_type(self):
        resp = ProjectResponse(
            id="proj-3",
            user_id="user-1",
            name="Full FDTD",
            project_type="fdtd",
            created_at="2025-01-01T00:00:00",
            updated_at="2025-01-01T00:00:00",
        )
        assert resp.project_type == "fdtd"

    def test_response_defaults_to_peec(self):
        resp = ProjectResponse(
            id="proj-4",
            user_id="user-1",
            name="Full PEEC",
            created_at="2025-01-01T00:00:00",
            updated_at="2025-01-01T00:00:00",
        )
        assert resp.project_type == "peec"
