"""Tests for CFL / Courant limit computation (1-D, 2-D, 3-D)."""

import pytest

from backend.common.constants import C_0
from backend.common.models.fdtd import compute_courant_limit


class TestCourantLimit:
    def test_1d(self):
        """1-D: dt_max = dx / c."""
        dx = 0.001
        dt = compute_courant_limit(dx)
        expected = dx / C_0
        assert dt == pytest.approx(expected, rel=1e-10)

    def test_2d(self):
        """2-D: dt_max = 1 / (c * sqrt(1/dx² + 1/dy²))."""
        dx = dy = 0.001
        dt = compute_courant_limit(dx, dy)
        import math
        expected = 1.0 / (C_0 * math.sqrt(1 / dx**2 + 1 / dy**2))
        assert dt == pytest.approx(expected, rel=1e-10)

    def test_3d(self):
        """3-D: dt_max = 1 / (c * sqrt(1/dx² + 1/dy² + 1/dz²))."""
        dx = dy = dz = 0.001
        dt = compute_courant_limit(dx, dy, dz)
        import math
        expected = 1.0 / (C_0 * math.sqrt(1 / dx**2 + 1 / dy**2 + 1 / dz**2))
        assert dt == pytest.approx(expected, rel=1e-10)

    def test_2d_smaller_than_1d(self):
        """Multi-dimensional CFL limit is more restrictive."""
        dx = 0.001
        dt_1d = compute_courant_limit(dx)
        dt_2d = compute_courant_limit(dx, dx)
        dt_3d = compute_courant_limit(dx, dx, dx)
        assert dt_2d < dt_1d
        assert dt_3d < dt_2d

    def test_finer_grid_smaller_dt(self):
        """Finer cells require smaller time steps."""
        dt_coarse = compute_courant_limit(0.01)
        dt_fine = compute_courant_limit(0.001)
        assert dt_fine < dt_coarse

    def test_anisotropic_grid(self):
        """Non-square cells: limited by the smallest cell dimension."""
        dx, dy = 0.001, 0.01
        dt = compute_courant_limit(dx, dy)
        # Should be less than both 1-D limits
        assert dt < dx / C_0
        assert dt < dy / C_0
