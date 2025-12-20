"""
Validation utilities for input data.
"""

from typing import List, Union
import numpy as np
from ..constants import MIN_FREQUENCY, MAX_FREQUENCY


def validate_positive(value: float, name: str = "value") -> None:
    """
    Validate that a value is positive.
    
    Args:
        value: Value to validate
        name: Name of the parameter (for error messages)
        
    Raises:
        ValueError: If value is not positive
    """
    if value <= 0:
        raise ValueError(f"{name} must be positive, got {value}")


def validate_vector_3d(
    vector: Union[List[float], np.ndarray],
    name: str = "vector"
) -> np.ndarray:
    """
    Validate and convert a 3D vector.
    
    Args:
        vector: Input vector (list or array)
        name: Name of the parameter (for error messages)
        
    Returns:
        Validated numpy array of shape (3,)
        
    Raises:
        ValueError: If vector is not 3D or contains invalid values
    """
    vec = np.asarray(vector, dtype=float)
    
    if vec.shape != (3,):
        raise ValueError(f"{name} must be a 3D vector, got shape {vec.shape}")
    
    if not np.all(np.isfinite(vec)):
        raise ValueError(f"{name} contains non-finite values")
    
    return vec


def validate_frequency(frequency: float) -> None:
    """
    Validate frequency value.
    
    Args:
        frequency: Frequency in Hz
        
    Raises:
        ValueError: If frequency is out of valid range
    """
    if not MIN_FREQUENCY <= frequency <= MAX_FREQUENCY:
        raise ValueError(
            f"Frequency must be between {MIN_FREQUENCY/1e6:.1f} MHz "
            f"and {MAX_FREQUENCY/1e9:.1f} GHz, got {frequency/1e6:.1f} MHz"
        )


def validate_segments(segments: int, min_segments: int = 1) -> None:
    """
    Validate number of segments.
    
    Args:
        segments: Number of segments
        min_segments: Minimum allowed segments
        
    Raises:
        ValueError: If segments is invalid
    """
    if not isinstance(segments, int):
        raise ValueError(f"segments must be an integer, got {type(segments)}")
    
    if segments < min_segments:
        raise ValueError(f"segments must be at least {min_segments}, got {segments}")


def validate_unit_vector(
    vector: Union[List[float], np.ndarray],
    name: str = "vector",
    tolerance: float = 1e-6
) -> np.ndarray:
    """
    Validate that a vector is a unit vector (or normalize it).
    
    Args:
        vector: Input vector
        name: Name of the parameter (for error messages)
        tolerance: Tolerance for unit length check
        
    Returns:
        Normalized unit vector
        
    Raises:
        ValueError: If vector has zero magnitude
    """
    vec = validate_vector_3d(vector, name)
    
    magnitude = np.linalg.norm(vec)
    if magnitude < tolerance:
        raise ValueError(f"{name} has zero magnitude")
    
    return vec / magnitude


def validate_positive_array(
    arr: np.ndarray,
    name: str = "array"
) -> None:
    """
    Validate that all elements in an array are positive.
    
    Args:
        arr: Array to validate
        name: Name of the parameter (for error messages)
        
    Raises:
        ValueError: If any element is not positive
    """
    if not np.all(arr > 0):
        raise ValueError(f"All elements in {name} must be positive")
