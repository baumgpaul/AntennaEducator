"""Common repositories package."""

from backend.common.repositories.base import (
    UserRepository,
    ProjectRepository,
)
from backend.common.repositories.factory import (
    get_project_repository,
)

__all__ = [
    'UserRepository',
    'ProjectRepository',
    'get_project_repository',
]
