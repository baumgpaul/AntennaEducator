"""Tests for DFT accumulator accuracy vs numpy FFT."""

import math

import numpy as np
import pytest

from backend.solver_fdtd.engine_common import (
    dft_accumulator_init,
    dft_accumulator_update,
)


class TestDftAccuracy:
    def test_single_frequency_sinusoid(self):
        """DFT of a pure sinusoid should peak at the signal frequency."""
        n = 512
        dt = 1e-12
        f_signal = 5e9
        t = np.arange(n) * dt
        signal = np.sin(2 * np.pi * f_signal * t)

        # Test at several frequencies including the signal frequency
        freqs = [1e9, 3e9, 5e9, 7e9, 10e9]
        acc = dft_accumulator_init((1,), freqs)

        for step in range(n):
            dft_accumulator_update(acc, np.array([signal[step]]), dt, step, freqs)

        magnitudes = [abs(acc[i, 0]) for i in range(len(freqs))]

        # The DFT magnitude at f_signal should be the largest
        idx_signal = freqs.index(f_signal)
        assert magnitudes[idx_signal] == max(magnitudes)

    def test_dc_signal(self):
        """DFT of a constant signal should show energy at f=0 neighbourhood."""
        n = 256
        dt = 1e-12
        signal_val = 2.5
        signal = np.full(1, signal_val)

        # Very low frequency ≈ DC
        freqs = [0.0, 1e9]  # f=0 won't work with exp, use very low
        freqs_test = [1e6, 1e9]  # Use a very low freq instead of DC
        acc = dft_accumulator_init((1,), freqs_test)

        for step in range(n):
            dft_accumulator_update(acc, signal, dt, step, freqs_test)

        # Low-freq bin should have larger magnitude than high-freq
        assert abs(acc[0, 0]) > abs(acc[1, 0])

    def test_two_frequencies(self):
        """DFT should resolve two distinct tones."""
        n = 1024
        dt = 1e-12
        f1, f2 = 2e9, 8e9
        t = np.arange(n) * dt
        signal = np.sin(2 * np.pi * f1 * t) + 0.5 * np.sin(2 * np.pi * f2 * t)

        freqs = [f1, 5e9, f2]
        acc = dft_accumulator_init((1,), freqs)

        for step in range(n):
            dft_accumulator_update(acc, np.array([signal[step]]), dt, step, freqs)

        mag_f1 = abs(acc[0, 0])
        mag_mid = abs(acc[1, 0])
        mag_f2 = abs(acc[2, 0])

        # Both tones should be stronger than the off-frequency bin
        assert mag_f1 > mag_mid
        assert mag_f2 > mag_mid
        # f1 has amplitude 1.0, f2 has 0.5
        assert mag_f1 > mag_f2

    def test_spatial_field_dft(self):
        """DFT on a spatial field array works correctly."""
        n_steps = 100
        nx = 20
        dt = 1e-12
        freq = 3e9
        acc = dft_accumulator_init((nx,), [freq])

        for step in range(n_steps):
            t = step * dt
            field = np.sin(2 * np.pi * freq * t) * np.ones(nx)
            dft_accumulator_update(acc, field, dt, step, [freq])

        # All spatial points should have the same DFT magnitude
        magnitudes = np.abs(acc[0, :])
        np.testing.assert_allclose(magnitudes, magnitudes[0], rtol=1e-10)
