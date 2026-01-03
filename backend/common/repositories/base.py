"""Repository abstraction layer - Base interfaces."""

from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any
from datetime import datetime


class UserRepository(ABC):
    """Abstract base class for user data access."""
    
    @abstractmethod
    async def create_user(self, email: str, password_hash: str) -> Dict[str, Any]:
        """Create a new user."""
        pass
    
    @abstractmethod
    async def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Get user by ID."""
        pass
    
    @abstractmethod
    async def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Get user by email."""
        pass
    
    @abstractmethod
    async def delete_user(self, user_id: str) -> bool:
        """Delete user."""
        pass


class ProjectRepository(ABC):
    """Abstract base class for project data access."""
    
    @abstractmethod
    async def create_project(
        self,
        user_id: str,
        name: str,
        description: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a new project."""
        pass
    
    @abstractmethod
    async def get_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        """Get project by ID."""
        pass
    
    @abstractmethod
    async def list_projects(self, user_id: str) -> List[Dict[str, Any]]:
        """List all projects for a user."""
        pass
    
    @abstractmethod
    async def update_project(
        self,
        project_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        requested_fields: Optional[List[Dict]] = None,
        view_configurations: Optional[List[Dict]] = None,
        solver_state: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Update project."""
        pass
    
    @abstractmethod
    async def delete_project(self, project_id: str) -> bool:
        """Delete project."""
        pass


class ElementRepository(ABC):
    """Abstract base class for antenna element data access."""
    
    @abstractmethod
    async def create_element(
        self,
        project_id: str,
        element_name: str,
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create antenna element."""
        pass
    
    @abstractmethod
    async def get_element(self, element_id: str) -> Optional[Dict[str, Any]]:
        """Get element by ID."""
        pass
    
    @abstractmethod
    async def list_elements(self, project_id: str) -> List[Dict[str, Any]]:
        """List all elements for a project."""
        pass
    
    @abstractmethod
    async def update_element(
        self,
        element_id: str,
        element_name: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Update element."""
        pass
    
    @abstractmethod
    async def delete_element(self, element_id: str) -> bool:
        """Delete element."""
        pass


class ResultRepository(ABC):
    """Abstract base class for simulation result data access."""
    
    @abstractmethod
    async def create_result(
        self,
        project_id: str,
        frequency: float,
        currents_s3_key: Optional[str] = None,
        mesh_s3_key: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create simulation result."""
        pass
    
    @abstractmethod
    async def get_result(self, result_id: str) -> Optional[Dict[str, Any]]:
        """Get result by ID."""
        pass
    
    @abstractmethod
    async def list_results(self, project_id: str) -> List[Dict[str, Any]]:
        """List all results for a project."""
        pass
    
    @abstractmethod
    async def delete_result(self, result_id: str) -> bool:
        """Delete result."""
        pass
