"""
Data models for the Antenna Simulator.

This module contains Pydantic models for all data structures
used throughout the application.
"""

from .geometry import Geometry, AntennaElement, Mesh, Source, LumpedElement
from .project import Project, ProjectStatus
from .solver import SolverJob, SolverConfig, SolverResult
from .postprocessor import PostprocessorResult, ImpedanceResult, FieldResult, DirectivityResult

__all__ = [
    # Geometry models
    "Geometry",
    "AntennaElement",
    "Mesh",
    "Source",
    "LumpedElement",
    # Project models
    "Project",
    "ProjectStatus",
    # Solver models
    "SolverJob",
    "SolverConfig",
    "SolverResult",
    # Postprocessor models
    "PostprocessorResult",
    "ImpedanceResult",
    "FieldResult",
    "DirectivityResult",
]
