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


# ===================================================================
# 3-D Boundary Conditions
# ===================================================================

class MurABC3D:
    """First-order Mur absorbing boundary condition for 3-D FDTD.

    Applies the Mur first-order update to all 6 faces of a 3-D domain.
    Each E-field tangential component is updated on its respective
    boundary faces.

    Usage:
        abc = MurABC3D(nx, ny, nz, dx, dy, dz, dt, c)
        # ... after E-field update each step:
        abc.apply(Ex, Ey, Ez)
    """

    def __init__(
        self,
        nx: int,
        ny: int,
        nz: int,
        dx: float,
        dy: float,
        dz: float,
        dt: float,
        c: float = C_0,
    ):
        self.nx = nx
        self.ny = ny
        self.nz = nz
        self.coeff_x = (c * dt - dx) / (c * dt + dx)
        self.coeff_y = (c * dt - dy) / (c * dt + dy)
        self.coeff_z = (c * dt - dz) / (c * dt + dz)

        # Previous boundary values for each E component on each face pair.
        # x-faces: Ey(0,:,:), Ey(-1,:,:), Ez(0,:,:), Ez(-1,:,:)
        self._prev_ey_x0 = np.zeros((ny, nz))
        self._prev_ey_x1 = np.zeros((ny, nz))
        self._prev_ez_x0 = np.zeros((ny, nz))
        self._prev_ez_x1 = np.zeros((ny, nz))
        self._prev_ey_x0_inner = np.zeros((ny, nz))
        self._prev_ey_x1_inner = np.zeros((ny, nz))
        self._prev_ez_x0_inner = np.zeros((ny, nz))
        self._prev_ez_x1_inner = np.zeros((ny, nz))

        # y-faces: Ex(:,0,:), Ex(:,-1,:), Ez(:,0,:), Ez(:,-1,:)
        self._prev_ex_y0 = np.zeros((nx, nz))
        self._prev_ex_y1 = np.zeros((nx, nz))
        self._prev_ez_y0 = np.zeros((nx, nz))
        self._prev_ez_y1 = np.zeros((nx, nz))
        self._prev_ex_y0_inner = np.zeros((nx, nz))
        self._prev_ex_y1_inner = np.zeros((nx, nz))
        self._prev_ez_y0_inner = np.zeros((nx, nz))
        self._prev_ez_y1_inner = np.zeros((nx, nz))

        # z-faces: Ex(:,:,0), Ex(:,:,-1), Ey(:,:,0), Ey(:,:,-1)
        self._prev_ex_z0 = np.zeros((nx, ny))
        self._prev_ex_z1 = np.zeros((nx, ny))
        self._prev_ey_z0 = np.zeros((nx, ny))
        self._prev_ey_z1 = np.zeros((nx, ny))
        self._prev_ex_z0_inner = np.zeros((nx, ny))
        self._prev_ex_z1_inner = np.zeros((nx, ny))
        self._prev_ey_z0_inner = np.zeros((nx, ny))
        self._prev_ey_z1_inner = np.zeros((nx, ny))

    def apply(self, Ex: np.ndarray, Ey: np.ndarray, Ez: np.ndarray) -> None:
        """Apply Mur ABC to all 6 faces of a 3-D domain.

        Updates the tangential E-field components at domain boundaries.
        Each face has 2 tangential E components.
        """
        # === x-faces (tangential: Ey, Ez) ===
        if self.nx >= 2:
            # x=0 face
            Ey[0, :, :] = self._prev_ey_x0_inner + self.coeff_x * (Ey[1, :, :] - self._prev_ey_x0)
            Ez[0, :, :] = self._prev_ez_x0_inner + self.coeff_x * (Ez[1, :, :] - self._prev_ez_x0)
            # x=-1 face
            Ey[-1, :, :] = self._prev_ey_x1_inner + self.coeff_x * (Ey[-2, :, :] - self._prev_ey_x1)
            Ez[-1, :, :] = self._prev_ez_x1_inner + self.coeff_x * (Ez[-2, :, :] - self._prev_ez_x1)

        # === y-faces (tangential: Ex, Ez) ===
        if self.ny >= 2:
            Ex[:, 0, :] = self._prev_ex_y0_inner + self.coeff_y * (Ex[:, 1, :] - self._prev_ex_y0)
            Ez[:, 0, :] = self._prev_ez_y0_inner + self.coeff_y * (Ez[:, 1, :] - self._prev_ez_y0)
            Ex[:, -1, :] = self._prev_ex_y1_inner + self.coeff_y * (Ex[:, -2, :] - self._prev_ex_y1)
            Ez[:, -1, :] = self._prev_ez_y1_inner + self.coeff_y * (Ez[:, -2, :] - self._prev_ez_y1)

        # === z-faces (tangential: Ex, Ey) ===
        if self.nz >= 2:
            Ex[:, :, 0] = self._prev_ex_z0_inner + self.coeff_z * (Ex[:, :, 1] - self._prev_ex_z0)
            Ey[:, :, 0] = self._prev_ey_z0_inner + self.coeff_z * (Ey[:, :, 1] - self._prev_ey_z0)
            Ex[:, :, -1] = self._prev_ex_z1_inner + self.coeff_z * (Ex[:, :, -2] - self._prev_ex_z1)
            Ey[:, :, -1] = self._prev_ey_z1_inner + self.coeff_z * (Ey[:, :, -2] - self._prev_ey_z1)

        # Store current boundary values for next step
        self._prev_ey_x0 = Ey[0, :, :].copy()
        self._prev_ey_x1 = Ey[-1, :, :].copy()
        self._prev_ez_x0 = Ez[0, :, :].copy()
        self._prev_ez_x1 = Ez[-1, :, :].copy()
        self._prev_ex_y0 = Ex[:, 0, :].copy()
        self._prev_ex_y1 = Ex[:, -1, :].copy()
        self._prev_ez_y0 = Ez[:, 0, :].copy()
        self._prev_ez_y1 = Ez[:, -1, :].copy()
        self._prev_ex_z0 = Ex[:, :, 0].copy()
        self._prev_ex_z1 = Ex[:, :, -1].copy()
        self._prev_ey_z0 = Ey[:, :, 0].copy()
        self._prev_ey_z1 = Ey[:, :, -1].copy()
        if self.nx >= 2:
            self._prev_ey_x0_inner = Ey[1, :, :].copy()
            self._prev_ey_x1_inner = Ey[-2, :, :].copy()
            self._prev_ez_x0_inner = Ez[1, :, :].copy()
            self._prev_ez_x1_inner = Ez[-2, :, :].copy()
        if self.ny >= 2:
            self._prev_ex_y0_inner = Ex[:, 1, :].copy()
            self._prev_ex_y1_inner = Ex[:, -2, :].copy()
            self._prev_ez_y0_inner = Ez[:, 1, :].copy()
            self._prev_ez_y1_inner = Ez[:, -2, :].copy()
        if self.nz >= 2:
            self._prev_ex_z0_inner = Ex[:, :, 1].copy()
            self._prev_ex_z1_inner = Ex[:, :, -2].copy()
            self._prev_ey_z0_inner = Ey[:, :, 1].copy()
            self._prev_ey_z1_inner = Ey[:, :, -2].copy()


