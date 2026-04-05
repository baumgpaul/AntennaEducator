"""Abstract base class for results storage providers."""

from abc import ABC, abstractmethod
from enum import Enum
from typing import Any, Dict, Optional


class ResultType(str, Enum):
    """Types of simulation results that can be stored."""

    SOLVER_RESULTS = "solver_results"  # impedance, currents, frequency_sweep
    RADIATION_PATTERN = "radiation_pattern"  # 3D pattern data
    FIELD_DATA = "field_data"  # near/far-field vectors (largest)
    PARAMETER_STUDY = "parameter_study"  # parameter sweep results (can be very large)


class ResultsStorageProvider(ABC):
    """Abstract base class for results storage (S3/MinIO)."""

    @abstractmethod
    async def store_result(
        self,
        project_id: str,
        result_type: ResultType,
        data: Dict[str, Any],
    ) -> str:
        """Store a result and return its storage key.

        Args:
            project_id: The project ID this result belongs to.
            result_type: Type of result (solver_results, radiation_pattern, field_data).
            data: The result data to store as JSON.

        Returns:
            The storage key (S3 object key) for the stored result.
        """
        ...

    @abstractmethod
    async def get_result(
        self,
        project_id: str,
        result_type: ResultType,
    ) -> Optional[Dict[str, Any]]:
        """Retrieve a result by project ID and type.

        Args:
            project_id: The project ID.
            result_type: Type of result to retrieve.

        Returns:
            The result data as a dictionary, or None if not found.
        """
        ...

    @abstractmethod
    async def delete_results(self, project_id: str) -> int:
        """Delete all results for a project.

        Args:
            project_id: The project ID.

        Returns:
            Number of objects deleted.
        """
        ...

    @abstractmethod
    async def result_exists(
        self,
        project_id: str,
        result_type: ResultType,
    ) -> bool:
        """Check if a result exists.

        Args:
            project_id: The project ID.
            result_type: Type of result to check.

        Returns:
            True if the result exists, False otherwise.
        """
        ...

    def get_key(self, project_id: str, result_type: ResultType) -> str:
        """Generate the storage key for a result.

        Args:
            project_id: The project ID.
            result_type: Type of result.

        Returns:
            The storage key (e.g., "results/{project_id}/solver_results.json").
        """
        return f"results/{project_id}/{result_type.value}.json"
