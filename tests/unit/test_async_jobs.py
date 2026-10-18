"""Async solve jobs (#77): submit -> queue -> worker -> poll."""

import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.common.auth.dependencies import get_current_user
from backend.common.auth.identity import UserIdentity
from backend.solver import jobs
from backend.solver.jobs import DONE, FAILED, JobStore, run_job

USER = UserIdentity(id="u1", email="u@x.example", username="u", simulation_tokens=100)
DIPOLE = {
    "frequency": 3e8,
    "antennas": [
        {
            "antenna_id": "d",
            "nodes": [[0, 0, -0.25], [0, 0, -0.005], [0, 0, 0.005], [0, 0, 0.25]],
            "edges": [[1, 2], [3, 4]],
            "radii": [0.001, 0.001],
            "voltage_sources": [
                {"node_start": 0, "node_end": 2, "value": 0.5},
                {"node_start": 0, "node_end": 3, "value": -0.5},
            ],
        }
    ],
}


class FakeTable:
    def __init__(self):
        self.items = {}

    def put_item(self, Item):
        self.items[(Item["PK"], Item["SK"])] = dict(Item)

    def get_item(self, Key):
        item = self.items.get((Key["PK"], Key["SK"]))
        return {"Item": dict(item)} if item else {}

    def update_item(
        self, Key, UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues
    ):
        item = self.items[(Key["PK"], Key["SK"])]
        item["Status"] = ExpressionAttributeValues[":s"]
        if ":e" in ExpressionAttributeValues:
            item["Error"] = ExpressionAttributeValues[":e"]


class FakeStorage:
    def __init__(self):
        self.objects = {}

    async def store_result(self, project_id, result_type, data):
        self.objects[(project_id, result_type)] = data
        return f"results/{project_id}/{result_type.value}.json"

    async def get_result(self, project_id, result_type):
        return self.objects.get((project_id, result_type))


@pytest.fixture
def store(monkeypatch):
    monkeypatch.setenv("ASYNC_JOBS", "lambda")
    monkeypatch.setenv("JOBS_QUEUE_URL", "https://sqs.example/jobs")
    return JobStore(table=FakeTable(), storage=FakeStorage(), sqs=MagicMock())


@pytest.mark.asyncio
async def test_submit_stores_request_and_queues_only_the_id(store):
    job_id = await store.submit("u1", DIPOLE, tokens_charged=5)

    item = store.get("u1", job_id)
    assert item["Status"] == "queued" and item["TokensCharged"] == 5
    assert item["TTL"] > 0  # expires through the table TTL
    body = json.loads(store.sqs.send_message.call_args.kwargs["MessageBody"])
    assert body == {"job_id": job_id, "user_id": "u1"}  # payload stays in S3 (SQS max 256 KB)


@pytest.mark.asyncio
async def test_worker_solves_and_stores_the_result(store):
    job_id = await store.submit("u1", DIPOLE, tokens_charged=5)
    await run_job(job_id, "u1", store=store)

    assert store.get("u1", job_id)["Status"] == DONE
    result = await store.result(job_id)
    assert result["antenna_solutions"][0]["antenna_id"] == "d"


@pytest.mark.asyncio
async def test_failed_job_reports_the_error_and_refunds(store):
    job_id = await store.submit("u1", {**DIPOLE, "antennas": []}, tokens_charged=5)
    with patch("backend.common.repositories.user_repository.UserRepository") as repo_cls:
        await run_job(job_id, "u1", store=store)

    item = store.get("u1", job_id)
    assert item["Status"] == FAILED and "antenna" in item["Error"]
    repo_cls.return_value.refund_user_tokens.assert_called_once_with("u1", 5)


@pytest.mark.asyncio
async def test_duplicate_delivery_does_not_rerun(store):
    job_id = await store.submit("u1", DIPOLE, tokens_charged=0)
    store.set_status("u1", job_id, DONE)
    with patch("backend.solver.main.solve_multi_request") as solve:
        await run_job(job_id, "u1", store=store)
    solve.assert_not_called()


FIELD = {
    "frequencies": [3e8],
    "branch_currents": [[{"real": 1.0, "imag": 0.0}, {"real": 1.0, "imag": 0.0}]],
    "nodes": DIPOLE["antennas"][0]["nodes"],
    "edges": DIPOLE["antennas"][0]["edges"],
    "radii": [0.001, 0.001],
}


@pytest.mark.asyncio
async def test_worker_runs_near_field_jobs(store):
    request = {**FIELD, "observation_points": [[0.1, 0, 0], [0, 0.1, 0.1]]}
    job_id = await store.submit("u1", request, tokens_charged=3, kind="near_field")
    await run_job(job_id, "u1", store=store)

    result = await store.result(job_id)
    assert store.get("u1", job_id)["Status"] == DONE
    assert result["format"] == "flat" and result["num_points"] == 2
    assert len(result["E_real"]) == 6 and result["E_magnitudes"][0] > 0


@pytest.mark.asyncio
async def test_worker_runs_far_field_jobs(store):
    request = {**FIELD, "theta_points": 19, "phi_points": 37}
    job_id = await store.submit("u1", request, tokens_charged=3, kind="far_field")
    await run_job(job_id, "u1", store=store)

    result = await store.result(job_id)
    assert len(result["pattern_db"]) == 19 * 37
    assert result["directivity"] > 1.5  # a short dipole: ~1.76 dBi


