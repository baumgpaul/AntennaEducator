"""
Physical constants and default configuration values.

All electromagnetic constants follow SI units.
Import from here — never hardcode physical constants elsewhere.
"""

import numpy as np

# ===========================
# Physical Constants (SI Units)
# ===========================

# Electromagnetic constants
MU_0 = 4 * np.pi * 1e-7  # Permeability of free space [H/m]
EPSILON_0 = 8.854187817e-12  # Permittivity of free space [F/m]
C_0 = 299792458.0  # Speed of light in vacuum [m/s]
Z_0 = 376.73031346177  # Impedance of free space [Ohm]

# Mathematical constants
PI = np.pi
TWO_PI = 2 * np.pi

# Material properties (default: copper)
CONDUCTIVITY_COPPER = 5.96e7  # [S/m]
CONDUCTIVITY_ALUMINUM = 3.5e7  # [S/m]
CONDUCTIVITY_SILVER = 6.3e7  # [S/m]

# ===========================
# Simulation Defaults
# ===========================

# Geometry defaults
DEFAULT_WIRE_RADIUS = 1e-3  # 1 mm [m]
DEFAULT_SEGMENTS_PER_WAVELENGTH = 10
MIN_SEGMENT_LENGTH = 1e-5  # 10 micrometers [m]
MAX_SEGMENT_LENGTH = 0.1  # 10 cm [m]

# Solver defaults
DEFAULT_SOLVER_METHOD = "direct"  # "direct" or "iterative"
DEFAULT_SOLVER_TOLERANCE = 1e-6
DEFAULT_MAX_ITERATIONS = 1000
DEFAULT_FREQUENCY = 1e9  # 1 GHz [Hz]

# Frequency ranges
MIN_FREQUENCY = 1e3  # 1 kHz [Hz]
MAX_FREQUENCY = 100e9  # 100 GHz [Hz]

# Matrix assembly
SPARSE_THRESHOLD = 1000  # Use sparse matrices above this many unknowns

# Postprocessor defaults
DEFAULT_OBSERVATION_DISTANCE = 1.0  # 1 meter [m]
FARFIELD_DISTANCE_FACTOR = 10.0  # r > 10 * lambda for far-field

# Directivity computation
DEFAULT_THETA_POINTS = 37  # 5-degree resolution (0 to 180)
DEFAULT_PHI_POINTS = 73  # 5-degree resolution (0 to 360)

# ===========================
# Numerical Settings
# ===========================

# Tolerances
GEOMETRY_TOLERANCE = 1e-12  # For geometry comparison [m]
CONVERGENCE_TOLERANCE = 1e-6  # For iterative solvers

# Integration
GAUSS_QUADRATURE_ORDER = 5  # For Neumann integrals

# ===========================
# API Configuration
# ===========================

# Pagination
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 1000

# File size limits
MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024  # 100 MB
MAX_RESULT_SIZE_BYTES = 1024 * 1024 * 1024  # 1 GB

# Timeouts
DEFAULT_API_TIMEOUT = 30  # seconds
SOLVER_TIMEOUT = 300  # 5 minutes
POSTPROCESSOR_TIMEOUT = 60  # 1 minute

# ===========================
# Helper Functions
# ===========================


def wavelength(frequency: float) -> float:
    """
    Calculate wavelength for a given frequency.

    Args:
        frequency: Frequency in Hz

    Returns:
        Wavelength in meters
    """
    return C_0 / frequency


def wavenumber(frequency: float) -> float:
    """
    Calculate wavenumber (k = 2π/λ) for a given frequency.

    Args:
        frequency: Frequency in Hz

    Returns:
        Wavenumber in rad/m
    """
    return TWO_PI * frequency / C_0


def skin_depth(frequency: float, conductivity: float = CONDUCTIVITY_COPPER) -> float:
    """
    Calculate skin depth for a conductor at a given frequency.

    Args:
        frequency: Frequency in Hz
        conductivity: Conductivity in S/m (default: copper)

    Returns:
        Skin depth in meters
    """
    omega = TWO_PI * frequency
    return np.sqrt(2 / (omega * MU_0 * conductivity))


def segments_for_wavelength(
    frequency: float, segments_per_wavelength: int = DEFAULT_SEGMENTS_PER_WAVELENGTH
) -> float:
    """
    Calculate recommended segment length for a given frequency.

    Args:
        frequency: Frequency in Hz
        segments_per_wavelength: Number of segments per wavelength

    Returns:
        Recommended segment length in meters
    """
    lambda_ = wavelength(frequency)
    return lambda_ / segments_per_wavelength
