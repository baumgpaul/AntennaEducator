"""Lambda handler for FEM Solver Service."""

from mangum import Mangum

from backend.fem_solver.main import app

handler = Mangum(app, lifespan="off")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8005)
