"""Tests for sources.py — hard/soft injection for 1-D and 2-D."""

import numpy as np
import pytest

from backend.solver_fdtd.sources import (
    inject_line_source_2d,
    inject_source_1d,
    inject_source_2d,
)


class TestInjectSource1D:
    def test_soft_source_adds(self):
        """Soft source adds to existing field."""
        Ez = np.ones(10)
        inject_source_1d(
            Ez, step=0, dt=1e-12, source_index=5,
            source_type="gaussian_pulse",
            parameters={"t0": 0.0, "spread": 1e-10},
            soft=True,
        )
        # Should be > 1.0 at the injection point
        assert Ez[5] > 1.0
        # Other cells unchanged
        assert Ez[0] == pytest.approx(1.0)

    def test_hard_source_overwrites(self):
        """Hard source overwrites existing field."""
        Ez = np.ones(10) * 99.0
        inject_source_1d(
            Ez, step=0, dt=1e-12, source_index=5,
            source_type="gaussian_pulse",
            parameters={"t0": 0.0, "spread": 1e-10},
            soft=False,
        )
        # Should be the source value, not 99+source
        assert Ez[5] < 99.0


class TestInjectSource2D:
    def test_soft_2d(self):
        field = np.zeros((20, 20))
        inject_source_2d(
            field, step=0, dt=1e-12, source_ix=10, source_iy=10,
            source_type="gaussian_pulse",
            parameters={"t0": 0.0, "spread": 1e-10},
            soft=True,
        )
        assert field[10, 10] != 0.0
        assert field[0, 0] == 0.0

    def test_hard_2d(self):
        field = np.ones((20, 20)) * 5.0
        inject_source_2d(
            field, step=0, dt=1e-12, source_ix=10, source_iy=10,
            source_type="gaussian_pulse",
            parameters={"t0": 0.0, "spread": 1e-10},
            soft=False,
        )
        assert field[10, 10] != 5.0


class TestInjectLineSource2D:
    def test_x_axis_line(self):
        field = np.zeros((10, 10))
        inject_line_source_2d(
            field, step=0, dt=1e-12, axis="x", index=5,
            source_type="gaussian_pulse",
            parameters={"t0": 0.0, "spread": 1e-10},
            soft=True,
        )
        # Entire row 5 should be nonzero
        assert np.all(field[5, :] != 0.0)
        # Row 0 should be zero
        assert np.all(field[0, :] == 0.0)

    def test_y_axis_line(self):
        field = np.zeros((10, 10))
        inject_line_source_2d(
            field, step=0, dt=1e-12, axis="y", index=3,
            source_type="gaussian_pulse",
            parameters={"t0": 0.0, "spread": 1e-10},
            soft=True,
        )
        assert np.all(field[:, 3] != 0.0)

    def test_invalid_axis_raises(self):
        field = np.zeros((10, 10))
        with pytest.raises(ValueError, match="axis must be"):
            inject_line_source_2d(
                field, step=0, dt=1e-12, axis="z", index=0,
                source_type="gaussian_pulse",
                parameters={"t0": 0.0, "spread": 1e-10},
            )
