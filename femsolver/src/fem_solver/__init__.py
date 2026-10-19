"""fem_solver — a transparent finite element solver for teaching (2D electrostatics, P1)."""

from .electrostatics import ElectrostaticsResult, SetupError, SolveInfo, solve
from .problem import (
    EPSILON_0,
    ChargeDensity,
    Electrostatics,
    Ground,
    Issue,
    Material,
    Potential,
    SurfaceChargeDensity,
    check,
)

__all__ = [
    "EPSILON_0",
    "ChargeDensity",
    "Electrostatics",
    "ElectrostaticsResult",
    "Ground",
    "Issue",
    "Material",
    "Potential",
    "SetupError",
    "SolveInfo",
    "SurfaceChargeDensity",
    "check",
    "solve",
]
