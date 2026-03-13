"""Tests for the 1-D FDTD engine — time stepping, field updates, probes."""

import math

import numpy as np
import pytest

from backend.common.constants import C_0
from backend.common.models.fdtd import FdtdConfig, compute_courant_limit
from backend.solver_fdtd.engine_1d import fdtd_1d_step, run_fdtd_1d
from backend.solver_fdtd.engine_common import compute_update_coefficients
from backend.solver_fdtd.probes import LineProbe, PointProbe


class TestFdtd1dStep:
    """Test the single time-step kernel."""

    def test_zero_fields_stay_zero(self):
        """With no source, zero fields remain zero."""
        nx = 50
        Ez = np.zeros(nx)
        Hy = np.zeros(nx)
        Ca = np.ones(nx)
        Cb = np.full(nx, 1e-12 / 8.854187817e-12)
        mu_r = np.ones(nx)
        dx = 0.001
        dt = 0.99 * dx / C_0

        fdtd_1d_step(Ez, Hy, Ca, Cb, dt, dx, mu_r)
        np.testing.assert_allclose(Ez, 0.0)
        np.testing.assert_allclose(Hy, 0.0)

    def test_field_propagation(self):
        """A pulse should spread after one step."""
        nx = 100
        dx = 0.01
        dt = 0.99 * dx / C_0
        eps_r = np.ones(nx)
        sigma = np.zeros(nx)
        mu_r = np.ones(nx)
        Ca, Cb = compute_update_coefficients(eps_r, sigma, dt)

        Ez = np.zeros(nx)
        Hy = np.zeros(nx)
        Ez[50] = 1.0  # Impulse

        fdtd_1d_step(Ez, Hy, Ca, Cb, dt, dx, mu_r)

        # After one step, neighbours should have non-zero H
        assert Hy[49] != 0.0 or Hy[50] != 0.0
        # The impulse should have been modified
        assert Ez[50] != 1.0 or Ez[49] != 0.0 or Ez[51] != 0.0


class TestRunFdtd1D:
    """Integration tests for the full 1-D runner."""

    def _make_source(self, index: int, t0: float, spread: float) -> dict:
        return {
            "index": index,
            "type": "gaussian_pulse",
            "parameters": {"t0": t0, "spread": spread},
            "soft": True,
        }

    def test_basic_run(self):
        """Simulation completes and returns expected keys."""
        nx = 100
        dx = 0.01
        config = FdtdConfig(num_time_steps=50, courant_number=0.99, output_every_n_steps=10)
        dt = config.courant_number * compute_courant_limit(dx)
        t0 = 20 * dt
        spread = 8 * dt

        result = run_fdtd_1d(
            nx=nx, dx=dx, config=config,
            sources=[self._make_source(50, t0, spread)],
        )

        assert "Ez_final" in result
        assert "Hy_final" in result
        assert result["total_time_steps"] == 50
        assert result["dt"] > 0
        assert result["solve_time_s"] >= 0
        assert len(result["Ez_final"]) == nx

    def test_with_point_probe(self):
        """Point probe records data at the correct point."""
        nx = 100
        dx = 0.01
        config = FdtdConfig(num_time_steps=100, output_every_n_steps=5)
        dt = config.courant_number * compute_courant_limit(dx)
        t0 = 30 * dt
        spread = 10 * dt

        probe = PointProbe(name="center", ix=50)
        result = run_fdtd_1d(
            nx=nx, dx=dx, config=config,
            sources=[self._make_source(50, t0, spread)],
            probes=[probe],
        )

        assert len(result["probe_data"]) == 1
        pd = result["probe_data"][0]
        assert pd["name"] == "center"
        assert len(pd["times"]) == 100 // 5  # output_every_n_steps = 5
        assert len(pd["values"]) == len(pd["times"])

    def test_with_line_probe(self):
        """Line probe records full spatial snapshots."""
        nx = 50
        dx = 0.01
        config = FdtdConfig(num_time_steps=20, output_every_n_steps=10)
        dt = config.courant_number * compute_courant_limit(dx)

        probe = LineProbe(name="full_line")
        result = run_fdtd_1d(
            nx=nx, dx=dx, config=config,
            sources=[self._make_source(25, 10 * dt, 5 * dt)],
            probes=[probe],
        )

        pd = result["probe_data"][0]
        assert len(pd["snapshots"]) == 2  # steps 0, 10
        assert len(pd["snapshots"][0]) == nx

    def test_pec_boundary(self):
        """PEC boundaries enforce Ez=0 at endpoints."""
        nx = 100
        dx = 0.01
        config = FdtdConfig(num_time_steps=200, output_every_n_steps=200)
        dt = config.courant_number * compute_courant_limit(dx)

        result = run_fdtd_1d(
            nx=nx, dx=dx, config=config,
            sources=[self._make_source(50, 50 * dt, 15 * dt)],
            boundary_type="pec",
        )

        # With PEC, the fields at the boundary should be zero
        assert result["Ez_final"][0] == pytest.approx(0.0)
        assert result["Ez_final"][-1] == pytest.approx(0.0)

    def test_dft_results(self):
        """DFT accumulator produces results at requested frequencies."""
        nx = 100
        dx = 0.01
        freq = 1e9
        config = FdtdConfig(
            num_time_steps=200,
            dft_frequencies=[freq],
        )
        dt = config.courant_number * compute_courant_limit(dx)

        result = run_fdtd_1d(
            nx=nx, dx=dx, config=config,
            sources=[self._make_source(50, 50 * dt, 15 * dt)],
        )

        assert freq in result["dft_results"]
        dft = result["dft_results"][freq]
        assert "real" in dft
        assert "imag" in dft
        assert len(dft["real"]) == nx

    def test_lossy_material_damps(self):
        """Moderate conductivity should damp the field over time."""
        nx = 200
        dx = 0.01
        config = FdtdConfig(num_time_steps=300, courant_number=0.99)
        dt = config.courant_number * compute_courant_limit(dx)

        # Run in vacuum
        result_vac = run_fdtd_1d(
            nx=nx, dx=dx, config=config,
            sources=[self._make_source(100, 50 * dt, 15 * dt)],
            boundary_type="pec",
        )

        # Run in mildly lossy medium (sigma = 0.001 S/m)
        sigma = np.full(nx, 0.001)
        result_lossy = run_fdtd_1d(
            nx=nx, dx=dx, config=config,
            sources=[self._make_source(100, 50 * dt, 15 * dt)],
            sigma=sigma,
            boundary_type="pec",
        )

        energy_vac = np.sum(np.array(result_vac["Ez_final"]) ** 2)
        energy_lossy = np.sum(np.array(result_lossy["Ez_final"]) ** 2)
        assert energy_lossy < energy_vac
