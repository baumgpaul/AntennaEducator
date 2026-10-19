"""Lambda handler for the FEM service (FastAPI app behind Mangum)."""

from mangum import Mangum

from backend.fem.main import app

handler = Mangum(app, lifespan="off")
