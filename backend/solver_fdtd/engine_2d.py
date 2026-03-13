"""
2-D FDTD Engine — TM and TE modes.

TM mode (Ez, Hx, Hy):
  ∂Hx/∂t = -(1/μ) ∂Ez/∂y
  ∂Hy/∂t =  (1/μ) ∂Ez/∂x
  ∂Ez/∂t =  (1/ε)(∂Hy/∂x − ∂Hx/∂y) − (σ/ε)Ez

TE mode (Hz, Ex, Ey):
  ∂Ex/∂t =  (1/ε) ∂Hz/∂y  − (σ/ε)Ex
  ∂Ey/∂t = -(1/ε) ∂Hz/∂x  − (σ/ε)Ey
  ∂Hz/∂t = -(1/μ)(∂Ey/∂x − ∂Ex/∂y)

Field layout (Yee staggered grid, 2-D):
  Ez(i,j)   — integer positions
  Hx(i,j+½) — half-step in y
  Hy(i+½,j) — half-step in x
"""

import time as _time

import numpy as np

from backend.common.constants import C_0
from backend.common.models.fdtd import FdtdConfig, compute_courant_limit

from .boundaries import MurABC2D, apply_pec_2d
from .engine_common import (
    compute_update_coefficients,
    dft_accumulator_init,
    dft_accumulator_update,
    evaluate_source,
    get_array_module,
)
from .probes import LineProbe, PlaneProbe, PointProbe


# ===================================================================
# TM-mode single step
# ===================================================================
def fdtd_2d_step_tm(
    Ez: np.ndarray,
    Hx: np.ndarray,
    Hy: np.ndarray,
    Ca: np.ndarray,
    Cb: np.ndarray,
    dt: float,
    dx: float,
    dy: float,
    mu_r: np.ndarray,
    xp=None,
) -> None:
    """Single 2-D TM-mode leapfrog time step (in-place).

    Updates H fields (half-step) then E field (full step).

    Args:
        Ez: (nx, ny) E-field z-component.
        Hx: (nx, ny) H-field x-component.
        Hy: (nx, ny) H-field y-component.
        Ca, Cb: Update coefficient arrays (nx, ny).
        dt: Time step [s].
        dx, dy: Cell sizes [m].
        mu_r: Relative permeability (nx, ny).
        xp: Array module.
    """
    if xp is None:
        xp = np
    mu0 = 4.0 * np.pi * 1e-7

    # --- H-field half-step ---
    # Hx: ∂Hx/∂t = -(1/μ) ∂Ez/∂y
    Hx[:, :-1] -= (dt / (mu_r[:, :-1] * mu0 * dy)) * (Ez[:, 1:] - Ez[:, :-1])

    # Hy: ∂Hy/∂t = (1/μ) ∂Ez/∂x
    Hy[:-1, :] += (dt / (mu_r[:-1, :] * mu0 * dx)) * (Ez[1:, :] - Ez[:-1, :])

    # --- E-field full-step ---
    # Ez: ∂Ez/∂t = (1/ε)(∂Hy/∂x − ∂Hx/∂y) − (σ/ε)Ez
    Ez[1:, 1:] = (
        Ca[1:, 1:] * Ez[1:, 1:]
        + Cb[1:, 1:]
        * (
            (Hy[1:, 1:] - Hy[:-1, 1:]) / dx
            - (Hx[1:, 1:] - Hx[1:, :-1]) / dy
        )
    )


