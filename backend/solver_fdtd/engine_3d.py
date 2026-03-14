"""
3-D FDTD Engine — Full Yee grid with all 6 field components.

Update equations (leapfrog):
  Hx^{n+½} = Hx^{n-½} − (Δt/μ)[(∂Ez/∂y) − (∂Ey/∂z)]
  Hy^{n+½} = Hy^{n-½} − (Δt/μ)[(∂Ex/∂z) − (∂Ez/∂x)]
  Hz^{n+½} = Hz^{n-½} − (Δt/μ)[(∂Ey/∂x) − (∂Ex/∂y)]
  Ex^{n+1} = Ca·Ex^n + Cb·[(∂Hz/∂y) − (∂Hy/∂z)]
  Ey^{n+1} = Ca·Ey^n + Cb·[(∂Hx/∂z) − (∂Hz/∂x)]
  Ez^{n+1} = Ca·Ez^n + Cb·[(∂Hy/∂x) − (∂Hx/∂y)]

CFL limit: dt_max = 1 / (c · √(1/dx² + 1/dy² + 1/dz²))

Field layout (Yee staggered grid, 3-D):
  Ex(i, j+½, k+½)   Ey(i+½, j, k+½)   Ez(i+½, j+½, k)
  Hx(i+½, j, k)     Hy(i, j+½, k)     Hz(i, j, k+½)
"""

import time as _time

import numpy as np

from backend.common.constants import C_0
from backend.common.models.fdtd import FdtdConfig, compute_courant_limit

from .boundaries import MurABC3D, apply_pec_3d
from .engine_common import (
    compute_update_coefficients,
    dft_accumulator_init,
    dft_accumulator_update,
    evaluate_source,
    get_array_module,
)
from .probes import LineProbe, PlaneProbe, PointProbe


MU_0 = 4.0 * np.pi * 1e-7


# ===================================================================
# 3-D single time step
# ===================================================================
def fdtd_3d_step(
    Ex: np.ndarray,
    Ey: np.ndarray,
    Ez: np.ndarray,
    Hx: np.ndarray,
    Hy: np.ndarray,
    Hz: np.ndarray,
    Ca_x: np.ndarray,
    Cb_x: np.ndarray,
    Ca_y: np.ndarray,
    Cb_y: np.ndarray,
    Ca_z: np.ndarray,
    Cb_z: np.ndarray,
    dt: float,
    dx: float,
    dy: float,
    dz: float,
    mu_r: np.ndarray,
    xp=None,
) -> None:
    """Single 3-D leapfrog time step (in-place).

    Updates H fields (half-step) then E fields (full step).

    All field arrays have shape (nx, ny, nz).
    """
    if xp is None:
        xp = np

    # ------------------------------------------------------------------
    # H-field half-step  (curl E)
    # ------------------------------------------------------------------
    # Hx -= (dt/μ) * [(∂Ez/∂y) - (∂Ey/∂z)]
    Hx[:, :-1, :-1] -= (dt / (mu_r[:, :-1, :-1] * MU_0)) * (
        (Ez[:, 1:, :-1] - Ez[:, :-1, :-1]) / dy
        - (Ey[:, :-1, 1:] - Ey[:, :-1, :-1]) / dz
    )

    # Hy -= (dt/μ) * [(∂Ex/∂z) - (∂Ez/∂x)]
    Hy[:-1, :, :-1] -= (dt / (mu_r[:-1, :, :-1] * MU_0)) * (
        (Ex[:-1, :, 1:] - Ex[:-1, :, :-1]) / dz
        - (Ez[1:, :, :-1] - Ez[:-1, :, :-1]) / dx
    )

    # Hz -= (dt/μ) * [(∂Ey/∂x) - (∂Ex/∂y)]
    Hz[:-1, :-1, :] -= (dt / (mu_r[:-1, :-1, :] * MU_0)) * (
        (Ey[1:, :-1, :] - Ey[:-1, :-1, :]) / dx
        - (Ex[:-1, 1:, :] - Ex[:-1, :-1, :]) / dy
    )

    # ------------------------------------------------------------------
    # E-field full step  (curl H)
    # ------------------------------------------------------------------
    # Ex = Ca_x * Ex + Cb_x * [(∂Hz/∂y) - (∂Hy/∂z)]
    Ex[:, 1:, 1:] = (
        Ca_x[:, 1:, 1:] * Ex[:, 1:, 1:]
        + Cb_x[:, 1:, 1:] * (
            (Hz[:, 1:, 1:] - Hz[:, :-1, 1:]) / dy
            - (Hy[:, 1:, 1:] - Hy[:, 1:, :-1]) / dz
        )
    )

    # Ey = Ca_y * Ey + Cb_y * [(∂Hx/∂z) - (∂Hz/∂x)]
    Ey[1:, :, 1:] = (
        Ca_y[1:, :, 1:] * Ey[1:, :, 1:]
        + Cb_y[1:, :, 1:] * (
            (Hx[1:, :, 1:] - Hx[1:, :, :-1]) / dz
            - (Hz[1:, :, 1:] - Hz[:-1, :, 1:]) / dx
        )
    )

    # Ez = Ca_z * Ez + Cb_z * [(∂Hy/∂x) - (∂Hx/∂y)]
    Ez[1:, 1:, :] = (
        Ca_z[1:, 1:, :] * Ez[1:, 1:, :]
        + Cb_z[1:, 1:, :] * (
            (Hy[1:, 1:, :] - Hy[:-1, 1:, :]) / dx
            - (Hx[1:, 1:, :] - Hx[1:, :-1, :]) / dy
        )
    )


