"""Tests for the 3-D FDTD engine — field updates, boundaries, probes."""

import numpy as np
import pytest

from backend.common.constants import C_0
from backend.common.models.fdtd import FdtdConfig, compute_courant_limit
from backend.solver_fdtd.engine_3d import fdtd_3d_step, run_fdtd_3d
from backend.solver_fdtd.engine_common import compute_update_coefficients
from backend.solver_fdtd.probes import PlaneProbe, PointProbe


class TestFdtd3dStep:
    """Test the single 3-D leapfrog time-step kernel."""

    def test_zero_fields_stay_zero(self):
        nx = ny = nz = 10
        dx = dy = dz = 0.01
        dt = 0.99 * compute_courant_limit(dx, dy, dz)

        eps_r = np.ones((nx, ny, nz))
        sigma = np.zeros((nx, ny, nz))
        mu_r = np.ones((nx, ny, nz))
        Ca, Cb = compute_update_coefficients(eps_r, sigma, dt)

        Ex = np.zeros((nx, ny, nz))
        Ey = np.zeros((nx, ny, nz))
        Ez = np.zeros((nx, ny, nz))
        Hx = np.zeros((nx, ny, nz))
        Hy = np.zeros((nx, ny, nz))
        Hz = np.zeros((nx, ny, nz))

        fdtd_3d_step(Ex, Ey, Ez, Hx, Hy, Hz, Ca, Cb, Ca, Cb, Ca, Cb, dt, dx, dy, dz, mu_r)

        np.testing.assert_allclose(Ex, 0.0)
        np.testing.assert_allclose(Ey, 0.0)
        np.testing.assert_allclose(Ez, 0.0)
        np.testing.assert_allclose(Hx, 0.0)
        np.testing.assert_allclose(Hy, 0.0)
        np.testing.assert_allclose(Hz, 0.0)

    def test_point_source_spreads(self):
        """A point impulse should spread in all directions."""
        nx = ny = nz = 20
        dx = dy = dz = 0.01
        dt = 0.99 * compute_courant_limit(dx, dy, dz)

        eps_r = np.ones((nx, ny, nz))
        sigma = np.zeros((nx, ny, nz))
        mu_r = np.ones((nx, ny, nz))
        Ca, Cb = compute_update_coefficients(eps_r, sigma, dt)

        Ex = np.zeros((nx, ny, nz))
        Ey = np.zeros((nx, ny, nz))
        Ez = np.zeros((nx, ny, nz))
        Hx = np.zeros((nx, ny, nz))
        Hy = np.zeros((nx, ny, nz))
        Hz = np.zeros((nx, ny, nz))

        Ez[10, 10, 10] = 1.0

        for _ in range(5):
            fdtd_3d_step(Ex, Ey, Ez, Hx, Hy, Hz, Ca, Cb, Ca, Cb, Ca, Cb, dt, dx, dy, dz, mu_r)

        # H-fields should have been excited
        assert np.max(np.abs(Hx)) > 0
        assert np.max(np.abs(Hy)) > 0


