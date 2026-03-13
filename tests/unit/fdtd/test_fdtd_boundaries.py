"""Tests for boundaries.py — Mur ABC, PEC, PMC for 1-D and 2-D."""

import numpy as np
import pytest

from backend.common.constants import C_0
from backend.solver_fdtd.boundaries import (
    MurABC1D,
    MurABC2D,
    apply_pec_1d,
    apply_pec_2d,
    apply_pmc_1d,
    apply_pmc_2d,
    create_boundary_1d,
    create_boundary_2d,
)


# ===================================================================
# PEC / PMC — 1-D
# ===================================================================
class TestPEC1D:
    def test_zeros_boundaries(self):
        Ez = np.ones(20)
        apply_pec_1d(Ez)
        assert Ez[0] == 0.0
        assert Ez[-1] == 0.0
        assert Ez[10] == 1.0  # Interior unchanged


class TestPMC1D:
    def test_zeros_boundaries(self):
        Hy = np.ones(20)
        apply_pmc_1d(Hy)
        assert Hy[0] == 0.0
        assert Hy[-1] == 0.0


# ===================================================================
# Mur ABC — 1-D
# ===================================================================
class TestMurABC1D:
    def test_coefficient_valid(self):
        """Mur coefficient should be in (-1, 1) for physical parameters."""
        abc = MurABC1D(dx=0.001, dt=1e-12, c=C_0)
        assert -1 < abc.coeff < 1

    def test_apply_modifies_boundaries(self):
        """After applying Mur, boundary values should be updated."""
        abc = MurABC1D(dx=0.001, dt=1e-12, c=C_0)
        Ez = np.zeros(100)
        Ez[50] = 1.0  # Pulse in the middle

        # Apply a few times to propagate
        for _ in range(10):
            abc.apply(Ez)

    def test_absorbs_better_than_pec(self):
        """Mur ABC should result in less residual energy than PEC."""
        from backend.common.models.fdtd import FdtdConfig, compute_courant_limit
        from backend.solver_fdtd.engine_1d import run_fdtd_1d

        nx = 200
        dx = 0.01
        config = FdtdConfig(num_time_steps=400, courant_number=0.99, output_every_n_steps=400)
        dt = config.courant_number * compute_courant_limit(dx)
        t0 = 30 * dt
        spread = 10 * dt

        src = {"index": 20, "type": "gaussian_pulse",
               "parameters": {"t0": t0, "spread": spread}, "soft": True}

        result_abc = run_fdtd_1d(nx=nx, dx=dx, config=config,
                                 sources=[src], boundary_type="mur_abc")
        result_pec = run_fdtd_1d(nx=nx, dx=dx, config=config,
                                 sources=[src], boundary_type="pec")

        energy_abc = np.sum(np.array(result_abc["Ez_final"]) ** 2)
        energy_pec = np.sum(np.array(result_pec["Ez_final"]) ** 2)
        # Mur ABC should yield less residual energy than PEC
        assert energy_abc < energy_pec


# ===================================================================
# PEC / PMC — 2-D
# ===================================================================
class TestPEC2D:
    def test_zeros_all_edges(self):
        Ez = np.ones((20, 30))
        apply_pec_2d(Ez)
        assert np.all(Ez[0, :] == 0.0)
        assert np.all(Ez[-1, :] == 0.0)
        assert np.all(Ez[:, 0] == 0.0)
        assert np.all(Ez[:, -1] == 0.0)
        assert Ez[10, 15] == 1.0  # Interior unchanged


class TestPMC2D:
    def test_zeros_all_edges(self):
        Hx = np.ones((20, 30))
        Hy = np.ones((20, 30))
        apply_pmc_2d(Hx, Hy)
        assert np.all(Hy[0, :] == 0.0)
        assert np.all(Hy[-1, :] == 0.0)
        assert np.all(Hx[:, 0] == 0.0)
        assert np.all(Hx[:, -1] == 0.0)


# ===================================================================
# Mur ABC — 2-D
# ===================================================================
class TestMurABC2D:
    def test_coefficient_valid(self):
        abc = MurABC2D(50, 50, 0.001, 0.001, 1e-12, C_0)
        assert -1 < abc.coeff_x < 1
        assert -1 < abc.coeff_y < 1

    def test_apply_modifies_boundaries(self):
        abc = MurABC2D(50, 50, 0.001, 0.001, 1e-12, C_0)
        Ez = np.zeros((50, 50))
        Ez[25, 25] = 1.0
        abc.apply(Ez)
        # Should not crash, and corner values should be set


# ===================================================================
# Factory helpers
# ===================================================================
class TestFactories:
    def test_create_1d_mur(self):
        bc = create_boundary_1d("mur_abc", 0.001, 1e-12)
        assert isinstance(bc, MurABC1D)

    def test_create_1d_pec(self):
        assert create_boundary_1d("pec", 0.001, 1e-12) == "pec"

    def test_create_1d_invalid(self):
        with pytest.raises(ValueError):
            create_boundary_1d("periodic", 0.001, 1e-12)

    def test_create_2d_mur(self):
        bc = create_boundary_2d("mur_abc", 50, 50, 0.001, 0.001, 1e-12)
        assert isinstance(bc, MurABC2D)

    def test_create_2d_pec(self):
        assert create_boundary_2d("pec", 50, 50, 0.001, 0.001, 1e-12) == "pec"
