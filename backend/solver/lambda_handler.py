"""Lambda handler for Solver Service.

This module wraps the FastAPI application with Mangum to enable AWS Lambda execution.
Mangum translates API Gateway/ALB events into ASGI-compatible requests.
"""

import json

from mangum import Mangum

from backend.common.utils.lambda_loop import run_coroutine
from backend.solver.main import app

# Create Lambda handler
# Mangum automatically handles:
# - API Gateway REST API events
# - API Gateway HTTP API events
# - Application Load Balancer events
# - Lambda Function URL events
_http_handler = Mangum(app, lifespan="off")


def handler(event, context):
    """HTTP requests (Function URL) or queued solve jobs (SQS, ASYNC_JOBS=lambda)."""
    records = event.get("Records") if isinstance(event, dict) else None
    if records and records[0].get("eventSource") == "aws:sqs":
        return run_coroutine(_run_jobs(records))
    return _http_handler(event, context)


async def _run_jobs(records):
    from backend.solver.jobs import run_job

    for record in records:
        msg = json.loads(record["body"])
        await run_job(msg["job_id"], msg["user_id"])
    return {"batchItemFailures": []}


# For testing/debugging
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8002)
