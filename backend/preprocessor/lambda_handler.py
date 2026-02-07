"""Lambda handler for Preprocessor Service.

This module wraps the FastAPI application with Mangum to enable AWS Lambda execution.
Mangum translates API Gateway/ALB events into ASGI-compatible requests.
"""

from mangum import Mangum

from backend.preprocessor.main import app

# Create Lambda handler
# Mangum automatically handles:
# - API Gateway REST API events
# - API Gateway HTTP API events
# - Application Load Balancer events
# - Lambda Function URL events
handler = Mangum(app, lifespan="off")

# For testing/debugging
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)