def test_estimates_queue_only_big_requests():
    from backend.solver.jobs import INLINE_MAX_SECONDS, job_kind
    from backend.solver.schemas import MultiAntennaRequest

    def solve(n_edges):
        antenna = {**DIPOLE["antennas"][0], "edges": [[1, 2]] * n_edges, "radii": [0.001] * n_edges}
        return MultiAntennaRequest(frequency=3e8, antennas=[antenna])

    estimate = job_kind("solve").estimate_seconds
    assert estimate(solve(100)) < INLINE_MAX_SECONDS < estimate(solve(400))


# ── Endpoints ─────────────────────────────────────────────────────────────────


def _client():
    from backend.solver.main import app

    app.dependency_overrides[get_current_user] = lambda: USER
    return TestClient(app), app


def test_endpoints_are_off_unless_enabled(monkeypatch):
    monkeypatch.setenv("ASYNC_JOBS", "off")
    client, app = _client()
    try:
        assert client.get("/api/jobs/abc").status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_poll_returns_result_only_for_the_owner(store):
    import asyncio

    job_id = asyncio.run(store.submit("someone-else", DIPOLE, tokens_charged=0))
    client, app = _client()
    try:
        with (
            patch.object(jobs, "JobStore", return_value=store),
            patch("backend.solver.main.JobStore", return_value=store),
        ):
            assert client.get(f"/api/jobs/{job_id}").status_code == 404
            mine = asyncio.run(store.submit("u1", DIPOLE, tokens_charged=0))
            asyncio.run(run_job(mine, "u1", store=store))
            resp = client.get(f"/api/jobs/{mine}")
    finally:
        app.dependency_overrides.clear()
    assert resp.status_code == 200
    assert resp.json()["status"] == "done"
    assert resp.json()["result"]["antenna_solutions"][0]["antenna_id"] == "d"


def test_lambda_handler_routes_sqs_records():
    from backend.solver import lambda_handler

    event = {
        "Records": [{"eventSource": "aws:sqs", "body": json.dumps({"job_id": "j", "user_id": "u"})}]
    }
    with (
        patch("backend.solver.jobs.run_job") as run,
        patch.object(lambda_handler, "_http_handler") as http,
    ):
        run.return_value = None

        async def fake(*args, **kwargs):
            return None

        run.side_effect = fake
        assert lambda_handler.handler(event, None) == {"batchItemFailures": []}
    run.assert_called_once_with("j", "u")
    http.assert_not_called()


def test_queued_job_leaves_the_current_event_loop_alone():
    """Mangum < 0.20 (as in the Lambda image) calls asyncio.get_event_loop() per
    HTTP request; asyncio.run() unset it, so the poll right after a job in the
    same warm instance failed with a 502 ("no current event loop")."""
    import asyncio

    from backend.solver import lambda_handler

    async def fake(*args, **kwargs):
        return None

    sqs = {
        "Records": [{"eventSource": "aws:sqs", "body": json.dumps({"job_id": "j", "user_id": "u"})}]
    }
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        with patch("backend.solver.jobs.run_job", side_effect=fake):
            lambda_handler.handler(sqs, None)
        assert asyncio.get_event_loop() is loop
    finally:
        asyncio.set_event_loop(None)
        loop.close()


def _post(store, path, body, charged=None):
    client, app = _client()
    try:
        with (
            patch("backend.solver.main.JobStore", return_value=store),
            patch("backend.common.auth.token_dependency.charge_simulation_tokens") as charge,
        ):
            resp = client.post(path, json=body)
    finally:
        app.dependency_overrides.clear()
    if charged is not None:
        assert charge.call_count == charged
    return resp


def test_small_solve_runs_inline_without_queueing(store):
    resp = _post(store, "/api/jobs/solve", DIPOLE, charged=1)
    assert resp.status_code == 200
    assert resp.json()["status"] == "done"
    assert resp.json()["result"]["antenna_solutions"][0]["antenna_id"] == "d"
    store.sqs.send_message.assert_not_called()


def test_big_solve_is_queued(store):
    with patch("backend.solver.main.INLINE_MAX_SECONDS", -1):
        resp = _post(store, "/api/jobs/solve", DIPOLE)
    assert resp.status_code == 202
    item = store.get("u1", resp.json()["job_id"])
    assert item["Kind"] == "solve" and item["TokensCharged"] == 5


def test_field_jobs_inline_and_queued(store):
    near = {**FIELD, "observation_points": [[0.1, 0, 0]]}
    resp = _post(store, "/api/jobs/near-field", near)
    assert resp.status_code == 200 and resp.json()["result"]["num_points"] == 1

    with patch("backend.solver.main.INLINE_MAX_SECONDS", -1):
        resp = _post(store, "/api/jobs/far-field", {**FIELD, "theta_points": 19, "phi_points": 37})
    assert resp.status_code == 202
    assert store.get("u1", resp.json()["job_id"])["Kind"] == "far_field"


def test_inline_field_input_errors_are_422(store):
    zero = {**FIELD, "branch_currents": [[0, 0]], "theta_points": 19, "phi_points": 37}
    assert _post(store, "/api/jobs/far-field", zero, charged=0).status_code == 422
