"""
Tests for validation utilities.
"""

import pytest
import numpy as np
from backend.common.utils.validation import (
    validate_positive,
    validate_vector_3d,
    validate_frequency,
    validate_segments,
    validate_unit_vector,
)


def test_validate_positive():
    """Test positive value validation."""
    # Should pass
    validate_positive(1.0)
    validate_positive(0.001)
    validate_positive(1e-10)
    
    # Should fail
    with pytest.raises(ValueError, match="must be positive"):
        validate_positive(0.0)
    
    with pytest.raises(ValueError, match="must be positive"):
        validate_positive(-1.0)


def test_validate_vector_3d():
    """Test 3D vector validation."""
    # Valid vectors
    v1 = validate_vector_3d([1, 2, 3])
    assert v1.shape == (3,)
    assert np.allclose(v1, [1, 2, 3])
    
    v2 = validate_vector_3d(np.array([0.5, 0.5, 0.5]))
    assert v2.shape == (3,)
    
    # Invalid vectors
    with pytest.raises(ValueError, match="must be a 3D vector"):
        validate_vector_3d([1, 2])
    
    with pytest.raises(ValueError, match="must be a 3D vector"):
        validate_vector_3d([1, 2, 3, 4])
    
    with pytest.raises(ValueError, match="non-finite"):
        validate_vector_3d([1, 2, np.inf])


def test_validate_frequency():
    """Test frequency validation."""
    # Valid frequencies
    validate_frequency(1e6)  # 1 MHz
    validate_frequency(1e9)  # 1 GHz
    validate_frequency(10e9)  # 10 GHz
    
    # Invalid frequencies (too low or too high based on constants)
    with pytest.raises(ValueError, match="Frequency must be between"):
        validate_frequency(100)  # Too low
    
    with pytest.raises(ValueError, match="Frequency must be between"):
        validate_frequency(1e12)  # Too high


def test_validate_segments():
    """Test segments validation."""
    # Valid
    validate_segments(10)
    validate_segments(1)
    validate_segments(1000)
    
    # Invalid
    with pytest.raises(ValueError, match="must be an integer"):
        validate_segments(10.5)
    
    with pytest.raises(ValueError, match="must be at least"):
        validate_segments(0)
    
    with pytest.raises(ValueError, match="must be at least"):
        validate_segments(-5)


def test_validate_unit_vector():
    """Test unit vector validation and normalization."""
    # Already unit vector
    v1 = validate_unit_vector([1, 0, 0])
    assert np.allclose(v1, [1, 0, 0])
    assert abs(np.linalg.norm(v1) - 1.0) < 1e-12
    
    # Needs normalization
    v2 = validate_unit_vector([3, 4, 0])
    assert abs(np.linalg.norm(v2) - 1.0) < 1e-12
    assert np.allclose(v2, [0.6, 0.8, 0.0])
    
    # Zero vector
    with pytest.raises(ValueError, match="zero magnitude"):
        validate_unit_vector([0, 0, 0])