# ===================================================================
# Full 3-D simulation runner
# ===================================================================
def run_fdtd_3d(
    nx: int,
    ny: int,
    nz: int,
    dx: float,
    dy: float,
    dz: float,
    config: FdtdConfig,
    sources: list[dict],
    boundary_type: str = "mur_abc",
    epsilon_r: np.ndarray | None = None,
    mu_r: np.ndarray | None = None,
    sigma: np.ndarray | None = None,
    probes: list[PointProbe | LineProbe | PlaneProbe] | None = None,
    inject_component: str = "Ez",
) -> dict:
    """Execute a complete 3-D FDTD simulation.

    Args:
        nx, ny, nz: Grid cell counts.
        dx, dy, dz: Cell sizes [m].
        config: Solver configuration.
        sources: List of source dicts with keys:
            ix, iy, iz, type, parameters, soft (optional, default True),
            component (optional, default 'Ez').
        boundary_type: 'mur_abc', 'pec', or 'pmc'.
        epsilon_r: Relative permittivity (nx, ny, nz). Default vacuum.
        mu_r: Relative permeability (nx, ny, nz). Default 1.0.
        sigma: Conductivity (nx, ny, nz) [S/m]. Default 0.0.
        probes: Optional list of probes.
        inject_component: Default source injection component.

    Returns:
        dict with keys: fields_final, probe_data, dft_results,
                        total_time_steps, dt, solve_time_s, mode.
    """
    xp = get_array_module()
    t_start = _time.perf_counter()

    shape = (nx, ny, nz)

    # Material arrays
    if epsilon_r is None:
        epsilon_r = xp.ones(shape, dtype=xp.float64)
    if mu_r is None:
        mu_r = xp.ones(shape, dtype=xp.float64)
    if sigma is None:
        sigma = xp.zeros(shape, dtype=xp.float64)

    # Time step (3-D CFL)
    dt_max = compute_courant_limit(dx, dy, dz)
    dt = config.courant_number * dt_max

    if probes is None:
        probes = []

    # Update coefficients (per-component; same material for all in isotropic)
    Ca, Cb = compute_update_coefficients(epsilon_r, sigma, dt, xp)
    Ca_x, Cb_x = Ca.copy(), Cb.copy()
    Ca_y, Cb_y = Ca.copy(), Cb.copy()
    Ca_z, Cb_z = Ca.copy(), Cb.copy()

    # Field arrays
    Ex = xp.zeros(shape, dtype=xp.float64)
    Ey = xp.zeros(shape, dtype=xp.float64)
    Ez = xp.zeros(shape, dtype=xp.float64)
    Hx = xp.zeros(shape, dtype=xp.float64)
    Hy = xp.zeros(shape, dtype=xp.float64)
    Hz = xp.zeros(shape, dtype=xp.float64)

    # Boundary
    abc = None
    if boundary_type == "mur_abc":
        abc = MurABC3D(nx, ny, nz, dx, dy, dz, dt, C_0)

    # DFT accumulator (on Ez by default)
    dft_acc = None
    if config.dft_frequencies:
        dft_acc = dft_accumulator_init(shape, config.dft_frequencies, xp)

    # Field component lookup for source injection
    field_map = {"Ex": Ex, "Ey": Ey, "Ez": Ez, "Hx": Hx, "Hy": Hy, "Hz": Hz}

    n_steps = config.num_time_steps
    for n in range(n_steps):
        t = n * dt

        fdtd_3d_step(
            Ex, Ey, Ez, Hx, Hy, Hz,
            Ca_x, Cb_x, Ca_y, Cb_y, Ca_z, Cb_z,
            dt, dx, dy, dz, mu_r, xp,
        )

        # Source injection
        for src in sources:
            ix, iy, iz = src["ix"], src["iy"], src["iz"]
            comp = src.get("component", inject_component)
            val = evaluate_source(src["type"], t, src["parameters"])
            target = field_map[comp]
            if src.get("soft", True):
                target[ix, iy, iz] += val
            else:
                target[ix, iy, iz] = val

        # Boundaries
        if boundary_type == "pec":
            apply_pec_3d(Ex, Ey, Ez)
        elif abc is not None:
            abc.apply(Ex, Ey, Ez)

        # DFT (accumulate Ez)
        if dft_acc is not None:
            dft_accumulator_update(dft_acc, Ez, dt, n, config.dft_frequencies, xp)

        # Probes
        if n % config.output_every_n_steps == 0:
            fields = {
                "Ex": Ex, "Ey": Ey, "Ez": Ez,
                "Hx": Hx, "Hy": Hy, "Hz": Hz,
            }
            for p in probes:
                if isinstance(p, PointProbe):
                    p.record_3d(fields, t)
                elif isinstance(p, PlaneProbe):
                    p.record_3d(fields, t)

    # DFT results
    dft_results = _collect_dft(dft_acc, config.dft_frequencies)

    solve_time = _time.perf_counter() - t_start
    return {
        "fields_final": {
            "Ex": Ex.tolist(),
            "Ey": Ey.tolist(),
            "Ez": Ez.tolist(),
            "Hx": Hx.tolist(),
            "Hy": Hy.tolist(),
            "Hz": Hz.tolist(),
        },
        "probe_data": [p.to_dict() for p in probes],
        "dft_results": dft_results,
        "total_time_steps": n_steps,
        "dt": dt,
        "solve_time_s": solve_time,
        "mode": "3d",
    }


# -------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------
def _collect_dft(dft_acc, frequencies):
    """Convert DFT accumulator to serialisable dict."""
    if dft_acc is None:
        return {}
    results = {}
    for i, f in enumerate(frequencies):
        arr = dft_acc[i]
        if hasattr(arr, "get"):
            arr = arr.get()
        results[f] = {
            "real": arr.real.tolist(),
            "imag": arr.imag.tolist(),
        }
    return results
