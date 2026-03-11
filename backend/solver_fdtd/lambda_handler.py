"""Lambda handler for FDTD Solver Service.

This module wraps the FastAPI application with Mangum to enable AWS Lambda execution.
Mangum translates API Gateway/ALB events into ASGI-compatible requests.
"""

from mangum import Mangum

from backend.solver_fdtd.main import app

# Create Lambda handler
# Mangum automatically handles:
# - API Gateway REST API events
# - API Gateway HTTP API events
# - Application Load Balancer events
handler = Mangum(app, lifespan="off")
