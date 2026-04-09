"""FastAPI application for the FEM Preprocessor service."""

from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.common.auth.dependencies import get_current_user
from backend.common.auth.identity import UserIdentity
from backend.common.auth.token_dependency import TokenCheckResult, require_simulation_tokens
from backend.common.utils.error_handler import install_error_handlers
from backend.common.utils.logging_config import configure_logging

from .config import settings
from .mesher.gmsh_mesher import GmshMesher
from .schemas import MeshGenerateRequest, MeshImportRequest, MeshResponse

logger = configure_logging("fem-preprocessor")

app = FastAPI(
    title="FEM Preprocessor Service",
    description="Geometry-to-mesh pipeline for 2D FEM analysis",
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


@app.post(
    f"{settings.api_prefix}/fem/mesh/generate",
    response_model=MeshResponse,
    tags=["FEM Meshing"],
)
async def generate_mesh(
    request: MeshGenerateRequest,
    user: UserIdentity = Depends(get_current_user),
    _tokens: TokenCheckResult = Depends(require_simulation_tokens(1)),
):
    """Generate a FEM mesh from parametric geometry."""
    if not request.geometry.operations:
        raise HTTPException(status_code=400, detail="Geometry has no operations")

    try:
        mesher = GmshMesher()
        mesh = mesher.generate(
            geometry=request.geometry,
            settings=request.discretization,
            variables=request.variables,
        )
        return MeshResponse(
            mesh=mesh,
            message=f"Mesh generated: {len(mesh.nodes)} nodes, {len(mesh.elements)} elements",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Mesh generation failed")
        raise HTTPException(status_code=500, detail=f"Mesh generation failed: {str(e)}")


@app.post(
    f"{settings.api_prefix}/fem/mesh/import",
    response_model=MeshResponse,
    tags=["FEM Meshing"],
)
async def import_mesh(
    request: MeshImportRequest,
    user: UserIdentity = Depends(get_current_user),
    _tokens: TokenCheckResult = Depends(require_simulation_tokens(0)),
):
    """Import a mesh from explicit node/element data."""
    try:
        from backend.common.models.fem.mesh import ElementType, FEMMesh

        mesh = FEMMesh(
            nodes=request.nodes,
            elements=request.elements,
            regions=request.regions,
            boundary_edges=request.boundary_edges,
            element_type=ElementType(request.element_type),
            dimension=request.dimension,
            metadata=request.metadata,
        )
        return MeshResponse(
            mesh=mesh,
            message=f"Mesh imported: {len(mesh.nodes)} nodes, {len(mesh.elements)} elements",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Mesh import failed")
        raise HTTPException(status_code=500, detail=f"Mesh import failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.fem_preprocessor.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
