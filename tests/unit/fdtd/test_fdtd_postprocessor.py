"""Tests for FDTD postprocessor field extraction, SAR, and Poynting vector."""

import numpy as np
import pytest

from backend.fdtd_postprocessor.field_extraction import (
    compute_poynting_vector_1d,
    compute_poynting_vector_2d_tm,
    compute_sar,
    extract_field_snapshot,
    extract_frequency_field,
)


class TestExtractFieldSnapshot:
    def test_1d_snapshot(self):
        """1-D field snapshot with correct coordinates."""
        field = np.array([0.0, 1.0, 2.0, 3.0, 4.0])
        dx = 0.01
        result = extract_field_snapshot(field, dx)

        assert len(result["values"]) == 5
        assert result["x_coords"] == pytest.approx([0.0, 0.01, 0.02, 0.03, 0.04])
        assert result["y_coords"] == []
        assert result["min_value"] == pytest.approx(0.0)
        assert result["max_value"] == pytest.approx(4.0)

    def test_2d_snapshot(self):
        """2-D field snapshot with both coordinate axes."""
        field = np.array([[1.0, 2.0], [3.0, 4.0], [5.0, 6.0]])
        dx, dy = 0.01, 0.02
        result = extract_field_snapshot(field, dx, dy)

        assert len(result["values"]) == 3
        assert len(result["values"][0]) == 2
        assert result["x_coords"] == pytest.approx([0.0, 0.01, 0.02])
        assert result["y_coords"] == pytest.approx([0.0, 0.02])
        assert result["min_value"] == pytest.approx(1.0)
        assert result["max_value"] == pytest.approx(6.0)


class TestExtractFrequencyField:
    def test_magnitude_and_phase(self):
        """Magnitude and phase correctly computed from complex DFT data."""
        # Field = 1 + j → magnitude = sqrt(2), phase = 45°
        dft_real = np.array([1.0, 0.0, -1.0])
        dft_imag = np.array([1.0, 1.0, 0.0])
        dx = 0.01

        result = extract_frequency_field(dft_real, dft_imag, dx)

        assert result["magnitude"][0] == pytest.approx(np.sqrt(2), rel=1e-6)
        assert result["magnitude"][1] == pytest.approx(1.0, rel=1e-6)
        assert result["magnitude"][2] == pytest.approx(1.0, rel=1e-6)
        assert result["phase_deg"][0] == pytest.approx(45.0, abs=0.1)
        assert result["phase_deg"][1] == pytest.approx(90.0, abs=0.1)
        assert result["phase_deg"][2] == pytest.approx(180.0, abs=0.1)

    def test_2d_frequency_field(self):
        """2-D frequency field extraction."""
        dft_real = np.array([[1.0, 0.0], [0.0, -1.0]])
        dft_imag = np.array([[0.0, 1.0], [-1.0, 0.0]])
        dx, dy = 0.01, 0.02

        result = extract_frequency_field(dft_real, dft_imag, dx, dy)

        assert len(result["magnitude"]) == 2
        assert len(result["magnitude"][0]) == 2
        assert result["x_coords"] == pytest.approx([0.0, 0.01])
        assert result["y_coords"] == pytest.approx([0.0, 0.02])


class TestComputeSar:
    def test_uniform_tissue(self):
        """SAR in uniform tissue: SAR = σ|E|² / (2ρ)."""
        sigma_val = 0.87  # skin conductivity [S/m]
        rho = 1050.0  # skin density [kg/m³]
        e_amp = 10.0  # [V/m]

        e_mag = np.full(10, e_amp)
        sigma = np.full(10, sigma_val)
        density = np.full(10, rho)

        result = compute_sar(e_mag, sigma, density)
        expected_sar = sigma_val * e_amp**2 / (2.0 * rho)

        assert result["peak_sar"] == pytest.approx(expected_sar, rel=1e-6)
        assert result["average_sar"] == pytest.approx(expected_sar, rel=1e-6)

    def test_free_space_zero_sar(self):
        """SAR is zero in free space (density = 0)."""
        e_mag = np.full(10, 100.0)
        sigma = np.zeros(10)
        density = np.zeros(10)

        result = compute_sar(e_mag, sigma, density)

        assert result["peak_sar"] == pytest.approx(0.0)
        assert result["average_sar"] == pytest.approx(0.0)

    def test_mixed_tissue_and_air(self):
        """SAR computed only in tissue cells, not in air."""
        e_mag = np.array([10.0, 10.0, 10.0, 10.0])
        sigma = np.array([0.0, 0.87, 0.87, 0.0])
        density = np.array([0.0, 1050.0, 1050.0, 0.0])

        result = compute_sar(e_mag, sigma, density)

        expected_sar = 0.87 * 100.0 / (2.0 * 1050.0)
        assert result["peak_sar"] == pytest.approx(expected_sar, rel=1e-6)
        assert result["average_sar"] == pytest.approx(expected_sar, rel=1e-6)
        # Air cells should have zero SAR
        sar_arr = np.array(result["sar"])
        assert sar_arr[0] == pytest.approx(0.0)
        assert sar_arr[3] == pytest.approx(0.0)


class TestPoyntingVector1D:
    def test_forward_propagation(self):
        """For a forward-propagating plane wave, Sx should be negative (Ez × Hy convention)."""
        n = 100
        ez = np.sin(np.linspace(0, 4 * np.pi, n))
        hy = -ez / 377.0  # Plane wave: Hy = -Ez / Z₀ for +x propagation
        result = compute_poynting_vector_1d(ez, hy)

        assert len(result["sx"]) == n
        assert result["total_power"] > 0

    def test_zero_field(self):
        """Zero fields produce zero Poynting vector."""
        ez = np.zeros(50)
        hy = np.zeros(50)
        result = compute_poynting_vector_1d(ez, hy)

        assert result["total_power"] == pytest.approx(0.0)


class TestPoyntingVector2DTM:
    def test_basic_computation(self):
        """Poynting vector computed correctly for simple fields."""
        nx, ny = 10, 10
        ez = np.ones((nx, ny))
        hx = np.zeros((nx, ny))
        hy = np.ones((nx, ny))

        result = compute_poynting_vector_2d_tm(ez, hx, hy)

        # Sx = -Ez*Hy = -1, Sy = Ez*Hx = 0
        assert np.allclose(result["sx"], -1.0)
        assert np.allclose(result["sy"], 0.0)
        assert np.allclose(result["magnitude"], 1.0)

    def test_zero_fields(self):
        """Zero fields produce zero result."""
        nx, ny = 5, 5
        ez = np.zeros((nx, ny))
        hx = np.zeros((nx, ny))
        hy = np.zeros((nx, ny))

        result = compute_poynting_vector_2d_tm(ez, hx, hy)
        assert result["total_power"] == pytest.approx(0.0)
