"""FastAPI application for the FEM Postprocessor service."""

from datetime import datetime, timezone

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse, Response

from backend.common.auth.dependencies import get_current_user
from backend.common.auth.identity import UserIdentity
from backend.common.auth.token_dependency import TokenCheckResult, require_simulation_tokens
from backend.common.utils.error_handler import install_error_handlers
from backend.common.utils.logging_config import configure_logging

from .config import settings
from .export import export_csv_scalar, export_vtk
from .line_evaluation import sample_field_along_line
from .point_probe import probe_field_at_point
from .schemas import (
    CSVExportRequest,
    FieldVisualizationRequest,
    LinePlotRequest,
    LinePlotResponse,
    PointProbeRequest,
    PointProbeResponse,
    VTKExportRequest,
)
from .visualization import prepare_scalar_field, prepare_vector_field

logger = configure_logging("fem-postprocessor")

app = FastAPI(
    title="FEM Postprocessor Service",
    description="Visualization data, line plots, probes, and export for FEM results",
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

app.add_middleware(GZipMiddleware, minimum_size=1000)

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
    f"{settings.api_prefix}/fem/postprocess/field",
    tags=["FEM Visualization"],
)
async def get_field_data(
    request: FieldVisualizationRequest,
    user: UserIdentity = Depends(get_current_user),
    _tokens: TokenCheckResult = Depends(require_simulation_tokens(0)),
):
    """Prepare field data for WebGL rendering."""
    # Check scalar fields
    if request.field_name in request.scalar_fields:
        field = request.scalar_fields[request.field_name]
        data = prepare_scalar_field(request.mesh, field)
        data["field_name"] = request.field_name
        return data

    # Check vector fields
    if request.field_name in request.vector_fields:
        field = request.vector_fields[request.field_name]
        data = prepare_vector_field(request.mesh, field)
        data["field_name"] = request.field_name
        return data

    raise HTTPException(
        status_code=400,
        detail=f"Field '{request.field_name}' not found in scalar_fields or vector_fields",
    )


@app.post(
    f"{settings.api_prefix}/fem/postprocess/line-plot",
    response_model=LinePlotResponse,
    tags=["FEM Visualization"],
)
async def get_line_plot(
    request: LinePlotRequest,
    user: UserIdentity = Depends(get_current_user),
    _tokens: TokenCheckResult = Depends(require_simulation_tokens(0)),
):
    """Sample a field along a line for line-plot visualization."""
    if request.field_name not in request.scalar_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Scalar field '{request.field_name}' not found",
        )

    field = request.scalar_fields[request.field_name]
    try:
        distances, values = sample_field_along_line(
            mesh=request.mesh,
            field=field,
            start=request.start_point,
            end=request.end_point,
            num_points=min(request.num_points, settings.max_line_plot_points),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return LinePlotResponse(distances=distances, values=values, field_name=request.field_name)


@app.post(
    f"{settings.api_prefix}/fem/postprocess/point-probe",
    response_model=PointProbeResponse,
    tags=["FEM Visualization"],
)
async def get_point_probe(
    request: PointProbeRequest,
    user: UserIdentity = Depends(get_current_user),
    _tokens: TokenCheckResult = Depends(require_simulation_tokens(0)),
):
    """Probe a field value at a specific point."""
    if request.field_name not in request.scalar_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Scalar field '{request.field_name}' not found",
        )

    field = request.scalar_fields[request.field_name]
    try:
        value = probe_field_at_point(
            mesh=request.mesh,
            field=field,
            point=request.point,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return PointProbeResponse(value=value, point=request.point, field_name=request.field_name)


@app.post(
    f"{settings.api_prefix}/fem/postprocess/export/vtk",
    tags=["FEM Export"],
)
async def export_vtk_endpoint(
    request: VTKExportRequest,
    user: UserIdentity = Depends(get_current_user),
    _tokens: TokenCheckResult = Depends(require_simulation_tokens(0)),
):
    """Export mesh and fields to VTK legacy format."""
    from backend.common.models.fem.results import FEMSolverResult

    result = FEMSolverResult(
        scalar_fields=request.scalar_fields,
        vector_fields=request.vector_fields,
        integrals=[],
        n_dofs=len(request.mesh.nodes),
        n_elements=len(request.mesh.elements),
        solve_time=0.0,
    )
    vtk_content = export_vtk(request.mesh, result)
    return Response(
        content=vtk_content,
        media_type="application/octet-stream",
        headers={"Content-Disposition": "attachment; filename=fem_result.vtk"},
    )


@app.post(
    f"{settings.api_prefix}/fem/postprocess/export/csv",
    tags=["FEM Export"],
)
async def export_csv_endpoint(
    request: CSVExportRequest,
    user: UserIdentity = Depends(get_current_user),
    _tokens: TokenCheckResult = Depends(require_simulation_tokens(0)),
):
    """Export a scalar field to CSV format."""
    if request.field_name not in request.scalar_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Scalar field '{request.field_name}' not found",
        )

    field = request.scalar_fields[request.field_name]
    csv_content = export_csv_scalar(request.mesh, field)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={request.field_name}.csv"},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.fem_postprocessor.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
