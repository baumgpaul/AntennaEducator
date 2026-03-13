"""
1-D FDTD Engine.

Implements the one-dimensional finite-difference time-domain method
with leapfrog time-stepping (Ez / Hy).  Educational — every update
equation is annotated with the underlying Maxwell curl relation.

Field layout (Yee grid, 1-D):
    Hy[0]   Ez[0]   Hy[1]   Ez[1]  ...  Hy[n-1]  Ez[n-1]
"""

import time as _time

import numpy as np

from backend.common.constants import C_0
from backend.common.models.fdtd import FdtdConfig, compute_courant_limit

from .boundaries import MurABC1D, apply_pec_1d
from .engine_common import (
    compute_update_coefficients,
    dft_accumulator_init,
    dft_accumulator_update,
    evaluate_source,
    get_array_module,
)
from .probes import LineProbe, PointProbe


# ---------------------------------------------------------------------------
# Single time step
# ---------------------------------------------------------------------------
def fdtd_1d_step(
    Ez: np.ndarray,
    Hy: np.ndarray,
    Ca: np.ndarray,
    Cb: np.ndarray,
    dt: float,
    dx: float,
    mu_r: np.ndarray,
    xp=None,
) -> None:
    """Advance Ez and Hy by one leapfrog time step (in-place).

    Maxwell's equations in 1-D (TEM, polarised along z):

      From Faraday: μ ∂Hy/∂t = (∂Ez/∂x)
        → Hy^{n+½}[i] = Hy^{n-½}[i] + (Δt / μΔx)(Ez^n[i+1] - Ez^n[i])

      From Ampere: ε ∂Ez/∂t + σ Ez = (∂Hy/∂x)
        → Ez^{n+1}[i] = Ca[i]·Ez^n[i] + Cb[i]·(Hy^{n+½}[i] − Hy^{n+½}[i−1])/Δx

    where Ca, Cb encode the lossy-dielectric update (see engine_common).
    """
    if xp is None:
        xp = np
    mu0 = 4.0 * np.pi * 1e-7

    # --- H-field half-step ---
    # Hy[i] sits at spatial position (i+0.5)*dx
    Hy[:-1] += (dt / (mu_r[:-1] * mu0 * dx)) * (Ez[1:] - Ez[:-1])

    # --- E-field full-step ---
    # Ez[i] sits at spatial position i*dx
    Ez[1:] = Ca[1:] * Ez[1:] + Cb[1:] * (Hy[1:] - Hy[:-1]) / dx


# ---------------------------------------------------------------------------
# Full simulation runner
# ---------------------------------------------------------------------------
def run_fdtd_1d(
    nx: int,
    dx: float,
    config: FdtdConfig,
    sources: list[dict],
    boundary_type: str = "mur_abc",
    epsilon_r: np.ndarray | None = None,
    mu_r: np.ndarray | None = None,
    sigma: np.ndarray | None = None,
    probes: list[PointProbe | LineProbe] | None = None,
) -> dict:
    """Execute a complete 1-D FDTD simulation.

    Args:
        nx: Number of cells.
        dx: Cell size [m].
        config: FdtdConfig with time steps, courant number, etc.
        sources: List of source dicts with keys:
            index, type, parameters, soft (optional, default True).
        boundary_type: 'mur_abc', 'pec', or 'pmc'.
        epsilon_r: Relative permittivity (nx,). Default vacuum.
        mu_r: Relative permeability (nx,). Default 1.0.
        sigma: Conductivity (nx,) [S/m]. Default 0.0.
        probes: Optional list of probes to record data.

    Returns:
        dict with keys:
            Ez_final, Hy_final: final field arrays
            probe_data: list of probe result dicts
            dft_results: dict keyed by frequency [Hz]
            total_time_steps: int
            dt: float
            solve_time_s: float
    """
    xp = get_array_module()
    t_start = _time.perf_counter()

    # Material arrays (default to vacuum)
    if epsilon_r is None:
        epsilon_r = xp.ones(nx, dtype=xp.float64)
    if mu_r is None:
        mu_r = xp.ones(nx, dtype=xp.float64)
    if sigma is None:
        sigma = xp.zeros(nx, dtype=xp.float64)

    # Time step from CFL
    dt_max = compute_courant_limit(dx)
    dt = config.courant_number * dt_max

    # Update coefficients
    Ca, Cb = compute_update_coefficients(epsilon_r, sigma, dt, xp)

    # Field arrays
    Ez = xp.zeros(nx, dtype=xp.float64)
    Hy = xp.zeros(nx, dtype=xp.float64)

    # Boundary condition
    if boundary_type == "mur_abc":
        abc = MurABC1D(dx, dt, C_0)
    else:
        abc = None

    # DFT accumulators
    dft_acc = None
    if config.dft_frequencies:
        dft_acc = dft_accumulator_init((nx,), config.dft_frequencies, xp)

    if probes is None:
        probes = []

    # --- Time-stepping loop ---
    n_steps = config.num_time_steps
    for n in range(n_steps):
        t = n * dt

        # 1) H-field update + E-field update
        fdtd_1d_step(Ez, Hy, Ca, Cb, dt, dx, mu_r, xp)

        # 2) Source injection (after field update for soft sources)
        for src in sources:
            idx = src["index"]
            val = evaluate_source(src["type"], t, src["parameters"])
            if src.get("soft", True):
                Ez[idx] += val
            else:
                Ez[idx] = val

        # 3) Boundary conditions
        if boundary_type == "pec":
            apply_pec_1d(Ez)
        elif abc is not None:
            abc.apply(Ez)
        # PMC: handled via natural open boundary (Hy endpoints not updated)

        # 4) DFT accumulation
        if dft_acc is not None:
            dft_accumulator_update(dft_acc, Ez, dt, n, config.dft_frequencies, xp)

        # 5) Probe recording
        if n % config.output_every_n_steps == 0:
            for p in probes:
                p.record_1d(Ez, Hy, t)

    solve_time = _time.perf_counter() - t_start

    # Build DFT results dict
    dft_results = {}
    if dft_acc is not None:
        for i, f in enumerate(config.dft_frequencies):
            arr = dft_acc[i]
            if hasattr(arr, "get"):
                arr = arr.get()  # CuPy → NumPy
            dft_results[f] = {
                "real": arr.real.tolist(),
                "imag": arr.imag.tolist(),
            }

    # Convert final fields to lists for serialisation
    Ez_final = Ez.tolist() if hasattr(Ez, "tolist") else list(Ez)
    Hy_final = Hy.tolist() if hasattr(Hy, "tolist") else list(Hy)

    return {
        "Ez_final": Ez_final,
        "Hy_final": Hy_final,
        "probe_data": [p.to_dict() for p in probes],
        "dft_results": dft_results,
        "total_time_steps": n_steps,
        "dt": dt,
        "solve_time_s": solve_time,
    }
