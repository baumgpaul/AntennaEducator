"""
Utility functions for the Antenna Simulator.
"""

from .serialization import (
    deserialize_complex,
    deserialize_numpy,
    serialize_complex,
    serialize_numpy,
)
from .validation import (
    validate_frequency,
    validate_lumped_element_nodes,
    validate_positive,
    validate_segments,
    validate_vector_3d,
)

__all__ = [
    # Validation
    "validate_positive",
    "validate_vector_3d",
    "validate_frequency",
    "validate_segments",
    "validate_lumped_element_nodes",
    "validate_vector_3d",
    "validate_frequency",
    "validate_segments",
    # Serialization
    "serialize_complex",
    "deserialize_complex",
    "serialize_numpy",
    "deserialize_numpy",
]