# ===================================================================
# TE-mode single step
# ===================================================================
def fdtd_2d_step_te(
    Hz: np.ndarray,
    Ex: np.ndarray,
    Ey: np.ndarray,
    Ca_x: np.ndarray,
    Cb_x: np.ndarray,
    Ca_y: np.ndarray,
    Cb_y: np.ndarray,
    dt: float,
    dx: float,
    dy: float,
    mu_r: np.ndarray,
    xp=None,
) -> None:
    """Single 2-D TE-mode leapfrog time step (in-place).

    Args:
        Hz: (nx, ny) H-field z-component.
        Ex: (nx, ny) E-field x-component.
        Ey: (nx, ny) E-field y-component.
        Ca_x, Cb_x: Update coefficients for Ex.
        Ca_y, Cb_y: Update coefficients for Ey.
        dt, dx, dy: Time/space steps.
        mu_r: Relative permeability (nx, ny).
        xp: Array module.
    """
    if xp is None:
        xp = np
    mu0 = 4.0 * np.pi * 1e-7

    # --- E-field half-step ---
    # Ex: ∂Ex/∂t = (1/ε) ∂Hz/∂y − (σ/ε)Ex
    Ex[:, 1:] = Ca_x[:, 1:] * Ex[:, 1:] + Cb_x[:, 1:] * (Hz[:, 1:] - Hz[:, :-1]) / dy

    # Ey: ∂Ey/∂t = -(1/ε) ∂Hz/∂x − (σ/ε)Ey
    Ey[1:, :] = Ca_y[1:, :] * Ey[1:, :] - Cb_y[1:, :] * (Hz[1:, :] - Hz[:-1, :]) / dx

    # --- H-field full-step ---
    # Hz: ∂Hz/∂t = -(1/μ)(∂Ey/∂x − ∂Ex/∂y)
    Hz[:-1, :-1] -= (dt / (mu_r[:-1, :-1] * mu0)) * (
        (Ey[1:, :-1] - Ey[:-1, :-1]) / dx - (Ex[:-1, 1:] - Ex[:-1, :-1]) / dy
    )


# ===================================================================
# Full 2-D TM simulation runner
# ===================================================================
def run_fdtd_2d(
    nx: int,
    ny: int,
    dx: float,
    dy: float,
    config: FdtdConfig,
    sources: list[dict],
    boundary_type: str = "mur_abc",
    epsilon_r: np.ndarray | None = None,
    mu_r: np.ndarray | None = None,
    sigma: np.ndarray | None = None,
    probes: list[PointProbe | LineProbe | PlaneProbe] | None = None,
    mode: str = "tm",
) -> dict:
    """Execute a complete 2-D FDTD simulation.

    Args:
        nx, ny: Grid cell counts.
        dx, dy: Cell sizes [m].
        config: Solver configuration.
        sources: List of source dicts with keys:
            ix, iy, type, parameters, soft (optional, default True).
        boundary_type: 'mur_abc', 'pec', or 'pmc'.
        epsilon_r: Relative permittivity (nx, ny). Default vacuum.
        mu_r: Relative permeability (nx, ny). Default 1.0.
        sigma: Conductivity (nx, ny) [S/m]. Default 0.0.
        probes: Optional list of probes.
        mode: 'tm' (Ez,Hx,Hy) or 'te' (Hz,Ex,Ey).

    Returns:
        dict with keys:
            fields_final: dict of final field arrays (as lists)
            probe_data: list of probe result dicts
            dft_results: dict keyed by frequency
            total_time_steps: int
            dt: float
            solve_time_s: float
            mode: str
    """
    xp = get_array_module()
    t_start = _time.perf_counter()

    # Material arrays
    if epsilon_r is None:
        epsilon_r = xp.ones((nx, ny), dtype=xp.float64)
    if mu_r is None:
        mu_r = xp.ones((nx, ny), dtype=xp.float64)
    if sigma is None:
        sigma = xp.zeros((nx, ny), dtype=xp.float64)

    # Time step
    dt_max = compute_courant_limit(dx, dy)
    dt = config.courant_number * dt_max

    if probes is None:
        probes = []

    if mode == "tm":
        result = _run_tm(nx, ny, dx, dy, dt, config, sources, boundary_type,
                         epsilon_r, mu_r, sigma, probes, xp)
    elif mode == "te":
        result = _run_te(nx, ny, dx, dy, dt, config, sources, boundary_type,
                         epsilon_r, mu_r, sigma, probes, xp)
    else:
        raise ValueError(f"mode must be 'tm' or 'te', got '{mode}'")

    result["dt"] = dt
    result["solve_time_s"] = _time.perf_counter() - t_start
    result["mode"] = mode
    return result


