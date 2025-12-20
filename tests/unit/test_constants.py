"""
Test for the common constants module.
"""

import pytest
import numpy as np
from backend.common.constants import (
    MU_0, EPSILON_0, C_0, Z_0,
    wavelength, wavenumber, skin_depth, segments_for_wavelength,
    DEFAULT_WIRE_RADIUS, DEFAULT_SEGMENTS_PER_WAVELENGTH
)


def test_physical_constants():
    """Test that physical constants have correct values."""
    # Speed of light check: c = 1 / sqrt(mu_0 * epsilon_0)
    c_calculated = 1.0 / np.sqrt(MU_0 * EPSILON_0)
    assert abs(c_calculated - C_0) < 1.0  # Within 1 m/s
    
    # Impedance of free space: Z_0 = sqrt(mu_0 / epsilon_0)
    z_calculated = np.sqrt(MU_0 / EPSILON_0)
    assert abs(z_calculated - Z_0) < 0.1  # Within 0.1 Ohm


def test_wavelength():
    """Test wavelength calculation."""
    # 1 GHz should give ~0.3 m wavelength
    freq = 1e9
    lambda_ = wavelength(freq)
    expected = C_0 / freq
    assert abs(lambda_ - expected) < 1e-9
    assert abs(lambda_ - 0.299792458) < 0.01


def test_wavenumber():
    """Test wavenumber calculation."""
    freq = 1e9
    k = wavenumber(freq)
    lambda_ = wavelength(freq)
    expected = 2 * np.pi / lambda_
    assert abs(k - expected) < 1e-9


def test_skin_depth():
    """Test skin depth calculation."""
    # At 1 GHz in copper, skin depth should be ~2 micrometers
    freq = 1e9
    delta = skin_depth(freq)
    assert 1e-6 < delta < 5e-6  # Between 1 and 5 micrometers


def test_segments_for_wavelength():
    """Test segment length calculation."""
    freq = 1e9
    seg_length = segments_for_wavelength(freq)
    lambda_ = wavelength(freq)
    expected = lambda_ / DEFAULT_SEGMENTS_PER_WAVELENGTH
    assert abs(seg_length - expected) < 1e-9


def test_default_values():
    """Test that default values are reasonable."""
    assert DEFAULT_WIRE_RADIUS > 0
    assert DEFAULT_SEGMENTS_PER_WAVELENGTH > 5
    assert DEFAULT_SEGMENTS_PER_WAVELENGTH < 100
