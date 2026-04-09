"""Lambda handler for FEM Postprocessor Service."""

from mangum import Mangum

from backend.fem_postprocessor.main import app

handler = Mangum(app, lifespan="off")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8006)
