"""
Data models for the Antenna Simulator.

This module contains Pydantic models for all data structures
used throughout the application.
"""

from .geometry import AntennaElement, LumpedElement, Mesh, Source
from .solver_results import (
    FrequencyPointResult,
    PortResult,
    SolverType,
    SweepResultEnvelope,
)
from .variables import Variable, VariableContext, default_variable_context

__all__ = [
    "AntennaElement",
    "Mesh",
    "Source",
    "LumpedElement",
    "SolverType",
    "PortResult",
    "FrequencyPointResult",
    "SweepResultEnvelope",
    "Variable",
    "VariableContext",
    "default_variable_context",
]
