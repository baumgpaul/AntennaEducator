"""Lambda handler for Projects Service.

This module wraps the FastAPI application with Mangum to enable AWS Lambda execution.
Mangum translates API Gateway/ALB events into ASGI-compatible requests.
Scheduled EventBridge events (``source: aws.events``) run the data-retention job.
"""

from mangum import Mangum

from backend.common.utils.lambda_loop import run_coroutine
from backend.projects.main import app

# Create Lambda handler
# Mangum automatically handles:
# - API Gateway REST API events
# - API Gateway HTTP API events
# - Application Load Balancer events
# - Lambda Function URL events
_http_handler = Mangum(app, lifespan="off")


def handler(event, context):
    if isinstance(event, dict) and event.get("source") == "aws.events":
        return run_coroutine(_run_retention())
    return _http_handler(event, context)


async def _run_retention():
    from backend.common.auth import create_auth_provider
    from backend.common.repositories.factory import get_project_repository
    from backend.projects.documentation_service import get_documentation_service
    from backend.projects.results_service import get_results_service
    from backend.projects.retention import run_retention

    return await run_retention(
        get_project_repository().table,
        get_results_service(),
        get_documentation_service(),
        create_auth_provider(),
    )


# For testing/debugging
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
