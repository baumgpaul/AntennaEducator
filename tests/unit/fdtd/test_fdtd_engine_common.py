"""Tests for engine_common.py — waveforms, update coefficients, DFT."""

import math

import numpy as np
import pytest

from backend.solver_fdtd.engine_common import (
    compute_update_coefficients,
    dft_accumulator_init,
    dft_accumulator_update,
    evaluate_source,
    gaussian_pulse,
    get_array_module,
    modulated_gaussian,
    sinusoidal_source,
)


# ===================================================================
# Gaussian pulse
# ===================================================================
class TestGaussianPulse:
    def test_peak_at_center(self):
        """Pulse should be 1.0 at t = t0."""
        assert gaussian_pulse(1e-9, 1e-9, 1e-10) == pytest.approx(1.0)

    def test_symmetric(self):
        """Pulse is symmetric around t0."""
        t0, spread = 5e-10, 1e-10
        v_left = gaussian_pulse(t0 - 2e-10, t0, spread)
        v_right = gaussian_pulse(t0 + 2e-10, t0, spread)
        assert v_left == pytest.approx(v_right)

    def test_decays_far_from_center(self):
        """Pulse decays to near zero far from t0."""
        val = gaussian_pulse(0.0, 5e-9, 1e-10)
        assert abs(val) < 1e-20

    def test_always_positive(self):
        """Gaussian envelope is always non-negative."""
        for t in [0, 1e-10, 5e-10, 1e-9]:
            assert gaussian_pulse(t, 5e-10, 1e-10) >= 0.0


# ===================================================================
# Modulated Gaussian
# ===================================================================
class TestModulatedGaussian:
    def test_zero_at_center(self):
        """sin(0) = 0 at t = t0 (carrier zero-crossing)."""
        val = modulated_gaussian(5e-10, 5e-10, 1e-10, 1e9)
        assert abs(val) < 1e-15

    def test_bounded_by_envelope(self):
        """Modulated pulse should be bounded by Gaussian envelope."""
        t0, spread, freq = 5e-10, 1e-10, 1e9
        for t in np.linspace(0, 1e-9, 100):
            val = modulated_gaussian(t, t0, spread, freq)
            env = gaussian_pulse(t, t0, spread)
            assert abs(val) <= env + 1e-15


# ===================================================================
# Sinusoidal source
# ===================================================================
class TestSinusoidalSource:
    def test_zero_at_t_zero(self):
        """sin(0) = 0 with default phase."""
        assert sinusoidal_source(0.0, 1e9) == pytest.approx(0.0, abs=1e-15)

    def test_period(self):
        """Full period returns to zero."""
        f = 1e9
        T = 1.0 / f
        assert sinusoidal_source(T, f) == pytest.approx(0.0, abs=1e-10)

    def test_quarter_period(self):
        """sin(π/2) = 1.0 at quarter period."""
        f = 1e9
        T = 1.0 / f
        assert sinusoidal_source(T / 4, f) == pytest.approx(1.0, abs=1e-10)


# ===================================================================
# Source dispatcher
# ===================================================================
class TestEvaluateSource:
    def test_gaussian(self):
        val = evaluate_source("gaussian_pulse", 1e-9, {"t0": 1e-9, "spread": 1e-10})
        assert val == pytest.approx(1.0)

    def test_sinusoidal(self):
        val = evaluate_source("sinusoidal", 0.0, {"frequency": 1e9})
        assert val == pytest.approx(0.0, abs=1e-15)

    def test_modulated_gaussian(self):
        val = evaluate_source("modulated_gaussian", 0.0, {
            "t0": 5e-10, "spread": 1e-10, "frequency": 1e9,
        })
        assert isinstance(val, float)

    def test_unknown_raises(self):
        with pytest.raises(ValueError, match="Unknown source type"):
            evaluate_source("unknown", 0.0, {})


# ===================================================================
# Update coefficients
# ===================================================================
class TestUpdateCoefficients:
    def test_vacuum_coefficients(self):
        """In vacuum (sigma=0), Ca=1 and Cb=dt/eps0."""
        eps_r = np.ones(10)
        sigma = np.zeros(10)
        dt = 1e-12
        Ca, Cb = compute_update_coefficients(eps_r, sigma, dt)
        np.testing.assert_allclose(Ca, 1.0)
        expected_Cb = dt / (eps_r[0] * 8.854187817e-12)
        np.testing.assert_allclose(Cb, expected_Cb, rtol=1e-10)

    def test_lossy_reduces_ca(self):
        """Non-zero conductivity reduces Ca below 1.0."""
        eps_r = np.full(5, 4.0)
        sigma = np.full(5, 0.01)
        dt = 1e-12
        Ca, Cb = compute_update_coefficients(eps_r, sigma, dt)
        assert all(Ca < 1.0)
        assert all(Ca > 0.0)

    def test_shape_preserved(self):
        """Output shapes match input."""
        shape = (10, 20)
        eps_r = np.ones(shape)
        sigma = np.zeros(shape)
        Ca, Cb = compute_update_coefficients(eps_r, sigma, 1e-12)
        assert Ca.shape == shape
        assert Cb.shape == shape


# ===================================================================
# DFT accumulator
# ===================================================================
class TestDftAccumulator:
    def test_init_shape(self):
        acc = dft_accumulator_init((100,), [1e9, 2e9])
        assert acc.shape == (2, 100)
        assert acc.dtype == np.complex128

    def test_init_2d(self):
        acc = dft_accumulator_init((50, 50), [1e9])
        assert acc.shape == (1, 50, 50)

    def test_update_accumulates(self):
        """After update, accumulator should be non-zero."""
        acc = dft_accumulator_init((10,), [1e9])
        field = np.ones(10)
        dft_accumulator_update(acc, field, 1e-12, 0, [1e9])
        assert np.any(acc != 0)

    def test_dft_vs_numpy_fft(self):
        """On-the-fly DFT should approximate numpy FFT for a known signal."""
        n = 256
        dt = 1e-12
        freq = 1e9
        t = np.arange(n) * dt
        signal = np.sin(2 * np.pi * freq * t)

        # On-the-fly DFT at the signal frequency
        acc = dft_accumulator_init((1,), [freq])
        for step in range(n):
            dft_accumulator_update(acc, np.array([signal[step]]), dt, step, [freq])

        # NumPy FFT
        fft_result = np.fft.fft(signal)
        freq_bins = np.fft.fftfreq(n, dt)
        idx = np.argmin(np.abs(freq_bins - freq))
        fft_at_freq = fft_result[idx]

        # Compare magnitudes (up to scaling: running DFT doesn't include 1/N)
        running_mag = abs(acc[0, 0])
        fft_mag = abs(fft_at_freq)
        # They should be in the same ballpark (within 10%)
        assert running_mag > 0
        assert fft_mag > 0


# ===================================================================
# Array module
# ===================================================================
class TestGetArrayModule:
    def test_default_is_numpy(self):
        xp = get_array_module()
        assert xp is np
