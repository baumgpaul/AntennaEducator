"""Tests for Phase 7: Course Enrollment.

Covers:
- EnrollmentRepository: enroll, unenroll, list by course, list by user
- Admin enrollment endpoint: POST /api/admin/courses/{id}/enroll
- Admin unenroll endpoint: DELETE /api/admin/courses/{id}/enroll/{user_id}
- Admin list enrollments: GET /api/admin/courses/{id}/enrollments
- User list enrolled courses: GET /api/my-courses
"""

from unittest.mock import AsyncMock, MagicMock, patch

# ── EnrollmentRepository ─────────────────────────────────────────────────────


class TestEnrollmentRepository:
    """Tests for enrollment DynamoDB operations."""

    def _make_repo(self):
        with patch(
            "backend.common.repositories.enrollment_repository." "EnrollmentRepository.__init__",
            lambda self: None,
        ):
            from backend.common.repositories.enrollment_repository import (
                EnrollmentRepository,
            )

            repo = EnrollmentRepository()
            repo.table = MagicMock()
            repo.table_name = "test-table"
            return repo

    def test_enroll_user_writes_two_items(self):
        """Enrolling a user writes both the course→user and user→course items."""
        repo = self._make_repo()
        repo.enroll_user(
            course_id="course-1",
            user_id="user-1",
            enrolled_by="admin-1",
        )
        # batch_writer should have been used for 2 items
        writer = repo.table.batch_writer.return_value.__enter__.return_value
        assert writer.put_item.call_count == 2

        # Check both items
        items = [call[1]["Item"] for call in writer.put_item.call_args_list]
        pks = {item["PK"] for item in items}
        assert "COURSE#course-1" in pks
        assert "USER#user-1" in pks

    def test_enroll_user_sets_entity_type(self):
        repo = self._make_repo()
        repo.enroll_user(
            course_id="course-1",
            user_id="user-1",
            enrolled_by="admin-1",
        )
        writer = repo.table.batch_writer.return_value.__enter__.return_value
        items = [call[1]["Item"] for call in writer.put_item.call_args_list]
        for item in items:
            assert item["EntityType"] == "ENROLLMENT"

    def test_unenroll_user_deletes_two_items(self):
        repo = self._make_repo()
        repo.unenroll_user(course_id="course-1", user_id="user-1")
        writer = repo.table.batch_writer.return_value.__enter__.return_value
        assert writer.delete_item.call_count == 2

    def test_list_course_enrollments(self):
        repo = self._make_repo()
        repo.table.query.return_value = {
            "Items": [
                {
                    "PK": "COURSE#course-1",
                    "SK": "ENROLLMENT#user-1",
                    "UserId": "user-1",
                    "CourseId": "course-1",
                    "EnrolledAt": "2025-06-15T12:00:00+00:00",
                    "EnrolledBy": "admin-1",
                    "EntityType": "ENROLLMENT",
                },
            ],
        }
        result = repo.list_course_enrollments("course-1")
        assert len(result) == 1
        assert result[0]["user_id"] == "user-1"
        assert result[0]["enrolled_by"] == "admin-1"

    def test_list_user_enrollments(self):
        repo = self._make_repo()
        repo.table.query.return_value = {
            "Items": [
                {
                    "PK": "USER#user-1",
                    "SK": "ENROLLMENT#course-1",
                    "UserId": "user-1",
                    "CourseId": "course-1",
                    "EnrolledAt": "2025-06-15T12:00:00+00:00",
                    "EnrolledBy": "admin-1",
                    "EntityType": "ENROLLMENT",
                },
            ],
        }
        result = repo.list_user_enrollments("user-1")
        assert len(result) == 1
        assert result[0]["course_id"] == "course-1"

    def test_is_enrolled_true(self):
        repo = self._make_repo()
        repo.table.get_item.return_value = {
            "Item": {
                "PK": "COURSE#course-1",
                "SK": "ENROLLMENT#user-1",
                "EntityType": "ENROLLMENT",
            }
        }
        assert repo.is_enrolled("course-1", "user-1") is True

    def test_is_enrolled_false(self):
        repo = self._make_repo()
        repo.table.get_item.return_value = {}
        assert repo.is_enrolled("course-1", "user-1") is False


# ── Admin enrollment endpoints ───────────────────────────────────────────────