def apply_pec_3d(
    Ex: np.ndarray,
    Ey: np.ndarray,
    Ez: np.ndarray,
) -> None:
    """PEC boundary: tangential E = 0 on all 6 faces.

    On each face the two tangential E components are zeroed.
    """
    # x-faces
    Ex[0, :, :] = 0.0
    Ex[-1, :, :] = 0.0
    Ey[0, :, :] = 0.0
    Ey[-1, :, :] = 0.0
    Ez[0, :, :] = 0.0
    Ez[-1, :, :] = 0.0

    # y-faces
    Ex[:, 0, :] = 0.0
    Ex[:, -1, :] = 0.0
    Ey[:, 0, :] = 0.0
    Ey[:, -1, :] = 0.0
    Ez[:, 0, :] = 0.0
    Ez[:, -1, :] = 0.0

    # z-faces
    Ex[:, :, 0] = 0.0
    Ex[:, :, -1] = 0.0
    Ey[:, :, 0] = 0.0
    Ey[:, :, -1] = 0.0
    Ez[:, :, 0] = 0.0
    Ez[:, :, -1] = 0.0


def apply_pmc_3d(
    Hx: np.ndarray,
    Hy: np.ndarray,
    Hz: np.ndarray,
) -> None:
    """PMC boundary: tangential H = 0 on all 6 faces."""
    Hx[0, :, :] = 0.0
    Hx[-1, :, :] = 0.0
    Hy[0, :, :] = 0.0
    Hy[-1, :, :] = 0.0
    Hz[0, :, :] = 0.0
    Hz[-1, :, :] = 0.0

    Hx[:, 0, :] = 0.0
    Hx[:, -1, :] = 0.0
    Hy[:, 0, :] = 0.0
    Hy[:, -1, :] = 0.0
    Hz[:, 0, :] = 0.0
    Hz[:, -1, :] = 0.0

    Hx[:, :, 0] = 0.0
    Hx[:, :, -1] = 0.0
    Hy[:, :, 0] = 0.0
    Hy[:, :, -1] = 0.0
    Hz[:, :, 0] = 0.0
    Hz[:, :, -1] = 0.0


def create_boundary_3d(
    bc_type: str,
    nx: int,
    ny: int,
    nz: int,
    dx: float,
    dy: float,
    dz: float,
    dt: float,
    c: float = C_0,
) -> MurABC3D | str:
    """Create a 3-D boundary condition handler.

    Returns a ``MurABC3D`` instance for ``"abc"`` or the literal
    string ``"pec"`` / ``"pmc"`` for PEC/PMC boundaries (handled
    inline in the engine loop).
    """
    if bc_type == "abc":
        return MurABC3D(nx, ny, nz, dx, dy, dz, dt, c)
    if bc_type in ("pec", "pmc"):
        return bc_type
    raise ValueError(f"Unsupported 3-D boundary type: {bc_type}")
