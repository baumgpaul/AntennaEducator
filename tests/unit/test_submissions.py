"""Tests for Phase 6: Course Submissions.

Covers:
- SubmissionRepository: create, list by course, list by user, review
- Submission endpoints: submit, list, detail, review
"""

from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import status
from fastapi.testclient import TestClient

# ══════════════════════════════════════════════════════════════════════════════
#  SubmissionRepository
# ══════════════════════════════════════════════════════════════════════════════


class TestSubmissionRepository:
    """Tests for submission DynamoDB operations."""

    def _make_repo(self):
        with patch(
            "backend.common.repositories.submission_repository." "SubmissionRepository.__init__",
            lambda self: None,
        ):
            from backend.common.repositories.submission_repository import (
                SubmissionRepository,
            )

            repo = SubmissionRepository()
            repo.table = MagicMock()
            repo.table_name = "test-table"
            return repo

    def test_create_submission_writes_two_items(self):
        """Creating a submission writes both forward and reverse items."""
        repo = self._make_repo()
        result = repo.create_submission(
            course_id="course-1",
            project_id="proj-1",
            user_id="user-1",
            project_name="My Dipole",
            frozen_design_state={"elements": []},
            frozen_simulation_config={"method": "peec"},
        )
        writer = repo.table.batch_writer.return_value.__enter__.return_value
        assert writer.put_item.call_count == 2

        items = [call[1]["Item"] for call in writer.put_item.call_args_list]
        pks = {item["PK"] for item in items}
        assert "COURSE#course-1" in pks
        assert "USER#user-1" in pks

        # Return value should be a dict with submission_id
        assert result["submission_id"]
        assert result["course_id"] == "course-1"
        assert result["project_name"] == "My Dipole"
        assert result["status"] == "submitted"

    def test_create_submission_entity_type(self):
        repo = self._make_repo()
        repo.create_submission(
            course_id="c1",
            project_id="p1",
            user_id="u1",
            project_name="Test",
        )
        writer = repo.table.batch_writer.return_value.__enter__.return_value
        items = [call[1]["Item"] for call in writer.put_item.call_args_list]
        for item in items:
            assert item["EntityType"] == "SUBMISSION"

    def test_create_submission_frozen_blobs(self):
        repo = self._make_repo()
        design = {"elements": [{"type": "dipole"}], "version": 2}
        config = {"method": "peec"}
        results = {"frequency_sweep": {"frequencies": [300e6]}}
        ui = {"view_configurations": []}

        repo.create_submission(
            course_id="c1",
            project_id="p1",
            user_id="u1",
            project_name="Test",
            frozen_design_state=design,
            frozen_simulation_config=config,
            frozen_simulation_results=results,
            frozen_ui_state=ui,
        )
        writer = repo.table.batch_writer.return_value.__enter__.return_value
        items = [call[1]["Item"] for call in writer.put_item.call_args_list]
        for item in items:
            assert item["FrozenDesignState"] == design
            assert item["FrozenSimulationConfig"] == config
            assert item["FrozenSimulationResults"] == results
            assert item["FrozenUiState"] == ui

    def test_get_submission(self):
        repo = self._make_repo()
        repo.table.get_item.return_value = {
            "Item": {
                "PK": "COURSE#c1",
                "SK": "SUBMISSION#s1",
                "SubmissionId": "s1",
                "CourseId": "c1",
                "ProjectId": "p1",
                "UserId": "u1",
                "ProjectName": "Dipole",
                "Status": "submitted",
                "Feedback": "",
                "FrozenDesignState": {},
                "FrozenSimulationConfig": {},
                "FrozenSimulationResults": {},
                "FrozenUiState": {},
                "SubmittedAt": "2025-01-01T00:00:00+00:00",
                "ReviewedAt": "",
                "ReviewedBy": "",
            }
        }
        result = repo.get_submission("c1", "s1")
        assert result is not None
        assert result["submission_id"] == "s1"
        assert result["project_name"] == "Dipole"

    def test_get_submission_not_found(self):
        repo = self._make_repo()
        repo.table.get_item.return_value = {}
        result = repo.get_submission("c1", "nonexistent")
        assert result is None

    def test_list_course_submissions(self):
        repo = self._make_repo()
        repo.table.query.return_value = {
            "Items": [
                {
                    "SubmissionId": "s1",
                    "CourseId": "c1",
                    "ProjectId": "p1",
                    "UserId": "u1",
                    "ProjectName": "Dipole",
                    "Status": "submitted",
                    "Feedback": "",
                    "FrozenDesignState": {},
                    "FrozenSimulationConfig": {},
                    "FrozenSimulationResults": {},
                    "FrozenUiState": {},
                    "SubmittedAt": "2025-01-01",
                    "ReviewedAt": "",
                    "ReviewedBy": "",
                },
                {
                    "SubmissionId": "s2",
                    "CourseId": "c1",
                    "ProjectId": "p2",
                    "UserId": "u2",
                    "ProjectName": "Loop",
                    "Status": "reviewed",
                    "Feedback": "Great work!",
                    "FrozenDesignState": {},
                    "FrozenSimulationConfig": {},
                    "FrozenSimulationResults": {},
                    "FrozenUiState": {},
                    "SubmittedAt": "2025-01-02",
                    "ReviewedAt": "2025-01-03",
                    "ReviewedBy": "admin-1",
                },
            ]
        }
        results = repo.list_course_submissions("c1")
        assert len(results) == 2
        assert results[0]["submission_id"] == "s1"
        assert results[1]["feedback"] == "Great work!"

    def test_list_user_submissions(self):
        repo = self._make_repo()
        repo.table.query.return_value = {
            "Items": [
                {
                    "SubmissionId": "s1",
                    "CourseId": "c1",
                    "ProjectId": "p1",
                    "UserId": "u1",
                    "ProjectName": "Dipole",
                    "Status": "submitted",
                    "Feedback": "",
                    "FrozenDesignState": {},
                    "FrozenSimulationConfig": {},
                    "FrozenSimulationResults": {},
                    "FrozenUiState": {},
                    "SubmittedAt": "2025-01-01",
                    "ReviewedAt": "",
                    "ReviewedBy": "",
                },
            ]
        }
        results = repo.list_user_submissions("u1")
        assert len(results) == 1
        assert results[0]["user_id"] == "u1"

    def test_update_review(self):
        repo = self._make_repo()
        repo.table.update_item.return_value = {
            "Attributes": {
                "SubmissionId": "s1",
                "CourseId": "c1",
                "ProjectId": "p1",
                "UserId": "u1",
                "ProjectName": "Dipole",
                "Status": "reviewed",
                "Feedback": "Well done!",
                "FrozenDesignState": {},
                "FrozenSimulationConfig": {},
                "FrozenSimulationResults": {},
                "FrozenUiState": {},
                "SubmittedAt": "2025-01-01",
                "ReviewedAt": "2025-01-05",
                "ReviewedBy": "admin-1",
            }
        }
        result = repo.update_review(
            submission_id="s1",
            course_id="c1",
            user_id="u1",
            feedback="Well done!",
            status="reviewed",
            reviewed_by="admin-1",
        )
        assert result is not None
        assert result["feedback"] == "Well done!"
        assert result["status"] == "reviewed"
        # Both forward and reverse items should be updated
        assert repo.table.update_item.call_count == 2


