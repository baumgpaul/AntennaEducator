"""FastAPI application for the FEM Solver service."""

from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.common.auth.dependencies import get_current_user
from backend.common.auth.identity import UserIdentity
from backend.common.auth.token_dependency import TokenCheckResult, require_simulation_tokens
from backend.common.models.fem.config import PDEType
from backend.common.utils.error_handler import install_error_handlers
from backend.common.utils.logging_config import configure_logging
from backend.fem.solver.pde.electrostatic import solve_electrostatic

from .config import settings
from .schemas import FEMEstimateRequest, FEMEstimateResponse, FEMSolveRequest

logger = configure_logging("fem-solver")

app = FastAPI(
    title="FEM Solver Service",
    description="Finite element solver for 2D electromagnetic problems",
    version=settings.version,
    docs_url=f"{settings.api_prefix}/docs",
    redoc_url=f"{settings.api_prefix}/redoc",
    openapi_url=f"{settings.api_prefix}/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.cors_credentials,
    allow_methods=settings.cors_methods,
    allow_headers=settings.cors_headers,
)

install_error_handlers(app)


@app.get("/health")
async def health_check():
    return JSONResponse(
        status_code=200,
        content={
            "status": "healthy",
            "service": settings.service_name,
            "version": settings.version,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


_PDE_SOLVERS = {
    PDEType.ELECTROSTATIC: solve_electrostatic,
}


@app.post(
    f"{settings.api_prefix}/fem/solve",
    tags=["FEM Solver"],
)
async def solve(
    request: FEMSolveRequest,
    user: UserIdentity = Depends(get_current_user),
    _tokens: TokenCheckResult = Depends(require_simulation_tokens(5)),
):
    """Solve a FEM problem."""
    solver_fn = _PDE_SOLVERS.get(request.pde_type)
    if solver_fn is None:
        raise HTTPException(
            status_code=400,
            detail=f"PDE type '{request.pde_type.value}' is not yet supported. "
            f"Supported: {[p.value for p in _PDE_SOLVERS]}",
        )

    try:
        result = solver_fn(
            mesh=request.mesh,
            materials=request.materials,
            boundary_conditions=request.boundary_conditions,
            config=request.config,
        )
        return result.model_dump()
    except KeyError as e:
        raise HTTPException(status_code=400, detail=f"Material not found: {e}")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("FEM solve failed")
        raise HTTPException(status_code=500, detail=f"Solve failed: {str(e)}")


@app.post(
    f"{settings.api_prefix}/fem/solve/estimate",
    response_model=FEMEstimateResponse,
    tags=["FEM Solver"],
)
async def estimate(
    request: FEMEstimateRequest,
    user: UserIdentity = Depends(get_current_user),
    _tokens: TokenCheckResult = Depends(require_simulation_tokens(0)),
):
    """Estimate solve time and memory requirements."""
    n_dofs = len(request.mesh.nodes)
    n_elements = len(request.mesh.elements)

    # Rough estimates: O(n^2) time for direct, O(n*sqrt(n)) for iterative
    if request.config.solver_type.value == "direct":
        estimated_time = n_dofs**2 * 1e-8
    else:
        estimated_time = n_dofs * n_dofs**0.5 * 1e-8

    # Memory: sparse matrix ~10*n_dofs entries * 8 bytes each + vectors
    estimated_memory_mb = (10 * n_dofs * 8 + n_dofs * 8 * 3) / (1024 * 1024)

    return FEMEstimateResponse(
        n_dofs=n_dofs,
        n_elements=n_elements,
        estimated_time=max(estimated_time, 0.001),
        estimated_memory_mb=max(estimated_memory_mb, 0.01),
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.fem_solver.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
