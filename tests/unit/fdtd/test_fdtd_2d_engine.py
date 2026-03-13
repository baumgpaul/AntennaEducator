"""Tests for the 2-D FDTD engine — TM/TE modes, field symmetry."""

import numpy as np
import pytest

from backend.common.constants import C_0
from backend.common.models.fdtd import FdtdConfig, compute_courant_limit
from backend.solver_fdtd.engine_2d import (
    fdtd_2d_step_tm,
    run_fdtd_2d,
)
from backend.solver_fdtd.engine_common import compute_update_coefficients
from backend.solver_fdtd.probes import PlaneProbe, PointProbe


class TestFdtd2dStepTM:
    """Test the single TM time-step kernel."""

    def test_zero_fields_stay_zero(self):
        nx = ny = 30
        dx = dy = 0.001
        dt = 0.99 * compute_courant_limit(dx, dy)

        eps_r = np.ones((nx, ny))
        sigma = np.zeros((nx, ny))
        mu_r = np.ones((nx, ny))
        Ca, Cb = compute_update_coefficients(eps_r, sigma, dt)

        Ez = np.zeros((nx, ny))
        Hx = np.zeros((nx, ny))
        Hy = np.zeros((nx, ny))

        fdtd_2d_step_tm(Ez, Hx, Hy, Ca, Cb, dt, dx, dy, mu_r)
        np.testing.assert_allclose(Ez, 0.0)

    def test_point_source_spreads(self):
        """A point impulse should spread circularly."""
        nx = ny = 50
        dx = dy = 0.001
        dt = 0.99 * compute_courant_limit(dx, dy)

        eps_r = np.ones((nx, ny))
        sigma = np.zeros((nx, ny))
        mu_r = np.ones((nx, ny))
        Ca, Cb = compute_update_coefficients(eps_r, sigma, dt)

        Ez = np.zeros((nx, ny))
        Hx = np.zeros((nx, ny))
        Hy = np.zeros((nx, ny))
        Ez[25, 25] = 1.0

        for _ in range(5):
            fdtd_2d_step_tm(Ez, Hx, Hy, Ca, Cb, dt, dx, dy, mu_r)

        # Field should have spread to neighbours
        assert np.max(np.abs(Hx)) > 0
        assert np.max(np.abs(Hy)) > 0