# ══════════════════════════════════════════════════════════════════════════════
#  Submission API Routes
# ══════════════════════════════════════════════════════════════════════════════


def _make_user(role="user", user_id="user-1"):
    """Create a mock UserIdentity."""
    from backend.common.auth.identity import UserIdentity, UserRole

    role_enum = UserRole(role)
    return UserIdentity(
        id=user_id,
        email=f"{user_id}@test.com",
        username=user_id,
        role=role_enum,
    )


_SENTINEL = object()


def _get_test_client(
    enrollment_enrolled=True,
    project_data=_SENTINEL,
    submissions_list=None,
    submission_detail=None,
    review_result=None,
    user=None,
):
    """Create a test client with mocked dependencies."""
    from fastapi import FastAPI

    import backend.projects.submission_routes as routes_mod
    from backend.projects.submission_routes import router

    app = FastAPI()
    app.include_router(router)

    # Mock auth
    from backend.common.auth.dependencies import get_current_user

    test_user = user or _make_user()
    app.dependency_overrides[get_current_user] = lambda: test_user

    # Mock enrollment
    mock_enrollment = MagicMock()
    mock_enrollment.is_enrolled.return_value = enrollment_enrolled

    # Mock project repo
    mock_project_repo = AsyncMock()
    if project_data is _SENTINEL:
        project_data = {
            "id": "proj-1",
            "user_id": "user-1",
            "name": "My Dipole",
            "design_state": {"elements": []},
            "simulation_config": {"method": "peec"},
            "simulation_results": {},
            "ui_state": {},
        }
    mock_project_repo.get_project.return_value = project_data

    # Mock submission repo
    mock_submission_repo = MagicMock()
    mock_submission_repo.create_submission.return_value = {
        "submission_id": "sub-1",
        "course_id": "course-1",
        "project_id": "proj-1",
        "user_id": "user-1",
        "project_name": "My Dipole",
        "status": "submitted",
        "feedback": "",
        "submitted_at": "2025-01-01T00:00:00+00:00",
        "reviewed_at": "",
        "reviewed_by": "",
    }
    mock_submission_repo.list_user_submissions.return_value = submissions_list or []
    mock_submission_repo.list_course_submissions.return_value = submissions_list or []
    mock_submission_repo.list_user_course_submissions.return_value = submissions_list or []
    mock_submission_repo.get_submission.return_value = submission_detail
    mock_submission_repo.update_review.return_value = review_result

    # Inject mocks via module-level singletons
    routes_mod._submission_repo = mock_submission_repo
    routes_mod._enrollment_repo = mock_enrollment

    # Patch the project repo factory
    patcher = patch.object(
        routes_mod,
        "_get_project_repo",
        return_value=mock_project_repo,
    )
    patcher.start()

    client = TestClient(app)
    return client, mock_submission_repo, mock_enrollment, patcher


