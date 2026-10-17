"""Submission snapshots live in S3 with their own copy of the results (B41)."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.common.storage.provider import ResultType
from backend.projects import submission_routes


@pytest.fixture
def results_svc():
    svc = MagicMock()
    svc.duplicate_results = AsyncMock(return_value={"solver_results": "submission-s1/solver"})
    svc.storage.store_result = AsyncMock(return_value="submission-s1/submission_snapshot.json")
    svc.storage.get_result = AsyncMock()
    svc.hydrate_results = AsyncMock(
        side_effect=lambda owner, res: {**(res or {}), "hydrated": owner}
    )
    with patch("backend.projects.results_service.get_results_service", return_value=svc):
        yield svc


@pytest.mark.asyncio
async def test_store_copies_results_into_submission_namespace(results_svc):
    frozen = {
        "design_state": {"elements": [1]},
        "simulation_config": {},
        "simulation_results": {"result_keys": {"solver_results": "p1/solver"}},
        "ui_state": {},
    }
    key = await submission_routes._store_snapshot("s1", "p1", frozen)

    assert key == "submission-s1/submission_snapshot.json"
    results_svc.duplicate_results.assert_awaited_once_with(
        "p1", "submission-s1", {"solver_results": "p1/solver"}
    )
    owner, rtype, snapshot = results_svc.storage.store_result.await_args.args
    assert (owner, rtype) == ("submission-s1", ResultType.SUBMISSION_SNAPSHOT)
    # Snapshot references the frozen copy, not the live project results
    assert snapshot["simulation_results"]["result_keys"] == {
        "solver_results": "submission-s1/solver"
    }


@pytest.mark.asyncio
async def test_store_returns_none_when_s3_fails(results_svc):
    results_svc.storage.store_result.side_effect = RuntimeError("S3 down")
    assert await submission_routes._store_snapshot("s1", "p1", {"simulation_results": {}}) is None


@pytest.mark.asyncio
async def test_load_hydrates_results_from_submission_namespace(results_svc):
    results_svc.storage.get_result.return_value = {
        "design_state": {"elements": [1]},
        "simulation_results": {"result_keys": {"solver_results": "submission-s1/solver"}},
    }
    loaded = await submission_routes._load_snapshot("s1")

    assert loaded["frozen_design_state"] == {"elements": [1]}
    assert loaded["frozen_simulation_results"]["hydrated"] == "submission-s1"
    assert loaded["frozen_ui_state"] == {}
