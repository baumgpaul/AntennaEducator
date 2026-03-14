"""
FDTD boundary conditions.

Implements:
- Mur first-order absorbing boundary condition (ABC) for 1-D and 2-D
- Perfect Electric Conductor (PEC)
- Perfect Magnetic Conductor (PMC)
"""

import numpy as np

from backend.common.constants import C_0


# ===================================================================
# 1-D Boundary Conditions
# ===================================================================

class MurABC1D:
    """First-order Mur absorbing boundary condition for 1-D FDTD.

    Stores one previous boundary value per side and applies the Mur
    first-order update at each time step.

    Usage:
        abc = MurABC1D(dx, dt, c)
        # ... after E-field update each step:
        abc.apply(Ez)
    """

    def __init__(self, dx: float, dt: float, c: float = C_0):
        self.coeff = (c * dt - dx) / (c * dt + dx)
        self._prev_left = 0.0
        self._prev_right = 0.0
        self._prev_left_inner = 0.0
        self._prev_right_inner = 0.0

    def apply(self, Ez: np.ndarray) -> None:
        """Apply Mur ABC to both ends of Ez (modified in-place)."""
        # Left boundary (index 0)
        Ez[0] = self._prev_left_inner + self.coeff * (Ez[1] - self._prev_left)
        # Right boundary (index -1)
        n = len(Ez)
        Ez[n - 1] = self._prev_right_inner + self.coeff * (Ez[n - 2] - self._prev_right)
        # Store for next step
        self._prev_left = float(Ez[0])
        self._prev_right = float(Ez[n - 1])
        self._prev_left_inner = float(Ez[1])
        self._prev_right_inner = float(Ez[n - 2])


def apply_pec_1d(Ez: np.ndarray) -> None:
    """PEC boundary: E tangential = 0 at both ends."""
    Ez[0] = 0.0
    Ez[-1] = 0.0


def apply_pmc_1d(Hy: np.ndarray) -> None:
    """PMC boundary: H tangential = 0 at both ends."""
    Hy[0] = 0.0
    Hy[-1] = 0.0


# ===================================================================
# 2-D Boundary Conditions
# ===================================================================

class MurABC2D:
    """First-order Mur absorbing boundary condition for 2-D FDTD.

    Applies the Mur update to all four edges of a 2-D field
    (typically Ez for TM mode).

    Usage:
        abc = MurABC2D(nx, ny, dx, dy, dt, c)
        # ... after E-field update each step:
        abc.apply(Ez)
    """

    def __init__(
        self,
        nx: int,
        ny: int,
        dx: float,
        dy: float,
        dt: float,
        c: float = C_0,
    ):
        self.nx = nx
        self.ny = ny
        self.coeff_x = (c * dt - dx) / (c * dt + dx)
        self.coeff_y = (c * dt - dy) / (c * dt + dy)

        # Previous boundary values: edges are 1-D arrays
        self._prev_xmin = np.zeros(ny)
        self._prev_xmax = np.zeros(ny)
        self._prev_ymin = np.zeros(nx)
        self._prev_ymax = np.zeros(nx)

        self._prev_xmin_inner = np.zeros(ny)
        self._prev_xmax_inner = np.zeros(ny)
        self._prev_ymin_inner = np.zeros(nx)
        self._prev_ymax_inner = np.zeros(nx)

    def apply(self, Ez: np.ndarray) -> None:
        """Apply Mur ABC to all four edges of a 2-D Ez array (nx, ny).

        Skips x/y faces when that dimension has fewer than 2 cells
        (the Mur stencil needs at least one interior neighbour).
        """
        # x faces (need nx >= 2)
        if self.nx >= 2:
            Ez[0, :] = self._prev_xmin_inner + self.coeff_x * (Ez[1, :] - self._prev_xmin)
            Ez[-1, :] = self._prev_xmax_inner + self.coeff_x * (Ez[-2, :] - self._prev_xmax)

        # y faces (need ny >= 2)
        if self.ny >= 2:
            Ez[:, 0] = self._prev_ymin_inner + self.coeff_y * (Ez[:, 1] - self._prev_ymin)
            Ez[:, -1] = self._prev_ymax_inner + self.coeff_y * (Ez[:, -2] - self._prev_ymax)

        # Store for next step
        self._prev_xmin = Ez[0, :].copy()
        self._prev_xmax = Ez[-1, :].copy()
        self._prev_ymin = Ez[:, 0].copy()
        self._prev_ymax = Ez[:, -1].copy()
        if self.nx >= 2:
            self._prev_xmin_inner = Ez[1, :].copy()
            self._prev_xmax_inner = Ez[-2, :].copy()
        if self.ny >= 2:
            self._prev_ymin_inner = Ez[:, 1].copy()
            self._prev_ymax_inner = Ez[:, -2].copy()


def apply_pec_2d(Ez: np.ndarray) -> None:
    """PEC boundary: E tangential = 0 at all four edges."""
    Ez[0, :] = 0.0
    Ez[-1, :] = 0.0
    Ez[:, 0] = 0.0
    Ez[:, -1] = 0.0


def apply_pmc_2d(Hx: np.ndarray, Hy: np.ndarray) -> None:
    """PMC boundary: H tangential = 0 at all four edges."""
    # x boundaries: Hy = 0
    Hy[0, :] = 0.0
    Hy[-1, :] = 0.0
    # y boundaries: Hx = 0
    Hx[:, 0] = 0.0
    Hx[:, -1] = 0.0


# ---------------------------------------------------------------------------
# Factory helpers
# ---------------------------------------------------------------------------
def create_boundary_1d(
    bc_type: str,
    dx: float,
    dt: float,
    c: float = C_0,
):
    """Create a 1-D boundary handler.

    Returns a callable / object depending on type:
        'mur_abc' → MurABC1D instance
        'pec' → string tag (applied via apply_pec_1d)
        'pmc' → string tag (applied via apply_pmc_1d)
    """
    if bc_type == "mur_abc":
        return MurABC1D(dx, dt, c)
    if bc_type in ("pec", "pmc"):
        return bc_type
    raise ValueError(f"Unsupported 1-D boundary type: {bc_type}")


def create_boundary_2d(
    bc_type: str,
    nx: int,
    ny: int,
    dx: float,
    dy: float,
    dt: float,
    c: float = C_0,
):
    """Create a 2-D boundary handler.

    Returns a MurABC2D instance or a string tag for PEC/PMC.
    """
    if bc_type == "mur_abc":
        return MurABC2D(nx, ny, dx, dy, dt, c)
    if bc_type in ("pec", "pmc"):
        return bc_type
    raise ValueError(f"Unsupported 2-D boundary type: {bc_type}")
