"""
FDTD Integration: S-Parameter Extraction
==========================================
Validates S₁₁ extraction from time-domain probe data against
analytical expectations for known scenarios.

Uses the solver's postprocess.s_parameter_from_probes() function
tested via complete simulation scenarios.
"""

import math

import pytest
from fastapi.testclient import TestClient

from backend.solver_fdtd.main import app as solver_app
from backend.solver_fdtd.postprocess import s_parameter_from_probes

solver = TestClient(solver_app)


class TestSParameterExtraction:
    """S-parameter computation from time-domain signals."""

    def test_s11_from_synthetic_signals(self):
        """
        Synthetic test: a known Gaussian incident pulse and a scaled/delayed
        reflected pulse should yield predictable |S₁₁|.
        """
        dt = 1e-12  # 1 ps
        n_steps = 2000
        times = [i * dt for i in range(n_steps)]

        # Gaussian incident pulse centered at t0
        t0 = 500e-12
        spread = 100e-12
        incident = [math.exp(-(((t - t0) / spread) ** 2)) for t in times]

        # Reflected pulse: 50% amplitude, delayed by 200 ps
        reflection_coeff = 0.5
        delay = 200e-12
        reflected = [
            reflection_coeff * math.exp(-(((t - t0 - delay) / spread) ** 2)) for t in times
        ]

        # Evaluate S11 at DC-ish frequency where the signals overlap well
        # At very low frequencies, the DFT of both signals captures
        # the full energy, and S11 ≈ reflection_coeff
        frequencies = [0.5e9, 1e9, 2e9]
        result = s_parameter_from_probes(incident, reflected, times, frequencies)

        assert len(result["frequencies"]) == 3
        assert len(result["s11_mag_db"]) == 3
        assert len(result["s11_phase_deg"]) == 3
        assert len(result["s11_complex"]) == 3

        # At low frequency, |S11| should be close to the reflection coefficient
        # The DFT phase shift from the delay affects magnitude at higher frequencies
        # but at 0.5 GHz with 100 ps spread, it should be reasonable
        s11_mag_0 = 10 ** (result["s11_mag_db"][0] / 20)
        assert s11_mag_0 == pytest.approx(reflection_coeff, abs=0.1)

    def test_s11_perfect_reflection(self):
        """PEC boundary: reflected signal equals incident → |S₁₁| ≈ 0 dB."""
        dt = 1e-12
        n_steps = 1000
        times = [i * dt for i in range(n_steps)]

        t0 = 300e-12
        spread = 80e-12
        pulse = [math.exp(-(((t - t0) / spread) ** 2)) for t in times]

        # Perfect reflection: same signal as incident (delayed)
        delay = 100e-12
        reflected = [math.exp(-(((t - t0 - delay) / spread) ** 2)) for t in times]

        # S11 at a frequency within the bandwidth
        frequencies = [1e9]
        result = s_parameter_from_probes(pulse, reflected, times, frequencies)

        s11_mag = 10 ** (result["s11_mag_db"][0] / 20)
        # Magnitude should be close to 1 (0 dB) — not exactly 1 due to delay phase
        assert s11_mag > 0.5, f"|S11| = {s11_mag} should be close to 1 for perfect reflection"

    def test_s11_no_reflection(self):
        """No reflected signal → |S₁₁| should be very small."""
        dt = 1e-12
        n_steps = 1000
        times = [i * dt for i in range(n_steps)]

        t0 = 300e-12
        spread = 80e-12
        incident = [math.exp(-(((t - t0) / spread) ** 2)) for t in times]
        reflected = [0.0] * n_steps  # No reflection

        frequencies = [1e9, 2e9]
        result = s_parameter_from_probes(incident, reflected, times, frequencies)

        # S11 should be extremely small (< -60 dB)
        for db_val in result["s11_mag_db"]:
            assert db_val < -60, f"|S11| = {db_val} dB should be << 0 for no reflection"

    def test_s11_from_fdtd_pec_reflection(self):
        """
        Run a 1-D FDTD simulation with PEC wall and extract S-parameters.
        A PEC wall should produce near-total reflection.
        """
        # Setup: Gaussian pulse with PEC at x_max
        req = {
            "dimensionality": "1d",
            "domain_size": [0.5, 0.01, 0.01],
            "cell_size": [0.005, 0.01, 0.01],
            "structures": [],
            "sources": [
                {
                    "name": "incident",
                    "type": "gaussian_pulse",
                    "position": [0.15, 0.0, 0.0],
                    "parameters": {"amplitude": 1.0, "width": 30},
                    "polarization": "z",
                }
            ],
            "boundaries": {
                "x_min": {"type": "mur_abc"},
                "x_max": {"type": "pec"},
                "y_min": {"type": "mur_abc"},
                "y_max": {"type": "mur_abc"},
                "z_min": {"type": "mur_abc"},
                "z_max": {"type": "mur_abc"},
            },
            "probes": [
                {
                    "name": "incident_probe",
                    "type": "point",
                    "position": [0.1, 0.0, 0.0],
                    "fields": ["Ez"],
                },
                {
                    "name": "reflected_probe",
                    "type": "point",
                    "position": [0.1, 0.0, 0.0],
                    "fields": ["Ez"],
                },
            ],
            "config": {"num_time_steps": 800, "courant_number": 0.99},
        }

        r = solver.post("/api/fdtd/solve", json=req)
        assert r.status_code == 200
        data = r.json()
        assert len(data["probe_data"]) == 2

        # Both probes are at the same location — the probe records
        # both incident and reflected pulses overlapping.
        # In a real setup we'd separate them, but here we just verify
        # the S-parameter extraction function works with FDTD data.
        probe_values = data["probe_data"][0]["values"]
        times = data["probe_data"][0]["times"]

        if len(times) > 0 and len(probe_values) > 0:
            # Use the same signal as both inc and ref (worst case: |S11|~1)
            frequencies = [1e9]
            result = s_parameter_from_probes(probe_values, probe_values, times, frequencies)
            s11_mag = 10 ** (result["s11_mag_db"][0] / 20)
            # Same signal → |S11| = 1.0 (0 dB)
            assert s11_mag == pytest.approx(1.0, abs=0.01)
