"""FastAPI application for the Preprocessor service."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime

from .config import settings
from .schemas import DipoleRequest, GeometryResponse
from .builders import create_dipole, dipole_to_mesh

# Initialize FastAPI application
app = FastAPI(
    title="PEEC Antenna Simulator - Preprocessor Service",
    description="Geometry definition and mesh generation service",
    version=settings.version,
    docs_url=f"{settings.api_prefix}/docs",
    redoc_url=f"{settings.api_prefix}/redoc",
    openapi_url=f"{settings.api_prefix}/openapi.json",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.cors_credentials,
    allow_methods=settings.cors_methods,
    allow_headers=settings.cors_headers,
)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return JSONResponse(
        status_code=200,
        content={
            "status": "healthy",
            "service": settings.service_name,
            "version": settings.version,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )


@app.get(f"{settings.api_prefix}/status")
async def get_status():
    """Get service status and configuration."""
    return {
        "service": settings.service_name,
        "version": settings.version,
        "debug": settings.debug,
        "endpoints": {
            "health": "/health",
            "docs": f"{settings.api_prefix}/docs",
            "openapi": f"{settings.api_prefix}/openapi.json",
        },
    }


@app.post(
    f"{settings.api_prefix}/antenna/dipole",
    response_model=GeometryResponse,
    tags=["Antenna Builders"],
)
async def create_dipole_antenna(request: DipoleRequest):
    """
    Create a dipole antenna element and generate its mesh.
    
    The dipole is a linear antenna with current flowing along its length.
    An odd number of segments is recommended for center feeding.
    
    Args:
        request: Dipole configuration parameters
    
    Returns:
        GeometryResponse with created element and mesh
    """
    try:
        # Convert source request to dict if present
        source_dict = None
        if request.source:
            source_dict = {
                "type": request.source.type,
                "amplitude": {
                    "real": request.source.amplitude.real,
                    "imag": request.source.amplitude.imag,
                },
                "position": request.source.position,
            }
        
        # Create dipole element
        element = create_dipole(
            length=request.length,
            center_position=request.center_position,
            orientation=request.orientation,
            wire_radius=request.wire_radius,
            gap=request.gap,
            segments=request.segments,
            source=source_dict,
            name=request.name,
        )
        
        # Generate mesh
        mesh = dipole_to_mesh(element)
        
        return GeometryResponse(
            element=element.model_dump(),
            mesh=mesh.model_dump(),
            message=f"Dipole antenna created: {element.name}",
        )
    
    except ValueError as e:
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