class TestSubmitProjectEndpoint:
    """POST /api/courses/{course_id}/submissions"""

    def test_submit_success(self):
        client, mock_sub_repo, _, _p = _get_test_client()
        resp = client.post(
            "/api/courses/course-1/submissions",
            json={"project_id": "proj-1"},
        )
        assert resp.status_code == status.HTTP_201_CREATED
        data = resp.json()
        assert data["submission_id"] == "sub-1"
        assert data["status"] == "submitted"

    def test_submit_not_enrolled(self):
        client, _, _, _p = _get_test_client(enrollment_enrolled=False)
        resp = client.post(
            "/api/courses/course-1/submissions",
            json={"project_id": "proj-1"},
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_submit_project_not_found(self):
        client, _, _, _p = _get_test_client(project_data=None)
        resp = client.post(
            "/api/courses/course-1/submissions",
            json={"project_id": "nonexistent"},
        )
        # Mock returns None for project → 404
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_submit_other_users_project(self):
        """Cannot submit a project owned by another user."""
        project = {
            "id": "proj-2",
            "user_id": "other-user",
            "name": "Not Mine",
            "design_state": {},
            "simulation_config": {},
            "simulation_results": {},
            "ui_state": {},
        }
        client, _, _, _p = _get_test_client(project_data=project)
        resp = client.post(
            "/api/courses/course-1/submissions",
            json={"project_id": "proj-2"},
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN


class TestListMySubmissions:
    """GET /api/my-submissions"""

    def test_list_empty(self):
        client, _, _, _p = _get_test_client()
        resp = client.get("/api/my-submissions")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_with_submissions(self):
        subs = [
            {
                "submission_id": "s1",
                "course_id": "c1",
                "project_id": "p1",
                "user_id": "user-1",
                "project_name": "Dipole",
                "status": "submitted",
                "feedback": "",
                "submitted_at": "2025-01-01",
                "reviewed_at": "",
                "reviewed_by": "",
            },
        ]
        client, _, _, _p = _get_test_client(submissions_list=subs)
        resp = client.get("/api/my-submissions")
        assert resp.status_code == 200
        assert len(resp.json()) == 1


class TestListCourseSubmissions:
    """GET /api/courses/{course_id}/submissions"""

    def test_instructor_sees_all(self):
        subs = [
            {
                "submission_id": "s1",
                "course_id": "c1",
                "project_id": "p1",
                "user_id": "u1",
                "project_name": "Dipole",
                "status": "submitted",
                "feedback": "",
                "submitted_at": "2025-01-01",
                "reviewed_at": "",
                "reviewed_by": "",
            },
            {
                "submission_id": "s2",
                "course_id": "c1",
                "project_id": "p2",
                "user_id": "u2",
                "project_name": "Loop",
                "status": "submitted",
                "feedback": "",
                "submitted_at": "2025-01-02",
                "reviewed_at": "",
                "reviewed_by": "",
            },
        ]
        client, _, _, _p = _get_test_client(
            submissions_list=subs,
            user=_make_user(role="maintainer"),
        )
        resp = client.get("/api/courses/c1/submissions")
        assert resp.status_code == 200
        assert len(resp.json()) == 2

    def test_student_sees_own(self):
        subs = [
            {
                "submission_id": "s1",
                "course_id": "c1",
                "project_id": "p1",
                "user_id": "user-1",
                "project_name": "Dipole",
                "status": "submitted",
                "feedback": "",
                "submitted_at": "2025-01-01",
                "reviewed_at": "",
                "reviewed_by": "",
            },
        ]
        client, _, _, _p = _get_test_client(
            submissions_list=subs,
            user=_make_user(role="user"),
        )
        resp = client.get("/api/courses/c1/submissions")
        assert resp.status_code == 200


class TestReviewSubmission:
    """PATCH /api/courses/{course_id}/submissions/{submission_id}/review"""

    def test_review_success(self):
        detail = {
            "submission_id": "s1",
            "course_id": "c1",
            "project_id": "p1",
            "user_id": "u1",
            "project_name": "Dipole",
            "status": "submitted",
            "feedback": "",
            "submitted_at": "2025-01-01",
            "reviewed_at": "",
            "reviewed_by": "",
        }
        review_result = {
            **detail,
            "status": "reviewed",
            "feedback": "Good job!",
            "reviewed_at": "2025-01-05",
            "reviewed_by": "maintainer-1",
        }
        client, _, _, _p = _get_test_client(
            submission_detail=detail,
            review_result=review_result,
            user=_make_user(role="maintainer", user_id="maintainer-1"),
        )
        resp = client.patch(
            "/api/courses/c1/submissions/s1/review",
            json={"feedback": "Good job!", "status": "reviewed"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["feedback"] == "Good job!"
        assert data["status"] == "reviewed"

    def test_review_forbidden_for_student(self):
        client, _, _, _p = _get_test_client(
            user=_make_user(role="user"),
        )
        resp = client.patch(
            "/api/courses/c1/submissions/s1/review",
            json={"feedback": "test", "status": "reviewed"},
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_review_invalid_status(self):
        detail = {
            "submission_id": "s1",
            "course_id": "c1",
            "project_id": "p1",
            "user_id": "u1",
            "project_name": "Dipole",
            "status": "submitted",
            "feedback": "",
            "submitted_at": "2025-01-01",
            "reviewed_at": "",
            "reviewed_by": "",
        }
        client, _, _, _p = _get_test_client(
            submission_detail=detail,
            user=_make_user(role="maintainer"),
        )
        resp = client.patch(
            "/api/courses/c1/submissions/s1/review",
            json={"feedback": "test", "status": "invalid"},
        )
        assert resp.status_code == status.HTTP_400_BAD_REQUEST
