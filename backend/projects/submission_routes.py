"""Submission endpoints for the Projects service.

Students submit frozen project snapshots to courses.
Instructors view submissions and add text feedback.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status

from backend.common.auth import UserIdentity, get_current_user
from backend.common.auth.identity import UserRole
from backend.common.repositories.base import ProjectRepository
from backend.common.repositories.enrollment_repository import EnrollmentRepository
from backend.common.repositories.factory import get_project_repository
from backend.common.repositories.submission_repository import SubmissionRepository
from backend.projects.schemas import (
    SubmissionCreate,
    SubmissionDetailResponse,
    SubmissionResponse,
    SubmissionReview,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["submissions"])

# ── Dependency helpers ────────────────────────────────────────────────────────

_submission_repo: Optional[SubmissionRepository] = None
_enrollment_repo: Optional[EnrollmentRepository] = None


def _get_submission_repo() -> SubmissionRepository:
    global _submission_repo
    if _submission_repo is None:
        _submission_repo = SubmissionRepository()
    return _submission_repo


def _get_enrollment_repo() -> EnrollmentRepository:
    global _enrollment_repo
    if _enrollment_repo is None:
        _enrollment_repo = EnrollmentRepository()
    return _enrollment_repo


def _get_project_repo() -> ProjectRepository:
    return get_project_repository()


def _is_course_instructor(user: UserIdentity) -> bool:
    """Maintainers and admins can review submissions."""
    return user.role in (UserRole.MAINTAINER, UserRole.ADMIN)


# ══════════════════════════════════════════════════════════════════════════════
#  STUDENT ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════


@router.post(
    "/courses/{course_id}/submissions",
    response_model=SubmissionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def submit_project(
    course_id: str,
    body: SubmissionCreate,
    user: UserIdentity = Depends(get_current_user),
):
    """Submit a project to a course (enrolled students only).

    Creates a frozen snapshot of the project's current state.
    """
    enrollment_repo = _get_enrollment_repo()
    if not enrollment_repo.is_enrolled(course_id, user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must be enrolled in this course to submit.",
        )

    project_repo = _get_project_repo()
    project = await project_repo.get_project(body.project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )
    if project.get("user_id") != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only submit your own projects.",
        )

    submission_repo = _get_submission_repo()
    result = submission_repo.create_submission(
        course_id=course_id,
        project_id=body.project_id,
        user_id=user.id,
        username=user.username,
        project_name=project.get("name", "Untitled"),
        frozen_design_state=project.get("design_state"),
        frozen_simulation_config=project.get("simulation_config"),
        frozen_simulation_results=project.get("simulation_results"),
        frozen_ui_state=project.get("ui_state"),
    )
    return SubmissionResponse(**result)


@router.get(
    "/my-submissions",
    response_model=List[SubmissionResponse],
)
async def list_my_submissions(
    user: UserIdentity = Depends(get_current_user),
):
    """List all submissions made by the current user."""
    repo = _get_submission_repo()
    submissions = repo.list_user_submissions(user.id)
    return [SubmissionResponse(**s) for s in submissions]


# ══════════════════════════════════════════════════════════════════════════════
#  INSTRUCTOR ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════


@router.get(
    "/courses/{course_id}/submissions",
    response_model=List[SubmissionResponse],
)
async def list_course_submissions(
    course_id: str,
    user: UserIdentity = Depends(get_current_user),
):
    """List all submissions for a course.

    - Instructors (maintainer/admin) see all submissions.
    - Students see only their own submissions.
    """
    repo = _get_submission_repo()

    if _is_course_instructor(user):
        submissions = repo.list_course_submissions(course_id)
    else:
        submissions = repo.list_user_course_submissions(course_id, user.id)

    return [SubmissionResponse(**s) for s in submissions]


@router.get(
    "/courses/{course_id}/submissions/{submission_id}",
    response_model=SubmissionDetailResponse,
)
async def get_submission_detail(
    course_id: str,
    submission_id: str,
    user: UserIdentity = Depends(get_current_user),
):
    """Get full submission detail including frozen snapshot.

    - Instructors can view any submission in their courses.
    - Students can view only their own submissions.
    """
    repo = _get_submission_repo()
    submission = repo.get_submission(course_id, submission_id)

    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found.",
        )

    if not _is_course_instructor(user) and submission.get("user_id") != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own submissions.",
        )

    return SubmissionDetailResponse(**submission)


@router.patch(
    "/courses/{course_id}/submissions/{submission_id}/review",
    response_model=SubmissionResponse,
)
async def review_submission(
    course_id: str,
    submission_id: str,
    body: SubmissionReview,
    user: UserIdentity = Depends(get_current_user),
):
    """Add instructor feedback to a submission (maintainer/admin only)."""
    if not _is_course_instructor(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only instructors can review submissions.",
        )

    repo = _get_submission_repo()
    submission = repo.get_submission(course_id, submission_id)
    if not submission:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submission not found.",
        )

    if body.status not in ("reviewed", "returned"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status must be 'reviewed' or 'returned'.",
        )

    result = repo.update_review(
        submission_id=submission_id,
        course_id=course_id,
        user_id=submission["user_id"],
        feedback=body.feedback,
        status=body.status,
        reviewed_by=user.id,
    )
    if not result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update review.",
        )
    return SubmissionResponse(**result)
