"""Asynchronous jobs (#77), enabled with ASYNC_JOBS=lambda.

CloudFront waits at most 60 s for the API, while the solver Lambda may run
15 minutes. With async jobs the browser submits, then polls:

    POST /api/jobs/{solve,near-field,far-field}
        small (estimate <= INLINE_MAX_SECONDS) -> 200 {status: done, result}
        otherwise -> 202 {job_id}            request stored in S3, job id queued
    (SQS -> solver Lambda: run_job)           result stored in S3
    GET  /api/jobs/{id}    -> {status, result?, error?}

Small requests run inline so sweeps don't pay the polling delay. Field jobs
run in the solver Lambda too: its image contains the postprocessor code, and
its 15 min timeout and queue already exist.

Costs (see terraform/environments/staging/async_jobs.tf): the queue, job
records and S3 objects stay within free tiers at classroom scale; the solve
itself costs the same Lambda time as a synchronous solve. With ASYNC_JOBS=off
(default) nothing of this is deployed.

Job records live under USER#<id> (so account deletion and retention remove
them) and expire after JOB_TTL_DAYS via the table's TTL attribute; their S3
objects (results/job-<id>/) expire through a bucket lifecycle rule.
"""

import json
import logging
import os
import time
import traceback
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

import boto3

from backend.common.storage.factory import get_storage_provider
from backend.common.storage.provider import ResultType

logger = logging.getLogger(__name__)

JOB_TTL_DAYS = 7
QUEUED, RUNNING, DONE, FAILED = "queued", "running", "done", "failed"

# Requests estimated below this run inline: well under CloudFront's 60 s,
# leaving room for a cold start and an estimate that is off by 2x.
INLINE_MAX_SECONDS = 20.0
# estimate_solve_time matches a single BLAS thread on a desktop CPU (~1 s at
# 100 edges, ~15 s at 400); the 2 GB Lambda is slower.
LAMBDA_SLOWDOWN = 2.0


@dataclass(frozen=True)
class JobKind:
    """How to validate, estimate and run one kind of job."""

    parse: Callable[[Dict[str, Any]], Any]
    estimate_seconds: Callable[[Any], float]
    run: Callable[[Any], Dict[str, Any]]


def _solve_kind() -> JobKind:
    from backend.solver.main import solve_multi_request
    from backend.solver.schemas import MultiAntennaRequest
    from backend.solver.services.estimation import estimate_solve_time

    def estimate(r: MultiAntennaRequest) -> float:
        n_edges = sum(len(a.edges) for a in r.antennas)
        # A ground plane adds the coupling to every image: twice the matrix fill
        images = 2.0 if r.config.ground_plane else 1.0
        return images * LAMBDA_SLOWDOWN * estimate_solve_time(n_edges)["estimated_seconds"]

    return JobKind(
        parse=lambda payload: MultiAntennaRequest(**payload),
        estimate_seconds=estimate,
        run=lambda r: json.loads(solve_multi_request(r).model_dump_json()),
    )


def _near_field_kind() -> JobKind:
    from backend.postprocessor.compute import estimate_near_field, field_edges, near_field_result
    from backend.postprocessor.models import FieldRequest

    return JobKind(
        parse=lambda payload: FieldRequest(**payload),
        estimate_seconds=lambda r: estimate_near_field(
            len(r.observation_points), field_edges(r), len(r.frequencies)
        )["estimated_seconds"],
        run=near_field_result,
    )


def _far_field_kind() -> JobKind:
    from backend.postprocessor.compute import estimate_far_field_seconds, far_field_result
    from backend.postprocessor.models import FarFieldRequest

    return JobKind(
        parse=lambda payload: FarFieldRequest(**payload),
        estimate_seconds=estimate_far_field_seconds,
        run=lambda r: json.loads(far_field_result(r).model_dump_json()),
    )


_KINDS = {"solve": _solve_kind, "near_field": _near_field_kind, "far_field": _far_field_kind}


def job_kind(name: str) -> JobKind:
    return _KINDS[name]()


def jobs_enabled() -> bool:
    return os.getenv("ASYNC_JOBS", "off").lower() == "lambda"


