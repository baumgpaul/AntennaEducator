"""Results service — handles S3 storage for simulation results.

This service extracts large result data from project payloads, stores them in S3,
and manages the S3 keys stored in DynamoDB.
"""

import logging
from typing import Any, Dict, Optional, Tuple

from backend.common.storage import ResultsStorageProvider, get_storage_provider
from backend.common.storage.provider import ResultType

logger = logging.getLogger(__name__)

# Keys in simulation_results that should be stored in S3
S3_RESULT_KEYS = {
    "solver_results": ResultType.SOLVER_RESULTS,  # results, frequency_sweep, etc.
    "radiation_pattern": ResultType.RADIATION_PATTERN,  # radiationPattern
    "field_data": ResultType.FIELD_DATA,  # fieldData, fieldResults
    "parameter_study": ResultType.PARAMETER_STUDY,  # parameterStudy, radiationPatterns, etc.
}


class ResultsService:
    """Service for managing simulation results in S3."""

    def __init__(self, storage: Optional[ResultsStorageProvider] = None):
        """Initialize results service.

        Args:
            storage: Storage provider instance (defaults to factory singleton).
        """
        self._storage = storage

    @property
    def storage(self) -> ResultsStorageProvider:
        if self._storage is None:
            self._storage = get_storage_provider()
        return self._storage

    async def extract_and_store(
        self,
        project_id: str,
        simulation_results: Optional[Dict[str, Any]],
    ) -> Tuple[Dict[str, Any], Dict[str, str]]:
        """Extract large results from payload and store in S3.

        Args:
            project_id: The project ID.
            simulation_results: The full simulation_results dict from frontend.

        Returns:
            Tuple of (slim_results, result_keys):
            - slim_results: The simulation_results with large data replaced by references
            - result_keys: Mapping of result_type -> S3 key
        """
        if not simulation_results:
            return {}, {}

        result_keys: Dict[str, str] = {}
        slim_results = dict(simulation_results)

        # Extract and store solver results (impedance, currents, frequency sweep)
        solver_data = self._extract_solver_data(simulation_results)
        if solver_data:
            key = await self.storage.store_result(
                project_id, ResultType.SOLVER_RESULTS, solver_data
            )
            result_keys["solver_results"] = key
            # Remove from slim results
            for field in ["results", "frequencySweep", "multiAntennaResults"]:
                slim_results.pop(field, None)

        # Extract and store radiation pattern
        pattern_data = simulation_results.get("radiationPattern")
        if pattern_data:
            key = await self.storage.store_result(
                project_id, ResultType.RADIATION_PATTERN, pattern_data
            )
            result_keys["radiation_pattern"] = key
            slim_results.pop("radiationPattern", None)

        # Extract and store field data
        field_data = self._extract_field_data(simulation_results)
        if field_data:
            key = await self.storage.store_result(project_id, ResultType.FIELD_DATA, field_data)
            result_keys["field_data"] = key
            for field in ["fieldData", "fieldResults"]:
                slim_results.pop(field, None)

        # Extract and store parameter study data (can be very large)
        param_study_data = self._extract_parameter_study_data(simulation_results)
        if param_study_data:
            key = await self.storage.store_result(
                project_id, ResultType.PARAMETER_STUDY, param_study_data
            )
            result_keys["parameter_study"] = key
            for field in [
                "parameterStudy",
                "radiationPatterns",
                "resultsHistory",
                "currentDistribution",
            ]:
                slim_results.pop(field, None)

        # Store the keys reference in slim_results
        slim_results["result_keys"] = result_keys

        logger.info(f"Stored {len(result_keys)} result types for project {project_id}")
        return slim_results, result_keys

    async def hydrate_results(
        self,
        project_id: str,
        simulation_results: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """Fetch results from S3 and merge into simulation_results.

        Args:
            project_id: The project ID.
            simulation_results: The slim simulation_results from DynamoDB.

        Returns:
            Full simulation_results with S3 data merged in.
        """
        if not simulation_results:
            return {}

        result_keys = simulation_results.get("result_keys", {})
        if not result_keys:
            # No S3 data, return as-is (legacy project)
            return simulation_results

        hydrated = dict(simulation_results)

        # Fetch solver results
        if "solver_results" in result_keys:
            solver_data = await self.storage.get_result(project_id, ResultType.SOLVER_RESULTS)
            if solver_data:
                hydrated.update(solver_data)

        # Fetch radiation pattern
        if "radiation_pattern" in result_keys:
            pattern_data = await self.storage.get_result(project_id, ResultType.RADIATION_PATTERN)
            if pattern_data:
                hydrated["radiationPattern"] = pattern_data

        # Fetch field data
        if "field_data" in result_keys:
            field_data = await self.storage.get_result(project_id, ResultType.FIELD_DATA)
            if field_data:
                hydrated.update(field_data)

        # Fetch parameter study data
        if "parameter_study" in result_keys:
            param_data = await self.storage.get_result(project_id, ResultType.PARAMETER_STUDY)
            if param_data:
                hydrated.update(param_data)

        return hydrated

    async def delete_results(self, project_id: str) -> int:
        """Delete all S3 results for a project.

        Args:
            project_id: The project ID.

        Returns:
            Number of objects deleted.
        """
        return await self.storage.delete_results(project_id)

    async def duplicate_results(
        self,
        source_project_id: str,
        target_project_id: str,
        result_keys: Optional[Dict[str, str]],
    ) -> Dict[str, str]:
        """Duplicate all results from one project to another.

        Args:
            source_project_id: The source project ID.
            target_project_id: The target project ID.
            result_keys: The result_keys from source project's simulation_results.

        Returns:
            New result_keys mapping for the target project.
        """
        if not result_keys:
            return {}

        new_keys: Dict[str, str] = {}

        for result_type_str, source_key in result_keys.items():
            result_type = S3_RESULT_KEYS.get(result_type_str)
            if not result_type:
                continue

            # Fetch from source and store to target
            data = await self.storage.get_result(source_project_id, result_type)
            if data:
                key = await self.storage.store_result(target_project_id, result_type, data)
                new_keys[result_type_str] = key

        logger.info(
            f"Duplicated {len(new_keys)} result types from {source_project_id} to {target_project_id}"
        )
        return new_keys

    def _extract_solver_data(self, simulation_results: Dict[str, Any]) -> Dict[str, Any]:
        """Extract solver-related fields from simulation_results."""
        solver_data = {}
        for field in ["results", "frequencySweep", "multiAntennaResults"]:
            if field in simulation_results and simulation_results[field] is not None:
                solver_data[field] = simulation_results[field]
        return solver_data

    def _extract_field_data(self, simulation_results: Dict[str, Any]) -> Dict[str, Any]:
        """Extract field-related data from simulation_results."""
        field_data = {}
        for field in ["fieldData", "fieldResults"]:
            if field in simulation_results and simulation_results[field] is not None:
                field_data[field] = simulation_results[field]
        return field_data

    def _extract_parameter_study_data(self, simulation_results: Dict[str, Any]) -> Dict[str, Any]:
        """Extract parameter study and related large data from simulation_results."""
        param_data = {}
        for field in [
            "parameterStudy",
            "radiationPatterns",
            "resultsHistory",
            "currentDistribution",
        ]:
            if field in simulation_results and simulation_results[field] is not None:
                param_data[field] = simulation_results[field]
        return param_data


# Singleton instance
_results_service: Optional[ResultsService] = None


def get_results_service() -> ResultsService:
    """Get the results service singleton."""
    global _results_service
    if _results_service is None:
        _results_service = ResultsService()
    return _results_service


def reset_results_service() -> None:
    """Reset the singleton (for testing)."""
    global _results_service
    _results_service = None
