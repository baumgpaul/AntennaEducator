"""Request/response schemas for the FDTD Preprocessor service."""

from pydantic import BaseModel, Field

from backend.common.models.fdtd import FdtdConfig, FdtdGeometry


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------
class FdtdMeshRequest(BaseModel):
    """Request for FDTD Yee grid generation."""

    geometry: FdtdGeometry = Field(description="FDTD domain geometry definition")


class FdtdValidationRequest(BaseModel):
    """Request for FDTD setup validation."""

    geometry: FdtdGeometry = Field(description="FDTD domain geometry definition")
    config: FdtdConfig = Field(description="FDTD solver configuration")


# ---------------------------------------------------------------------------
# Response schemas
# ---------------------------------------------------------------------------
class FdtdMeshResponse(BaseModel):
    """Response from FDTD mesh generation."""

    nx: int = Field(description="Grid cells in x")
    ny: int = Field(description="Grid cells in y")
    nz: int = Field(description="Grid cells in z")
    dx: float = Field(description="Cell size in x [m]")
    dy: float = Field(description="Cell size in y [m]")
    dz: float = Field(description="Cell size in z [m]")
    total_cells: int = Field(description="Total number of grid cells")
    structures_applied: int = Field(description="Number of structures applied")
    sources: list[dict] = Field(description="Source placement info")
    boundaries: dict = Field(description="Boundary condition info per face")
    message: str = Field(description="Status message")


class FdtdValidationResponse(BaseModel):
    """Response from FDTD setup validation."""

    valid: bool = Field(description="Whether the setup is valid (no errors)")
    warnings: list[str] = Field(default_factory=list, description="Non-fatal issues")
    errors: list[str] = Field(default_factory=list, description="Fatal issues")
    nx: int = Field(description="Grid cells in x")
    ny: int = Field(description="Grid cells in y")
    nz: int = Field(description="Grid cells in z")
    dt: float = Field(description="Computed time step [s]")
    total_cells: int = Field(description="Total number of grid cells")