def _storage_key(job_id: str) -> str:
    return f"job-{job_id}"


class JobStore:
    def __init__(self, table=None, storage=None, sqs=None):
        self._table = table
        self.storage = storage or get_storage_provider()
        self._sqs = sqs

    @property
    def table(self):
        if self._table is None:
            name = os.getenv("DYNAMODB_TABLE_NAME", "antenna-simulator-staging")
            endpoint = os.getenv("DYNAMODB_ENDPOINT_URL")
            resource = (
                boto3.resource("dynamodb", endpoint_url=endpoint)
                if endpoint
                else boto3.resource("dynamodb")
            )
            self._table = resource.Table(name)
        return self._table

    @property
    def sqs(self):
        if self._sqs is None:
            self._sqs = boto3.client("sqs")
        return self._sqs

    @staticmethod
    def _key(user_id: str, job_id: str) -> Dict[str, str]:
        return {"PK": f"USER#{user_id}", "SK": f"JOB#{job_id}"}

    async def submit(
        self, user_id: str, request: Dict[str, Any], tokens_charged: int, kind: str = "solve"
    ) -> str:
        job_id = str(uuid.uuid4())
        await self.storage.store_result(_storage_key(job_id), ResultType.JOB_REQUEST, request)
        self.table.put_item(
            Item={
                **self._key(user_id, job_id),
                "EntityType": "JOB",
                "JobId": job_id,
                "Kind": kind,
                "Status": QUEUED,
                "TokensCharged": tokens_charged,
                "CreatedAt": datetime.now(timezone.utc).isoformat(),
                "TTL": int(time.time()) + JOB_TTL_DAYS * 86400,
            }
        )
        self.sqs.send_message(
            QueueUrl=os.environ["JOBS_QUEUE_URL"],
            MessageBody=json.dumps({"job_id": job_id, "user_id": user_id}),
        )
        return job_id

    def get(self, user_id: str, job_id: str) -> Optional[Dict[str, Any]]:
        return self.table.get_item(Key=self._key(user_id, job_id)).get("Item")

    def set_status(self, user_id: str, job_id: str, status: str, error: Optional[str] = None):
        values: Dict[str, Any] = {":s": status, ":t": datetime.now(timezone.utc).isoformat()}
        expr = "SET #st = :s, UpdatedAt = :t"
        if error is not None:
            expr += ", #err = :e"
            values[":e"] = error[:2000]
        self.table.update_item(
            Key=self._key(user_id, job_id),
            UpdateExpression=expr,
            ExpressionAttributeNames={
                "#st": "Status",
                **({"#err": "Error"} if error is not None else {}),
            },
            ExpressionAttributeValues=values,
        )

    async def result(self, job_id: str) -> Optional[Dict[str, Any]]:
        return await self.storage.get_result(_storage_key(job_id), ResultType.SOLVER_RESULTS)


async def run_job(job_id: str, user_id: str, store: Optional[JobStore] = None) -> None:
    """Worker: run one queued job (called for each SQS record)."""
    from backend.common.repositories.user_repository import UserRepository

    store = store or JobStore()
    job = store.get(user_id, job_id)
    if job is None or job.get("Status") in (DONE, FAILED):
        return  # expired, deleted with the account, or a duplicate delivery
    store.set_status(user_id, job_id, RUNNING)
    try:
        payload = await store.storage.get_result(_storage_key(job_id), ResultType.JOB_REQUEST)
        kind = job_kind(job.get("Kind", "solve"))  # jobs queued before kinds were solves
        result = kind.run(kind.parse(payload))
        await store.storage.store_result(_storage_key(job_id), ResultType.SOLVER_RESULTS, result)
        store.set_status(user_id, job_id, DONE)
    except Exception as exc:  # the job fails, the queue message is consumed
        logger.error("Job %s failed: %s\n%s", job_id, exc, traceback.format_exc())
        store.set_status(user_id, job_id, FAILED, error=str(exc) or type(exc).__name__)
        charged = int(job.get("TokensCharged", 0))
        if charged:
            UserRepository().refund_user_tokens(user_id, charged)
