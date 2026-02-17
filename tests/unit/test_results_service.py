"""Unit tests for ResultsService."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.common.storage.provider import ResultType
from backend.projects.results_service import ResultsService


class TestResultsService:
    """Test ResultsService for S3 result management."""

    @pytest.fixture
    def mock_storage(self):
        """Create a mock storage provider."""
        storage = MagicMock()
        storage.store_result = AsyncMock()
        storage.get_result = AsyncMock()
        storage.delete_results = AsyncMock()
        return storage

    @pytest.fixture
    def service(self, mock_storage):
        """Create ResultsService with mocked storage."""
        return ResultsService(storage=mock_storage)

    @pytest.mark.asyncio
    async def test_extract_and_store_empty_results(self, service):
        """Test extracting from empty/None results."""
        slim, keys = await service.extract_and_store("proj-1", None)
        assert slim == {}
        assert keys == {}

        slim, keys = await service.extract_and_store("proj-1", {})
        assert slim == {}
        assert keys == {}

    @pytest.mark.asyncio
    async def test_extract_and_store_solver_results(self, service, mock_storage):
        """Test extracting solver results to S3."""
        mock_storage.store_result.return_value = "results/proj-1/solver_results.json"

        simulation_results = {
            "results": {"impedance": {"real": 73, "imag": 42}},
            "frequencySweep": [{"freq": 100e6, "z": {"real": 50, "imag": 0}}],
            "solverState": "completed",  # This stays in slim results
        }

        slim, keys = await service.extract_and_store("proj-1", simulation_results)

        # Verify S3 storage was called
        mock_storage.store_result.assert_called()
        call_args = mock_storage.store_result.call_args_list[0]
        assert call_args[0][0] == "proj-1"
        assert call_args[0][1] == ResultType.SOLVER_RESULTS

        # Verify keys returned
        assert "solver_results" in keys

        # Verify slim results don't have large data
        assert "results" not in slim
        assert "frequencySweep" not in slim
        assert "result_keys" in slim

    @pytest.mark.asyncio
    async def test_extract_and_store_radiation_pattern(self, service, mock_storage):
        """Test extracting radiation pattern to S3."""
        mock_storage.store_result.return_value = "results/proj-1/radiation_pattern.json"

        simulation_results = {
            "radiationPattern": {
                "theta": [0, 30, 60, 90],
                "phi": [0, 90, 180, 270],
                "pattern_db": [[0, -3, -6], [-3, -6, -10]],
            }
        }

        slim, keys = await service.extract_and_store("proj-1", simulation_results)

        assert "radiation_pattern" in keys
        assert "radiationPattern" not in slim

    @pytest.mark.asyncio
    async def test_extract_and_store_field_data(self, service, mock_storage):
        """Test extracting field data to S3."""
        mock_storage.store_result.return_value = "results/proj-1/field_data.json"

        simulation_results = {
            "fieldData": {
                "positions": [[0, 0, 0], [1, 0, 0]],
                "E_field": [{"x": 1, "y": 0, "z": 0}],
            },
            "fieldResults": {"type": "nearfield", "computed": True},
        }

        slim, keys = await service.extract_and_store("proj-1", simulation_results)

        assert "field_data" in keys
        assert "fieldData" not in slim
        assert "fieldResults" not in slim

    @pytest.mark.asyncio
    async def test_extract_and_store_all_types(self, service, mock_storage):
        """Test extracting all result types at once."""
        mock_storage.store_result.side_effect = [
            "results/proj-1/solver_results.json",
            "results/proj-1/radiation_pattern.json",
            "results/proj-1/field_data.json",
        ]

        simulation_results = {
            "results": {"impedance": 50},
            "frequencySweep": [1, 2, 3],
            "radiationPattern": {"pattern": "data"},
            "fieldData": {"big": "data"},
            "solverState": "completed",
            "currentFrequency": 100e6,
        }

        slim, keys = await service.extract_and_store("proj-1", simulation_results)

        # All three types should be stored
        assert len(keys) == 3
        assert "solver_results" in keys
        assert "radiation_pattern" in keys
        assert "field_data" in keys

        # Slim results should have keys and non-large data
        assert "result_keys" in slim
        assert "solverState" in slim
        assert "currentFrequency" in slim

    @pytest.mark.asyncio
    async def test_hydrate_results_empty(self, service):
        """Test hydrating empty/None results."""
        result = await service.hydrate_results("proj-1", None)
        assert result == {}

        result = await service.hydrate_results("proj-1", {})
        assert result == {}

    @pytest.mark.asyncio
    async def test_hydrate_results_no_keys(self, service):
        """Test hydrating results without S3 keys (legacy project)."""
        slim = {"solverState": "completed", "currentFrequency": 100e6}

        result = await service.hydrate_results("proj-1", slim)

        assert result == slim  # Returned as-is

    @pytest.mark.asyncio
    async def test_hydrate_results_with_keys(self, service, mock_storage):
        """Test hydrating results from S3."""
        mock_storage.get_result.side_effect = [
            {"results": {"impedance": 50}, "frequencySweep": [1, 2]},
            {"pattern": "data"},
            {"field": "vectors"},
        ]

        slim = {
            "solverState": "completed",
            "result_keys": {
                "solver_results": "results/proj-1/solver_results.json",
                "radiation_pattern": "results/proj-1/radiation_pattern.json",
                "field_data": "results/proj-1/field_data.json",
            },
        }

        result = await service.hydrate_results("proj-1", slim)

        # Original data preserved
        assert result["solverState"] == "completed"
        # S3 data merged in
        assert result["results"] == {"impedance": 50}
        assert result["frequencySweep"] == [1, 2]
        assert result["radiationPattern"] == {"pattern": "data"}

    @pytest.mark.asyncio
    async def test_delete_results(self, service, mock_storage):
        """Test deleting all results for a project."""
        mock_storage.delete_results.return_value = 3

        deleted = await service.delete_results("proj-1")

        assert deleted == 3
        mock_storage.delete_results.assert_called_once_with("proj-1")

    @pytest.mark.asyncio
    async def test_duplicate_results_empty(self, service):
        """Test duplicating with no result keys."""
        new_keys = await service.duplicate_results("src", "dst", None)
        assert new_keys == {}

        new_keys = await service.duplicate_results("src", "dst", {})
        assert new_keys == {}

    @pytest.mark.asyncio
    async def test_duplicate_results(self, service, mock_storage):
        """Test duplicating results from one project to another."""
        mock_storage.get_result.side_effect = [
            {"solver": "data"},
            {"pattern": "data"},
        ]
        mock_storage.store_result.side_effect = [
            "results/dst/solver_results.json",
            "results/dst/radiation_pattern.json",
        ]

        result_keys = {
            "solver_results": "results/src/solver_results.json",
            "radiation_pattern": "results/src/radiation_pattern.json",
        }

        new_keys = await service.duplicate_results("src", "dst", result_keys)

        assert len(new_keys) == 2
        assert "solver_results" in new_keys
        assert "radiation_pattern" in new_keys
        # Verify data was fetched and stored
        assert mock_storage.get_result.call_count == 2
        assert mock_storage.store_result.call_count == 2


class TestResultsServiceFactory:
    """Test results service factory functions."""

    def test_get_results_service_singleton(self):
        """Test that get_results_service returns singleton."""
        from backend.projects.results_service import (
            get_results_service,
            reset_results_service,
        )

        reset_results_service()

        with patch("backend.projects.results_service.get_storage_provider"):
            svc1 = get_results_service()
            svc2 = get_results_service()
            assert svc1 is svc2

        reset_results_service()
