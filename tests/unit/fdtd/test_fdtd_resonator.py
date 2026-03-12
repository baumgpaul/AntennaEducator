"""Physics validation: PEC cavity resonant frequencies.

A 1-D PEC cavity of length L has resonant frequencies:
    f_n = n * c₀ / (2L),   n = 1, 2, 3, ...

We excite a broadband pulse inside a PEC cavity and verify that
the DFT spectrum peaks at the expected resonant frequencies.

@pytest.mark.critical — gold-standard physics test.
"""

import numpy as np
import pytest

from backend.common.constants import C_0
from backend.common.models.fdtd import FdtdConfig, compute_courant_limit
from backend.solver_fdtd.engine_1d import run_fdtd_1d
from backend.solver_fdtd.probes import PointProbe


@pytest.mark.critical
class TestPECResonator:
    def test_resonant_frequencies(self):
        """DFT peaks should align with f_n = n·c₀/(2L) for n=1,2,3."""
        # Domain: 1 m PEC cavity → f₁ = c/(2*1) ≈ 149.9 MHz
        L = 1.0        # 1 metre
        dx = 0.005     # 5 mm → 200 cells
        nx = round(L / dx)
        config_steps = 20000  # Enough steps for ~3 MHz resolution

        config = FdtdConfig(
            num_time_steps=config_steps,
            courant_number=0.99,
            output_every_n_steps=1,
        )
        dt = config.courant_number * compute_courant_limit(dx)

        # Broadband Gaussian source at L/4 — avoids nodes of modes 1-3
        t0 = 50 * dt
        spread = 15 * dt

        # Probe at 3/8 L avoids nodes of modes 1–3
        probe = PointProbe(name="probe", ix=3 * nx // 8)
        result = run_fdtd_1d(
            nx=nx, dx=dx, config=config,
            sources=[{
                "index": nx // 5,  # L/5 — avoids nodes of modes 1–3
                "type": "gaussian_pulse",
                "parameters": {"t0": t0, "spread": spread},
                "soft": True,
            }],
            probes=[probe],
            boundary_type="pec",
        )

        # Get time series
        values = np.array(result["probe_data"][0]["values"])
        times = np.array(result["probe_data"][0]["times"])
        n_samples = len(values)

        # FFT
        fft_result = np.abs(np.fft.rfft(values))
        freqs = np.fft.rfftfreq(n_samples, dt)

        # Expected resonant frequencies
        f_expected = [n * C_0 / (2 * L) for n in (1, 2, 3)]

        # For each expected mode, find the nearest FFT peak
        for f_res in f_expected:
            # Search in a window around the expected frequency
            window = 0.15 * f_res  # ±15%
            mask = (freqs > f_res - window) & (freqs < f_res + window)
            if not np.any(mask):
                continue

            local_fft = fft_result[mask]
            local_freqs = freqs[mask]
            peak_idx = np.argmax(local_fft)
            f_observed = local_freqs[peak_idx]

            rel_error = abs(f_observed - f_res) / f_res
            assert rel_error < 0.05, (
                f"Mode at f={f_res/1e6:.1f} MHz: observed {f_observed/1e6:.1f} MHz, "
                f"error {rel_error*100:.1f}%"
            )