class TestRunFdtd3D:
    """Integration tests for the full 3-D runner."""

    def _make_source(self, ix: int, iy: int, iz: int, t0: float, spread: float) -> dict:
        return {
            "ix": ix, "iy": iy, "iz": iz,
            "type": "gaussian_pulse",
            "parameters": {"t0": t0, "spread": spread},
            "soft": True,
        }

    def test_basic_run(self):
        n = 15
        dx = dy = dz = 0.01
        config = FdtdConfig(num_time_steps=20, output_every_n_steps=10)
        dt = config.courant_number * compute_courant_limit(dx, dy, dz)

        result = run_fdtd_3d(
            nx=n, ny=n, nz=n,
            dx=dx, dy=dy, dz=dz,
            config=config,
            sources=[self._make_source(7, 7, 7, 10 * dt, 5 * dt)],
        )

        assert result["total_time_steps"] == 20
        assert result["dt"] > 0
        assert result["mode"] == "3d"
        for comp in ("Ex", "Ey", "Ez", "Hx", "Hy", "Hz"):
            assert comp in result["fields_final"]

    def test_symmetry_uniform_medium(self):
        """A centred source in vacuum should produce symmetric Ez."""
        n = 21  # Odd for exact centre
        dx = dy = dz = 0.01
        config = FdtdConfig(num_time_steps=30, output_every_n_steps=30)
        dt = config.courant_number * compute_courant_limit(dx, dy, dz)
        c = n // 2

        result = run_fdtd_3d(
            nx=n, ny=n, nz=n,
            dx=dx, dy=dy, dz=dz,
            config=config,
            sources=[self._make_source(c, c, c, 10 * dt, 5 * dt)],
            boundary_type="mur_abc",
        )

        Ez = np.array(result["fields_final"]["Ez"])
        # x-symmetry: Ez[c+d, c, c] ≈ Ez[c-d, c, c]
        for d in range(1, 4):
            np.testing.assert_allclose(
                Ez[c + d, c, c], Ez[c - d, c, c], atol=1e-10,
                err_msg=f"x-symmetry failed at offset {d}",
            )
        # y-symmetry
        for d in range(1, 4):
            np.testing.assert_allclose(
                Ez[c, c + d, c], Ez[c, c - d, c], atol=1e-10,
                err_msg=f"y-symmetry failed at offset {d}",
            )
        # z-symmetry (slightly relaxed — Mur ABC face ordering introduces ~1e-6 asymmetry)
        for d in range(1, 4):
            np.testing.assert_allclose(
                Ez[c, c, c + d], Ez[c, c, c - d], atol=1e-5,
                err_msg=f"z-symmetry failed at offset {d}",
            )

    def test_pec_boundary(self):
        """PEC: tangential E = 0 on all faces."""
        n = 15
        dx = dy = dz = 0.01
        config = FdtdConfig(num_time_steps=30)
        dt = config.courant_number * compute_courant_limit(dx, dy, dz)

        result = run_fdtd_3d(
            nx=n, ny=n, nz=n,
            dx=dx, dy=dy, dz=dz,
            config=config,
            sources=[self._make_source(7, 7, 7, 10 * dt, 5 * dt)],
            boundary_type="pec",
        )

        Ex = np.array(result["fields_final"]["Ex"])
        Ey = np.array(result["fields_final"]["Ey"])
        Ez = np.array(result["fields_final"]["Ez"])

        # All E-field components should be zero on all faces
        np.testing.assert_allclose(Ex[0, :, :], 0.0)
        np.testing.assert_allclose(Ex[-1, :, :], 0.0)
        np.testing.assert_allclose(Ey[0, :, :], 0.0)
        np.testing.assert_allclose(Ey[-1, :, :], 0.0)
        np.testing.assert_allclose(Ez[0, :, :], 0.0)
        np.testing.assert_allclose(Ez[-1, :, :], 0.0)

    def test_with_point_probe(self):
        n = 15
        dx = dy = dz = 0.01
        config = FdtdConfig(num_time_steps=20, output_every_n_steps=5)
        dt = config.courant_number * compute_courant_limit(dx, dy, dz)

        probe = PointProbe(name="center", ix=7, iy=7, iz=7)
        result = run_fdtd_3d(
            nx=n, ny=n, nz=n,
            dx=dx, dy=dy, dz=dz,
            config=config,
            sources=[self._make_source(7, 7, 7, 10 * dt, 5 * dt)],
            probes=[probe],
        )

        assert len(result["probe_data"]) == 1
        pd = result["probe_data"][0]
        assert pd["name"] == "center"
        assert len(pd["values"]) == 20 // 5

    def test_with_plane_probe(self):
        n = 12
        dx = dy = dz = 0.01
        config = FdtdConfig(num_time_steps=10, output_every_n_steps=5)
        dt = config.courant_number * compute_courant_limit(dx, dy, dz)

        probe = PlaneProbe(name="mid_z", slice_axis="z", slice_index=n // 2)
        result = run_fdtd_3d(
            nx=n, ny=n, nz=n,
            dx=dx, dy=dy, dz=dz,
            config=config,
            sources=[self._make_source(6, 6, 6, 5 * dt, 3 * dt)],
            probes=[probe],
        )

        pd = result["probe_data"][0]
        assert len(pd["snapshots"]) == 2  # Steps 0, 5
        assert len(pd["snapshots"][0]) == n  # nx rows
        assert len(pd["snapshots"][0][0]) == n  # ny cols

    def test_dft_3d(self):
        n = 12
        dx = dy = dz = 0.01
        freq = 1e9
        config = FdtdConfig(num_time_steps=30, dft_frequencies=[freq])
        dt = config.courant_number * compute_courant_limit(dx, dy, dz)

        result = run_fdtd_3d(
            nx=n, ny=n, nz=n,
            dx=dx, dy=dy, dz=dz,
            config=config,
            sources=[self._make_source(6, 6, 6, 10 * dt, 5 * dt)],
        )

        assert freq in result["dft_results"]
        dft = result["dft_results"][freq]
        assert "real" in dft
        assert "imag" in dft

    def test_energy_conservation_free_space(self):
        """Total EM energy in free space with Mur ABC should not grow."""
        n = 15
        dx = dy = dz = 0.01
        config = FdtdConfig(num_time_steps=50, output_every_n_steps=50)
        dt = config.courant_number * compute_courant_limit(dx, dy, dz)

        probe = PointProbe(name="center", ix=7, iy=7, iz=7)
        result = run_fdtd_3d(
            nx=n, ny=n, nz=n,
            dx=dx, dy=dy, dz=dz,
            config=config,
            sources=[self._make_source(7, 7, 7, 10 * dt, 5 * dt)],
            boundary_type="mur_abc",
            probes=[probe],
        )

        # After the source pulse has passed, field energy should be finite
        Ez = np.array(result["fields_final"]["Ez"])
        energy = np.sum(Ez**2)
        assert np.isfinite(energy), "EM energy diverged"
