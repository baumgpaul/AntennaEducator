"""FastAPI application for the Preprocessor service."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime

from .config import settings

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


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "backend.preprocessor.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
