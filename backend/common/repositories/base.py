"""Repository abstraction layer — v2.

Changes from v1:
- ``ProjectRepository.update_project`` uses new JSON blob fields
  (``design_state``, ``simulation_config``, ``simulation_results``, ``ui_state``)
- Removed: ``ElementRepository``, ``ResultRepository``
- ``UserRepository`` ABC kept but simplified
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class UserRepository(ABC):
    """Abstract base class for user data access."""

    @abstractmethod
    async def create_user(self, email: str, password_hash: str) -> Dict[str, Any]:
        ...

    @abstractmethod
    async def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        ...

    @abstractmethod
    async def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        ...

    @abstractmethod
    async def delete_user(self, user_id: str) -> bool:
        ...


class ProjectRepository(ABC):
    """Abstract base class for project data access."""

    @abstractmethod
    async def create_project(
        self,
        user_id: str,
        name: str,
        description: Optional[str] = None,
    ) -> Dict[str, Any]:
        ...

    @abstractmethod
    async def get_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        ...

    @abstractmethod
    async def list_projects(self, user_id: str) -> List[Dict[str, Any]]:
        ...

    @abstractmethod
    async def update_project(
        self,
        project_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        design_state: Optional[Dict] = None,
        simulation_config: Optional[Dict] = None,
        simulation_results: Optional[Dict] = None,
        ui_state: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        ...

    @abstractmethod
    async def delete_project(self, project_id: str) -> bool:
        ...
