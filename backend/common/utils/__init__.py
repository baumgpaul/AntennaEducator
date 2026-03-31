"""
Utility functions for the Antenna Simulator.
"""

from .expressions import (
    ALLOWED_FUNCTIONS,
    BUILTIN_CONSTANTS,
    CircularDependencyError,
    ExpressionError,
    detect_circular_dependencies,
    evaluate_expression,
    get_expression_variables,
    parse_numeric_or_expression,
)
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
    # Expressions
    "ExpressionError",
    "CircularDependencyError",
    "evaluate_expression",
    "parse_numeric_or_expression",
    "get_expression_variables",
    "detect_circular_dependencies",
    "BUILTIN_CONSTANTS",
    "ALLOWED_FUNCTIONS",
    # Validation
    "validate_positive",
    "validate_vector_3d",
    "validate_frequency",
    "validate_segments",
    "validate_lumped_element_nodes",
    # Serialization
    "serialize_complex",
    "deserialize_complex",
    "serialize_numpy",
    "deserialize_numpy",
]
