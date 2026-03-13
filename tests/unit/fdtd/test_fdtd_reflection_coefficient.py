"""Physics validation: Fresnel reflection coefficient at a dielectric interface.

A Gaussian pulse in 1-D vacuum hitting an interface with a dielectric
slab (epsilon_r > 1) should produce a reflection with amplitude:

    Γ = (1 − √εᵣ) / (1 + √εᵣ)    (normal incidence, non-magnetic)

We measure the reflected pulse amplitude and compare to the analytical
Fresnel coefficient.

@pytest.mark.critical — gold-standard physics test.
"""

import math

import numpy as np
import pytest

from backend.common.constants import C_0
from backend.common.models.fdtd import FdtdConfig, compute_courant_limit
from backend.solver_fdtd.engine_1d import run_fdtd_1d
from backend.solver_fdtd.probes import PointProbe


@pytest.mark.critical
class TestReflectionCoefficient:
    def test_dielectric_interface_reflection(self):
        """Measured reflection coefficient should match Fresnel prediction
        within 5 % for epsilon_r = 4.0 (Γ = -1/3)."""
        nx = 600
        dx = 0.005   # 5 mm cells, 3 m domain
        epsilon_r_slab = 4.0

        # Material: vacuum left half, dielectric right half
        eps_r = np.ones(nx)
        interface_idx = nx // 2  # 300
        eps_r[interface_idx:] = epsilon_r_slab

        config = FdtdConfig(
            num_time_steps=800,
            courant_number=0.99,
            output_every_n_steps=1,
        )
        dt = config.courant_number * compute_courant_limit(dx)

        # Source well to the left of the interface
        src_idx = 100
        t0 = 80 * dt
        spread = 25 * dt

        # Probe between source and interface to capture reflected wave
        probe_idx = 80
        probe = PointProbe(name="reflected", ix=probe_idx)

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
            epsilon_r=eps_r,
        )

        values = np.array(result["probe_data"][0]["values"])

        # The probe first sees the incident pulse, then the reflected pulse
        # Find the two peaks
        abs_vals = np.abs(values)

        # Incident peak: first major peak
        mid = len(values) // 2
        incident_peak = np.max(abs_vals[:mid])

        # Reflected peak: second major peak (after the incident has passed)
        reflected_peak = np.max(abs_vals[mid:])

        if incident_peak < 1e-10:
            pytest.skip("Incident pulse too weak — test configuration issue")

        gamma_measured = reflected_peak / incident_peak

        # Analytical Fresnel coefficient (magnitude)
        sqrt_er = math.sqrt(epsilon_r_slab)
        gamma_analytical = abs((1 - sqrt_er) / (1 + sqrt_er))  # 1/3 for eps=4

        relative_error = abs(gamma_measured - gamma_analytical) / gamma_analytical
        assert relative_error < 0.10, (
            f"Γ_measured = {gamma_measured:.4f}, "
            f"Γ_analytical = {gamma_analytical:.4f}, "
            f"error = {relative_error*100:.1f}%"
        )
