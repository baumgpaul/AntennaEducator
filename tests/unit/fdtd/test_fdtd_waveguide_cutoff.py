"""Physics validation: Waveguide TE₁₀ cutoff frequency.

A 2-D PEC parallel-plate waveguide of width *a* has a TE₁₀ cutoff
frequency:

    f_c = c₀ / (2a)

We simulate a 2-D TM waveguide (PEC walls in y, ABC in x) and
verify that:
  1. A signal ABOVE cutoff propagates through the waveguide.
  2. A signal BELOW cutoff is evanescent (attenuated).

@pytest.mark.critical — gold-standard physics test.
"""

import numpy as np
import pytest

from backend.common.constants import C_0
from backend.common.models.fdtd import FdtdConfig, compute_courant_limit
from backend.solver_fdtd.engine_2d import run_fdtd_2d
from backend.solver_fdtd.probes import PointProbe


@pytest.mark.critical
class TestWaveguideCutoff:
    """Verify TE₁₀ cutoff frequency in a parallel-plate waveguide.

    For a 2-D TM simulation between PEC walls at y=0 and y=a,
    the TE₁₀ mode has cutoff frequency f_c = c₀/(2a).

    We use two narrowband signals — one above cutoff (should propagate)
    and one below cutoff (should be evanescent). We compare the
    received amplitude at a downstream probe.
    """

    def test_cutoff_frequency(self):
        """Signal above cutoff propagates; signal below cutoff does not."""
        # Waveguide width — a wider guide gives lower f_c and faster
        # convergence with fewer cells per wavelength.
        a = 0.2  # 20 cm → f_c = c₀/(2·0.2) ≈ 749 MHz

        f_cutoff = C_0 / (2.0 * a)

        # Grid parameters — keep the propagation path short so
        # the signal arrives within the simulation window.
        dx = 0.005  # 5 mm
        dy = 0.005  # 5 mm
        ny = round(a / dy)  # 40 cells across waveguide width
        nx = 80  # 40 cm propagation length

        dt_max = compute_courant_limit(dx, dy)

        # --- Simulation with signal ABOVE cutoff ---
        f_above = 2.0 * f_cutoff  # Well above cutoff
        config = FdtdConfig(
            num_time_steps=6000,
            courant_number=0.99,
            output_every_n_steps=1,
        )

        # Source near left wall, centered in y
        src_ix = 5
        src_iy = ny // 2

        # Probe at downstream location — not too far from source
        probe_ix = nx // 2

        probe_above = PointProbe(name="downstream_above", ix=probe_ix, iy=ny // 2)

        # PEC walls via high conductivity at y boundaries
        sigma = np.zeros((nx, ny))
        sigma[:, 0] = 1e12
        sigma[:, -1] = 1e12

        result_above = run_fdtd_2d(
            nx=nx,
            ny=ny,
            dx=dx,
            dy=dy,
            config=config,
            sources=[
                {
                    "ix": src_ix,
                    "iy": src_iy,
                    "type": "sinusoidal",
                    "parameters": {"frequency": f_above, "amplitude": 1.0},
                    "soft": True,
                }
            ],
            probes=[probe_above],
            boundary_type="mur_abc",
            sigma=sigma,
            mode="tm",
        )

        values_above = np.array(result_above["probe_data"][0]["values"])
        max_amplitude_above = np.max(np.abs(values_above))

        # --- Simulation with signal BELOW cutoff ---
        f_below = 0.3 * f_cutoff  # Well below cutoff

        probe_below = PointProbe(name="downstream_below", ix=probe_ix, iy=ny // 2)

        result_below = run_fdtd_2d(
            nx=nx,
            ny=ny,
            dx=dx,
            dy=dy,
            config=config,
            sources=[
                {
                    "ix": src_ix,
                    "iy": src_iy,
                    "type": "sinusoidal",
                    "parameters": {"frequency": f_below, "amplitude": 1.0},
                    "soft": True,
                }
            ],
            probes=[probe_below],
            boundary_type="mur_abc",
            sigma=sigma,
            mode="tm",
        )

        values_below = np.array(result_below["probe_data"][0]["values"])
        max_amplitude_below = np.max(np.abs(values_below))

        # Above cutoff should propagate → significant amplitude at downstream probe
        assert (
            max_amplitude_above > 1e-4
        ), f"Signal above cutoff did not propagate: max amplitude = {max_amplitude_above}"

        # Below cutoff should be evanescent → much weaker at downstream probe
        if max_amplitude_above > 0:
            attenuation_ratio = max_amplitude_below / max_amplitude_above
        else:
            attenuation_ratio = 0.0

        assert attenuation_ratio < 0.5, (
            f"Below-cutoff signal not sufficiently attenuated: "
            f"ratio = {attenuation_ratio:.4f} "
            f"(above={max_amplitude_above:.6f}, below={max_amplitude_below:.6f})"
        )

    def test_cutoff_frequency_analytical(self):
        """Verify the analytical cutoff frequency formula."""
        # Simple check: f_c = c₀/(2a)
        a = 0.1  # 10 cm
        f_c = C_0 / (2.0 * a)
        # Expected: ~1.4990 GHz
        assert f_c == pytest.approx(1.498962e9, rel=1e-3)

        a2 = 0.05  # 5 cm
        f_c2 = C_0 / (2.0 * a2)
        assert f_c2 == pytest.approx(2 * f_c, rel=1e-6)