class TestRunFdtd2D:
    """Integration tests for the full 2-D TM runner."""

    def _make_source(self, ix: int, iy: int, t0: float, spread: float) -> dict:
        return {
            "ix": ix, "iy": iy,
            "type": "gaussian_pulse",
            "parameters": {"t0": t0, "spread": spread},
            "soft": True,
        }

    def test_basic_tm_run(self):
        nx = ny = 40
        dx = dy = 0.01
        config = FdtdConfig(num_time_steps=30, output_every_n_steps=10)
        dt = config.courant_number * compute_courant_limit(dx, dy)

        result = run_fdtd_2d(
            nx=nx, ny=ny, dx=dx, dy=dy,
            config=config,
            sources=[self._make_source(20, 20, 10 * dt, 5 * dt)],
            mode="tm",
        )

        assert result["mode"] == "tm"
        assert result["total_time_steps"] == 30
        assert "Ez" in result["fields_final"]
        assert "Hx" in result["fields_final"]
        assert "Hy" in result["fields_final"]
        assert result["dt"] > 0

    def test_basic_te_run(self):
        nx = ny = 40
        dx = dy = 0.01
        config = FdtdConfig(num_time_steps=30, output_every_n_steps=10)
        dt = config.courant_number * compute_courant_limit(dx, dy)

        result = run_fdtd_2d(
            nx=nx, ny=ny, dx=dx, dy=dy,
            config=config,
            sources=[self._make_source(20, 20, 10 * dt, 5 * dt)],
            mode="te",
        )

        assert result["mode"] == "te"
        assert "Hz" in result["fields_final"]
        assert "Ex" in result["fields_final"]
        assert "Ey" in result["fields_final"]

    def test_invalid_mode_raises(self):
        with pytest.raises(ValueError, match="mode must be"):
            run_fdtd_2d(
                nx=10, ny=10, dx=0.01, dy=0.01,
                config=FdtdConfig(num_time_steps=1),
                sources=[self._make_source(5, 5, 0.0, 1e-10)],
                mode="invalid",
            )

    def test_symmetry_uniform_medium(self):
        """A centred source in a uniform medium should produce symmetric fields."""
        n = 41  # Odd so source is exactly centred
        dx = dy = 0.01
        config = FdtdConfig(num_time_steps=50, output_every_n_steps=50)
        dt = config.courant_number * compute_courant_limit(dx, dy)
        c = n // 2  # Centre index

        result = run_fdtd_2d(
            nx=n, ny=n, dx=dx, dy=dy,
            config=config,
            sources=[self._make_source(c, c, 15 * dt, 5 * dt)],
            boundary_type="mur_abc",
            mode="tm",
        )

        Ez = np.array(result["fields_final"]["Ez"])
        # Check x-symmetry: Ez[c+d, c] ≈ Ez[c-d, c]
        for d in range(1, 5):
            np.testing.assert_allclose(
                Ez[c + d, c], Ez[c - d, c], atol=1e-10,
                err_msg=f"x-symmetry failed at offset {d}",
            )
        # Check y-symmetry
        for d in range(1, 5):
            np.testing.assert_allclose(
                Ez[c, c + d], Ez[c, c - d], atol=1e-10,
                err_msg=f"y-symmetry failed at offset {d}",
            )

    def test_pec_boundary(self):
        """PEC: Ez = 0 on all edges."""
        n = 30
        dx = dy = 0.01
        config = FdtdConfig(num_time_steps=50)
        dt = config.courant_number * compute_courant_limit(dx, dy)

        result = run_fdtd_2d(
            nx=n, ny=n, dx=dx, dy=dy,
            config=config,
            sources=[self._make_source(15, 15, 15 * dt, 5 * dt)],
            boundary_type="pec",
            mode="tm",
        )

        Ez = np.array(result["fields_final"]["Ez"])
        np.testing.assert_allclose(Ez[0, :], 0.0)
        np.testing.assert_allclose(Ez[-1, :], 0.0)
        np.testing.assert_allclose(Ez[:, 0], 0.0)
        np.testing.assert_allclose(Ez[:, -1], 0.0)

    def test_with_point_probe(self):
        n = 30
        dx = dy = 0.01
        config = FdtdConfig(num_time_steps=20, output_every_n_steps=5)
        dt = config.courant_number * compute_courant_limit(dx, dy)

        probe = PointProbe(name="center", ix=15, iy=15)
        result = run_fdtd_2d(
            nx=n, ny=n, dx=dx, dy=dy,
            config=config,
            sources=[self._make_source(15, 15, 10 * dt, 5 * dt)],
            probes=[probe],
        )

        assert len(result["probe_data"]) == 1
        pd = result["probe_data"][0]
        assert pd["name"] == "center"
        assert len(pd["values"]) == 20 // 5

    def test_with_plane_probe(self):
        n = 20
        dx = dy = 0.01
        config = FdtdConfig(num_time_steps=10, output_every_n_steps=5)
        dt = config.courant_number * compute_courant_limit(dx, dy)

        probe = PlaneProbe(name="full_field")
        result = run_fdtd_2d(
            nx=n, ny=n, dx=dx, dy=dy,
            config=config,
            sources=[self._make_source(10, 10, 5 * dt, 3 * dt)],
            probes=[probe],
        )

        pd = result["probe_data"][0]
        assert len(pd["snapshots"]) == 2  # Steps 0, 5
        assert len(pd["snapshots"][0]) == n  # nx rows
        assert len(pd["snapshots"][0][0]) == n  # ny cols

    def test_dft_2d(self):
        n = 30
        dx = dy = 0.01
        freq = 1e9
        config = FdtdConfig(num_time_steps=50, dft_frequencies=[freq])
        dt = config.courant_number * compute_courant_limit(dx, dy)

        result = run_fdtd_2d(
            nx=n, ny=n, dx=dx, dy=dy,
            config=config,
            sources=[self._make_source(15, 15, 15 * dt, 5 * dt)],
        )

        assert freq in result["dft_results"]
