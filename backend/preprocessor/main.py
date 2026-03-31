"""FastAPI application for the Preprocessor service."""

from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.common.auth.dependencies import get_current_user
from backend.common.auth.identity import UserIdentity
from backend.common.auth.token_dependency import TokenCheckResult, require_simulation_tokens
from backend.common.utils.expressions import ExpressionError

from .builders import (
    create_dipole,
    create_loop,
    create_rod,
    dipole_to_mesh,
    loop_to_mesh,
    rod_to_mesh,
)
from .config import settings
from .schemas import (
    DipoleRequest,
    GeometryResponse,
    LoopRequest,
    LumpedElementRequest,
    RodRequest,
    SourceRequest,
)

app = FastAPI(
    title="PEEC Antenna Simulator - Preprocessor Service",
    description="Geometry definition and mesh generation service",
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


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _convert_source(source: SourceRequest | None) -> dict | None:
    """Convert a SourceRequest schema to the dict format expected by builders."""
    if source is None:
        return None
    return {
        "type": source.type,
        "amplitude": {"real": source.amplitude.real, "imag": source.amplitude.imag},
        "position": source.position,
        "series_R": source.series_R,
        "series_L": source.series_L,
        "series_C_inv": source.series_C_inv,
        "tag": source.tag,
    }


def _convert_lumped_elements(
    elements: list[LumpedElementRequest],
) -> list[dict] | None:
    """Convert LumpedElementRequest list to builder dict format."""
    if not elements:
        return None
    return [
        {
            "type": le.type,
            "R": le.R,
            "L": le.L,
            "C_inv": le.C_inv,
            "node_start": le.node_start,
            "node_end": le.node_end,
            "tag": le.tag,
        }
        for le in elements
    ]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
async def health_check():
    """Health check endpoint."""
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
    f"{settings.api_prefix}/antenna/dipole",
    response_model=GeometryResponse,
    tags=["Antenna Builders"],
)
async def create_dipole_antenna(
    request: DipoleRequest,
    user: UserIdentity = Depends(get_current_user),
    _tokens: TokenCheckResult = Depends(require_simulation_tokens(1)),
):
    """Create a dipole antenna element and generate its mesh."""
    try:
        element = create_dipole(
            length=request.length,
            center_position=request.center_position,
            orientation=request.orientation,
            wire_radius=request.wire_radius,
            gap=request.gap,
            segments=request.segments,
            source=_convert_source(request.source),
            lumped_elements=_convert_lumped_elements(request.lumped_elements),
            name=request.name,
        )
        mesh = dipole_to_mesh(element)
        return GeometryResponse(
            element=element.model_dump(),
            mesh=mesh.model_dump(),
            message=f"Dipole antenna created: {element.name}",
        )
    except (ValueError, ExpressionError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@app.post(
    f"{settings.api_prefix}/antenna/loop",
    response_model=GeometryResponse,
    tags=["Antenna Builders"],
)
async def create_loop_antenna(
    request: LoopRequest,
    user: UserIdentity = Depends(get_current_user),
    _tokens: TokenCheckResult = Depends(require_simulation_tokens(1)),
):
    """Create a circular loop antenna element and generate its mesh."""
    try:
        element = create_loop(
            radius=request.radius,
            center_position=request.center_position,
            normal_vector=request.normal_vector,
            wire_radius=request.wire_radius,
            gap=request.gap,
            segments=request.segments,
            source=_convert_source(request.source),
            lumped_elements=_convert_lumped_elements(request.lumped_elements),
            name=request.name,
        )
        mesh = loop_to_mesh(element)
        return GeometryResponse(
            element=element.model_dump(),
            mesh=mesh.model_dump(),
            message=f"Loop antenna created: {element.name}",
        )
    except (ValueError, ExpressionError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@app.post(
    f"{settings.api_prefix}/antenna/rod",
    response_model=GeometryResponse,
    tags=["Antenna Builders"],
)
async def create_rod_antenna(
    request: RodRequest,
    user: UserIdentity = Depends(get_current_user),
    _tokens: TokenCheckResult = Depends(require_simulation_tokens(1)),
):
    """Create a rod (monopole) antenna element and generate its mesh."""
    try:
        element = create_rod(
            length=request.length,
            base_position=request.base_position,
            orientation=request.orientation,
            wire_radius=request.wire_radius,
            segments=request.segments,
            source=_convert_source(request.source),
            lumped_elements=_convert_lumped_elements(request.lumped_elements),
            name=request.name,
        )
        mesh = rod_to_mesh(element)
        return GeometryResponse(
            element=element.model_dump(),
            mesh=mesh.model_dump(),
            message=f"Rod antenna created: {element.name}",
        )
    except (ValueError, ExpressionError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.preprocessor.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
