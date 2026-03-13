"""Lambda handler for FDTD Postprocessor Service.

Wraps the FastAPI application with Mangum for AWS Lambda execution.
"""

from mangum import Mangum

from backend.fdtd_postprocessor.main import app

handler = Mangum(app, lifespan="off")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8006)