# -------------------------------------------------------------------
# Internal: TM runner
# -------------------------------------------------------------------
def _run_tm(nx, ny, dx, dy, dt, config, sources, boundary_type,
            epsilon_r, mu_r, sigma, probes, xp):
    Ca, Cb = compute_update_coefficients(epsilon_r, sigma, dt, xp)

    Ez = xp.zeros((nx, ny), dtype=xp.float64)
    Hx = xp.zeros((nx, ny), dtype=xp.float64)
    Hy = xp.zeros((nx, ny), dtype=xp.float64)

    # Boundary
    abc = None
    if boundary_type == "mur_abc":
        abc = MurABC2D(nx, ny, dx, dy, dt, C_0)

    # DFT
    dft_acc = None
    if config.dft_frequencies:
        dft_acc = dft_accumulator_init((nx, ny), config.dft_frequencies, xp)

    n_steps = config.num_time_steps
    for n in range(n_steps):
        t = n * dt

        fdtd_2d_step_tm(Ez, Hx, Hy, Ca, Cb, dt, dx, dy, mu_r, xp)

        # Source injection
        for src in sources:
            ix, iy = src["ix"], src["iy"]
            val = evaluate_source(src["type"], t, src["parameters"])
            if src.get("soft", True):
                Ez[ix, iy] += val
            else:
                Ez[ix, iy] = val

        # Boundaries
        if boundary_type == "pec":
            apply_pec_2d(Ez)
        elif abc is not None:
            abc.apply(Ez)

        # DFT
        if dft_acc is not None:
            dft_accumulator_update(dft_acc, Ez, dt, n, config.dft_frequencies, xp)

        # Probes
        if n % config.output_every_n_steps == 0:
            fields = {"Ez": Ez, "Hx": Hx, "Hy": Hy}
            for p in probes:
                if isinstance(p, PointProbe):
                    p.record_2d(fields, t)
                elif isinstance(p, LineProbe):
                    p.record_2d(fields, t)
                elif isinstance(p, PlaneProbe):
                    p.record_2d(fields, t)

    # DFT results
    dft_results = _collect_dft(dft_acc, config.dft_frequencies)

    return {
        "fields_final": {
            "Ez": Ez.tolist(),
            "Hx": Hx.tolist(),
            "Hy": Hy.tolist(),
        },
        "probe_data": [p.to_dict() for p in probes],
        "dft_results": dft_results,
        "total_time_steps": n_steps,
    }


# -------------------------------------------------------------------
# Internal: TE runner
# -------------------------------------------------------------------
def _run_te(nx, ny, dx, dy, dt, config, sources, boundary_type,
            epsilon_r, mu_r, sigma, probes, xp):
    Ca_x, Cb_x = compute_update_coefficients(epsilon_r, sigma, dt, xp)
    Ca_y, Cb_y = Ca_x.copy(), Cb_x.copy()  # Same material for both axes

    Hz = xp.zeros((nx, ny), dtype=xp.float64)
    Ex = xp.zeros((nx, ny), dtype=xp.float64)
    Ey = xp.zeros((nx, ny), dtype=xp.float64)

    # Boundary — for TE we need ABC on Hz
    abc = None
    if boundary_type == "mur_abc":
        abc = MurABC2D(nx, ny, dx, dy, dt, C_0)

    dft_acc = None
    if config.dft_frequencies:
        dft_acc = dft_accumulator_init((nx, ny), config.dft_frequencies, xp)

    n_steps = config.num_time_steps
    for n in range(n_steps):
        t = n * dt

        fdtd_2d_step_te(Hz, Ex, Ey, Ca_x, Cb_x, Ca_y, Cb_y, dt, dx, dy, mu_r, xp)

        # Source injection (into Hz for TE mode)
        for src in sources:
            ix, iy = src["ix"], src["iy"]
            val = evaluate_source(src["type"], t, src["parameters"])
            if src.get("soft", True):
                Hz[ix, iy] += val
            else:
                Hz[ix, iy] = val

        # Boundaries (on Hz)
        if boundary_type == "pec":
            apply_pec_2d(Hz)
        elif abc is not None:
            abc.apply(Hz)

        # DFT on Hz
        if dft_acc is not None:
            dft_accumulator_update(dft_acc, Hz, dt, n, config.dft_frequencies, xp)

        # Probes
        if n % config.output_every_n_steps == 0:
            fields = {"Hz": Hz, "Ex": Ex, "Ey": Ey}
            for p in probes:
                if isinstance(p, PointProbe):
                    p.record_2d(fields, t)
                elif isinstance(p, LineProbe):
                    p.record_2d(fields, t)
                elif isinstance(p, PlaneProbe):
                    p.record_2d(fields, t)

    dft_results = _collect_dft(dft_acc, config.dft_frequencies)

    return {
        "fields_final": {
            "Hz": Hz.tolist(),
            "Ex": Ex.tolist(),
            "Ey": Ey.tolist(),
        },
        "probe_data": [p.to_dict() for p in probes],
        "dft_results": dft_results,
        "total_time_steps": n_steps,
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
