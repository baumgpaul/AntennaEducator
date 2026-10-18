"""Asynchronous solve jobs (#77), enabled with ASYNC_JOBS=lambda.

CloudFront waits at most 60 s for the API, while the solver Lambda may run
15 minutes. With async jobs the browser submits, then polls:

    POST /api/jobs/solve   -> 202 {job_id}   request stored in S3, job id queued
    (SQS -> solver Lambda: run_job)           result stored in S3
    GET  /api/jobs/{id}    -> {status, result?, error?}

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
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import boto3

from backend.common.storage.factory import get_storage_provider
from backend.common.storage.provider import ResultType

logger = logging.getLogger(__name__)

JOB_TTL_DAYS = 7
QUEUED, RUNNING, DONE, FAILED = "queued", "running", "done", "failed"


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

    async def submit(self, user_id: str, request: Dict[str, Any], tokens_charged: int) -> str:
        job_id = str(uuid.uuid4())
        await self.storage.store_result(_storage_key(job_id), ResultType.JOB_REQUEST, request)
        self.table.put_item(
            Item={
                **self._key(user_id, job_id),
                "EntityType": "JOB",
                "JobId": job_id,
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
    """Worker: solve one queued job (called for each SQS record)."""
    from backend.common.repositories.user_repository import UserRepository
    from backend.solver.main import solve_multi_request
    from backend.solver.schemas import MultiAntennaRequest

    store = store or JobStore()
    job = store.get(user_id, job_id)
    if job is None or job.get("Status") in (DONE, FAILED):
        return  # expired, deleted with the account, or a duplicate delivery
    store.set_status(user_id, job_id, RUNNING)
    try:
        payload = await store.storage.get_result(_storage_key(job_id), ResultType.JOB_REQUEST)
        result = solve_multi_request(MultiAntennaRequest(**payload))
        await store.storage.store_result(
            _storage_key(job_id), ResultType.SOLVER_RESULTS, json.loads(result.model_dump_json())
        )
        store.set_status(user_id, job_id, DONE)
    except Exception as exc:  # the job fails, the queue message is consumed
        logger.error("Job %s failed: %s\n%s", job_id, exc, traceback.format_exc())
        store.set_status(user_id, job_id, FAILED, error=str(exc) or type(exc).__name__)
        charged = int(job.get("TokensCharged", 0))
        if charged:
            UserRepository().refund_user_tokens(user_id, charged)
