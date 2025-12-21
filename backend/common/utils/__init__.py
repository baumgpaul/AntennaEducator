"""
Utility functions for the Antenna Simulator.
"""

from .validation import (
    validate_positive,
    validate_vector_3d,
    validate_frequency,
    validate_segments,
    validate_lumped_element_nodes,
)
from .serialization import (
    serialize_complex,
    deserialize_complex,
    serialize_numpy,
    deserialize_numpy,
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
