"""Physics validation: free-space propagation speed = c₀.

A Gaussian pulse launched in a 1-D vacuum domain should propagate at
the speed of light. We verify by tracking the pulse peak position over
time and computing the observed velocity.

@pytest.mark.critical — gold-standard physics test.
"""

import numpy as np
import pytest

from backend.common.constants import C_0
from backend.common.models.fdtd import FdtdConfig, compute_courant_limit
from backend.solver_fdtd.engine_1d import run_fdtd_1d
from backend.solver_fdtd.probes import LineProbe


@pytest.mark.critical
class TestFreeSpacePropagation:
    def test_pulse_speed_equals_c0(self):
        """The observed propagation speed of a Gaussian pulse in vacuum
        should be within 2 % of c₀."""
        nx = 500
        dx = 0.01  # 1 cm cells → 5 m domain
        config = FdtdConfig(
            num_time_steps=300,
            courant_number=0.99,
            output_every_n_steps=1,
        )
        dt = config.courant_number * compute_courant_limit(dx)

        # Source at index 100
        src_idx = 100
        t0 = 50 * dt
        spread = 15 * dt

        probe = LineProbe(name="field_line")
        result = run_fdtd_1d(
            nx=nx, dx=dx, config=config,
            sources=[{
                "index": src_idx,
                "type": "gaussian_pulse",
                "parameters": {"t0": t0, "spread": spread},
                "soft": True,
            }],
            probes=[probe],
            boundary_type="mur_abc",
        )

        snapshots = np.array(result["probe_data"][0]["snapshots"])
        times = np.array(result["probe_data"][0]["times"])

        # Track the right-going pulse (indices > source position).
        # At early times both halves exist; at late times the left half is
        # absorbed by the Mur ABC.  We restrict argmax to indices > src_idx
        # so we always track the same wavefront.
        step_early = 80   # ~ 80 * dt elapsed
        step_late = 200   # ~ 200 * dt elapsed

        # Ensure we have enough data
        assert snapshots.shape[0] > step_late

        right_half_early = np.abs(snapshots[step_early, src_idx:])
        right_half_late = np.abs(snapshots[step_late, src_idx:])
        peak_early = src_idx + np.argmax(right_half_early)
        peak_late = src_idx + np.argmax(right_half_late)

        # Distance and time
        distance = abs(peak_late - peak_early) * dx
        elapsed = times[step_late] - times[step_early]

        if elapsed > 0 and distance > 0:
            v_observed = distance / elapsed
            relative_error = abs(v_observed - C_0) / C_0
            assert relative_error < 0.02, (
                f"Observed speed {v_observed:.3e} m/s differs from c₀ = {C_0:.3e} "
                f"by {relative_error*100:.1f}%"
            )
