"""Common repositories package."""

from backend.common.repositories.base import (
    UserRepository,
    ProjectRepository,
    ElementRepository,
    ResultRepository
)
from backend.common.repositories.factory import (
    get_project_repository,
    get_user_repository,
    get_element_repository,
    get_result_repository
)

__all__ = [
    'UserRepository',
    'ProjectRepository',
    'ElementRepository',
    'ResultRepository',
    'get_project_repository',
    'get_user_repository',
    'get_element_repository',
    'get_result_repository',
]