class TestAdminEnrollmentEndpoints:
    """Tests for admin course enrollment management."""

    def _get_admin_client(self, mock_folder_repo=None, mock_enrollment_repo=None):
        from fastapi.testclient import TestClient

        from backend.common.auth.dependencies import get_current_user
        from backend.common.auth.identity import UserIdentity, UserRole
        from backend.projects.folder_routes import get_folder_repository
        from backend.projects.main import app

        def _mock_admin():
            return UserIdentity(
                id="admin-1",
                email="admin@t.com",
                username="admin",
                role=UserRole.ADMIN,
                simulation_tokens=9999,
            )

        app.dependency_overrides[get_current_user] = _mock_admin
        if mock_folder_repo is not None:
            app.dependency_overrides[get_folder_repository] = lambda: mock_folder_repo
        return TestClient(app)

    def _get_user_client(self):
        from fastapi.testclient import TestClient

        from backend.common.auth.dependencies import get_current_user
        from backend.common.auth.identity import UserIdentity, UserRole
        from backend.projects.main import app

        def _mock_user():
            return UserIdentity(
                id="user-1",
                email="t@t.com",
                username="tester",
                role=UserRole.USER,
                simulation_tokens=100,
            )

        app.dependency_overrides[get_current_user] = _mock_user
        return TestClient(app)

    def test_enroll_user_returns_201(self):
        mock_folder_repo = AsyncMock()
        mock_folder_repo.get_folder.return_value = {
            "id": "course-1",
            "is_course": True,
            "owner_id": "admin-1",
        }
        mock_enrollment_repo = MagicMock()
        mock_enrollment_repo.is_enrolled.return_value = False

        with patch(
            "backend.projects.folder_routes._get_enrollment_repo",
            return_value=mock_enrollment_repo,
        ):
            client = self._get_admin_client(mock_folder_repo=mock_folder_repo)
            resp = client.post(
                "/api/admin/courses/course-1/enroll",
                json={"user_id": "user-1"},
            )
            assert resp.status_code == 201
            mock_enrollment_repo.enroll_user.assert_called_once()

        from backend.projects.main import app

        app.dependency_overrides.clear()

    def test_enroll_already_enrolled_returns_409(self):
        mock_folder_repo = AsyncMock()
        mock_folder_repo.get_folder.return_value = {
            "id": "course-1",
            "is_course": True,
            "owner_id": "admin-1",
        }
        mock_enrollment_repo = MagicMock()
        mock_enrollment_repo.is_enrolled.return_value = True

        with patch(
            "backend.projects.folder_routes._get_enrollment_repo",
            return_value=mock_enrollment_repo,
        ):
            client = self._get_admin_client(mock_folder_repo=mock_folder_repo)
            resp = client.post(
                "/api/admin/courses/course-1/enroll",
                json={"user_id": "user-1"},
            )
            assert resp.status_code == 409

        from backend.projects.main import app

        app.dependency_overrides.clear()

    def test_enroll_non_admin_returns_403(self):
        client = self._get_user_client()
        resp = client.post(
            "/api/admin/courses/course-1/enroll",
            json={"user_id": "user-2"},
        )
        assert resp.status_code == 403

        from backend.projects.main import app

        app.dependency_overrides.clear()

    def test_unenroll_user_returns_204(self):
        mock_folder_repo = AsyncMock()
        mock_folder_repo.get_folder.return_value = {
            "id": "course-1",
            "is_course": True,
            "owner_id": "admin-1",
        }
        mock_enrollment_repo = MagicMock()

        with patch(
            "backend.projects.folder_routes._get_enrollment_repo",
            return_value=mock_enrollment_repo,
        ):
            client = self._get_admin_client(mock_folder_repo=mock_folder_repo)
            resp = client.delete("/api/admin/courses/course-1/enroll/user-1")
            assert resp.status_code == 204
            mock_enrollment_repo.unenroll_user.assert_called_once()

        from backend.projects.main import app

        app.dependency_overrides.clear()

    def test_list_enrollments_returns_200(self):
        mock_folder_repo = AsyncMock()
        mock_folder_repo.get_folder.return_value = {
            "id": "course-1",
            "is_course": True,
            "owner_id": "admin-1",
        }
        mock_enrollment_repo = MagicMock()
        mock_enrollment_repo.list_course_enrollments.return_value = [
            {
                "user_id": "user-1",
                "course_id": "course-1",
                "enrolled_at": "2025-06-15T12:00:00+00:00",
                "enrolled_by": "admin-1",
            },
        ]

        with patch(
            "backend.projects.folder_routes._get_enrollment_repo",
            return_value=mock_enrollment_repo,
        ):
            client = self._get_admin_client(mock_folder_repo=mock_folder_repo)
            resp = client.get("/api/admin/courses/course-1/enrollments")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 1
            assert data[0]["user_id"] == "user-1"

        from backend.projects.main import app

        app.dependency_overrides.clear()


# ── User "My Courses" endpoint ───────────────────────────────────────────────


class TestMyCoursesEndpoint:
    """Tests for GET /api/my-courses."""

    def _get_user_client(self):
        from fastapi.testclient import TestClient

        from backend.common.auth.dependencies import get_current_user
        from backend.common.auth.identity import UserIdentity, UserRole
        from backend.projects.main import app

        def _mock_user():
            return UserIdentity(
                id="user-1",
                email="t@t.com",
                username="tester",
                role=UserRole.USER,
                simulation_tokens=100,
            )

        app.dependency_overrides[get_current_user] = _mock_user
        return TestClient(app)

    def test_my_courses_returns_200(self):
        with patch("backend.projects.folder_routes._get_enrollment_repo") as mock_get_repo:
            mock_repo = MagicMock()
            mock_repo.list_user_enrollments.return_value = [
                {
                    "user_id": "user-1",
                    "course_id": "course-1",
                    "enrolled_at": "2025-06-15T12:00:00+00:00",
                    "enrolled_by": "admin-1",
                },
            ]
            mock_get_repo.return_value = mock_repo

            client = self._get_user_client()
            resp = client.get("/api/my-courses")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data) == 1
            assert data[0]["course_id"] == "course-1"

        from backend.projects.main import app

        app.dependency_overrides.clear()

    def test_my_courses_empty(self):
        with patch("backend.projects.folder_routes._get_enrollment_repo") as mock_get_repo:
            mock_repo = MagicMock()
            mock_repo.list_user_enrollments.return_value = []
            mock_get_repo.return_value = mock_repo

            client = self._get_user_client()
            resp = client.get("/api/my-courses")
            assert resp.status_code == 200
            assert resp.json() == []

        from backend.projects.main import app

        app.dependency_overrides.clear()

    def test_my_courses_requires_auth(self):
        from fastapi.testclient import TestClient

        from backend.projects.main import app

        app.dependency_overrides.clear()
        client = TestClient(app)
        resp = client.get("/api/my-courses")
        assert resp.status_code == 401
