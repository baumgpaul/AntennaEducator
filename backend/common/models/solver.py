"""
Solver-related data models.
"""

from typing import Optional, Literal, List
from pydantic import BaseModel, Field, field_validator
from uuid import UUID, uuid4
from datetime import datetime
from enum import Enum


class SolverMethod(str, Enum):
    """Solver method enumeration."""
    DIRECT = "direct"
    ITERATIVE = "iterative"


class SolverJobType(str, Enum):
    """Solver job type enumeration."""
    SINGLE_FREQUENCY = "single_frequency"
    FREQUENCY_SWEEP = "frequency_sweep"
    TIME_DOMAIN = "time_domain"


class SolverJobStatus(str, Enum):
    """Solver job status enumeration."""
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class SolverConfig(BaseModel):
    """
    Configuration for solver execution.
    """
    method: SolverMethod = Field(
        default=SolverMethod.DIRECT,
        description="Solver method (direct or iterative)"
    )
    tolerance: float = Field(
        default=1e-6,
        description="Convergence tolerance for iterative methods",
        gt=0
    )
    max_iterations: int = Field(
        default=1000,
        description="Maximum iterations for iterative methods",
        gt=0
    )
    preconditioner: Literal["none", "jacobi", "ilu"] = Field(
        default="none",
        description="Preconditioner for iterative methods"
    )
    parallel: bool = Field(
        default=True,
        description="Enable parallel execution for frequency sweeps"
    )
    memory_strategy: Literal["full_matrix", "sparse"] = Field(
        default="sparse",
        description="Matrix storage strategy"
    )


class FrequencyConfig(BaseModel):
    """
    Configuration for frequency specification.
    """
    frequency: Optional[float] = Field(
        default=None,
        description="Single frequency in Hz",
        gt=0
    )
    frequency_start: Optional[float] = Field(
        default=None,
        description="Start frequency for sweep in Hz",
        gt=0
    )
    frequency_stop: Optional[float] = Field(
        default=None,
        description="Stop frequency for sweep in Hz",
        gt=0
    )
    num_points: Optional[int] = Field(
        default=None,
        description="Number of frequency points",
        gt=1
    )
    scale: Literal["linear", "log"] = Field(
        default="linear",
        description="Frequency sweep scale"
    )
    
    @field_validator("frequency_stop")
    def validate_frequency_range(cls, v, info):
        """Validate that stop frequency is greater than start frequency."""
        if v is not None and info.data.get("frequency_start") is not None:
            if v <= info.data["frequency_start"]:
                raise ValueError("frequency_stop must be greater than frequency_start")
        return v


class SolverJob(BaseModel):
    """
    Solver job definition and tracking.
    """
    id: UUID = Field(default_factory=uuid4)
    project_id: UUID = Field(description="Parent project ID")
    type: SolverJobType = Field(
        description="Type of solver job"
    )
    frequency_config: FrequencyConfig = Field(
        description="Frequency configuration for the simulation"
    )
    solver_config: SolverConfig = Field(
        default_factory=SolverConfig,
        description="Solver configuration"
    )
    status: SolverJobStatus = Field(
        default=SolverJobStatus.QUEUED,
        description="Current job status"
    )
    progress: float = Field(
        default=0.0,
        description="Progress percentage [0.0, 1.0]",
        ge=0.0,
        le=1.0
    )
    started_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp when job started"
    )
    completed_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp when job completed"
    )
    error_message: Optional[str] = Field(
        default=None,
        description="Error message if job failed"
    )
    result_location: Optional[str] = Field(
        default=None,
        description="Storage location of results (S3 key or file path)"
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {
            UUID: str,
            datetime: lambda v: v.isoformat()
        }
    
    def start(self) -> None:
        """Mark job as started."""
        self.status = SolverJobStatus.RUNNING
        self.started_at = datetime.utcnow()
    
    def complete(self, result_location: str) -> None:
        """Mark job as completed."""
        self.status = SolverJobStatus.COMPLETED
        self.completed_at = datetime.utcnow()
        self.progress = 1.0
        self.result_location = result_location
    
    def fail(self, error_message: str) -> None:
        """Mark job as failed."""
        self.status = SolverJobStatus.FAILED
        self.completed_at = datetime.utcnow()
        self.error_message = error_message


class SolverResult(BaseModel):
    """
    Solver results metadata (actual arrays stored externally).
    """
    job_id: UUID = Field(description="Parent job ID")
    frequencies: List[float] = Field(
        description="Frequency points [Hz]"
    )
    num_segments: int = Field(
        description="Number of segments in the mesh",
        gt=0
    )
    num_nodes: int = Field(
        description="Number of nodes in the mesh",
        gt=0
    )
    storage_location: str = Field(
        description="Location where result arrays are stored"
    )
    convergence_info: dict = Field(
        default_factory=dict,
        description="Convergence information from solver"
    )
    computation_time: float = Field(
        description="Total computation time in seconds",
        ge=0
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {
            UUID: str,
            datetime: lambda v: v.isoformat()
        }


class SolverJobCreate(BaseModel):
    """Schema for creating a solver job."""
    project_id: UUID
    type: SolverJobType
    frequency_config: FrequencyConfig
    solver_config: Optional[SolverConfig] = Field(
        default_factory=SolverConfig
    )


class SolverJobResponse(BaseModel):
    """Schema for solver job API responses."""
    id: UUID
    project_id: UUID
    type: SolverJobType
    frequency_config: FrequencyConfig
    solver_config: SolverConfig
    status: SolverJobStatus
    progress: float
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error_message: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True
        json_encoders = {
            UUID: str,
            datetime: lambda v: v.isoformat()
        }
