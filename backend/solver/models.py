"""Data models for the PEEC solver service."""

from typing import List, Optional
from pydantic import BaseModel, Field
import numpy as np


class SolverRequest(BaseModel):
    """Request to solve a PEEC system."""
    
    project_id: str = Field(..., description="Project identifier")
    frequency: float = Field(..., gt=0, description="Operating frequency in Hz")
    
    # Mesh data (from preprocessor)
    nodes: List[List[float]] = Field(..., description="Node coordinates [x, y, z]")
    edges: List[List[int]] = Field(..., description="Edge connectivity (0-based indices)")
    radii: List[float] = Field(..., description="Wire radius for each edge in meters")
    
    # Source configuration (1-based node indices)
    source_node_start: int = Field(..., description="Source start node (1-based)")
    source_node_end: int = Field(..., description="Source end node (1-based)")
    source_type: str = Field(..., description="Source type: 'voltage' or 'current'")
    source_amplitude: complex = Field(..., description="Source amplitude (V or A)")
    
    class Config:
        json_encoders = {
            complex: lambda v: {"real": v.real, "imag": v.imag}
        }


class SolverResult(BaseModel):
    """Result from PEEC solver."""
    
    project_id: str = Field(..., description="Project identifier")
    frequency: float = Field(..., description="Operating frequency in Hz")
    
    # Solution data
    branch_currents: List[complex] = Field(..., description="Current in each edge (A)")
    node_voltages: Optional[List[complex]] = Field(None, description="Node voltages (V)")
    
    # Input parameters
    input_impedance: Optional[complex] = Field(None, description="Input impedance at source (Ohm)")
    input_power: Optional[float] = Field(None, description="Input power (W)")
    
    # Convergence info
    converged: bool = Field(..., description="Whether solution converged")
    iterations: Optional[int] = Field(None, description="Number of iterations")
    residual: Optional[float] = Field(None, description="Final residual norm")
    
    class Config:
        json_encoders = {
            complex: lambda v: {"real": v.real, "imag": v.imag}
        }


class MatrixInfo(BaseModel):
    """Information about assembled PEEC matrices."""
    
    num_edges: int = Field(..., description="Number of edges in mesh")
    num_nodes: int = Field(..., description="Number of nodes in mesh")
    
    # Matrix sizes
    L_matrix_shape: tuple = Field(..., description="Shape of inductance matrix (N_edges, N_edges)")
    P_matrix_shape: tuple = Field(..., description="Shape of potential coefficient matrix (N_edges, N_nodes)")
    
    # Condition numbers (for debugging)
    L_condition_number: Optional[float] = Field(None, description="Condition number of L matrix")
    system_condition_number: Optional[float] = Field(None, description="Condition number of full system")
    
    class Config:
        arbitrary_types_allowed = True
