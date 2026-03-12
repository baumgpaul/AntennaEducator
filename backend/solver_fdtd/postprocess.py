"""
FDTD post-processing utilities.

On-the-fly DFT normalisation, S-parameter extraction from
time-domain probe signals, and energy computation.
"""

import math

import numpy as np


def normalise_dft(
    dft_field: np.ndarray,
    dt: float,
    n_steps: int,
) -> np.ndarray:
    """Normalise a DFT accumulator result by Δt.

    The raw running DFT sums field(n)·exp(-j2πfnΔt). Multiplying by Δt
    gives the discrete approximation of the continuous Fourier transform.
    """
    return dft_field * dt


def s_parameter_from_probes(
    incident_values: list[float],
    reflected_values: list[float],
    times: list[float],
    frequencies: list[float],
) -> dict:
    """Compute S₁₁ (reflection coefficient) from time-domain probe data.

    Performs DFT on incident and reflected signals and computes
    S₁₁(f) = V_reflected(f) / V_incident(f).

    Args:
        incident_values: Time-domain incident signal.
        reflected_values: Time-domain reflected signal.
        times: Time stamps [s] for the signals.
        frequencies: Frequencies [Hz] at which to evaluate S₁₁.

    Returns:
        dict with:
            frequencies: list[float]
            s11_mag_db: list[float] — |S₁₁| in dB
            s11_phase_deg: list[float] — phase of S₁₁ in degrees
            s11_complex: list of {real, imag}
    """
    inc = np.array(incident_values)
    ref = np.array(reflected_values)
    t = np.array(times)
    n = len(t)
    dt = t[1] - t[0] if n > 1 else 1.0

    s11_complex = []
    s11_mag_db = []
    s11_phase_deg = []

    for f in frequencies:
        # DFT at frequency f
        kernel = np.exp(-1j * 2 * np.pi * f * t)
        V_inc = np.sum(inc * kernel) * dt
        V_ref = np.sum(ref * kernel) * dt

        if abs(V_inc) < 1e-30:
            s11 = 0.0 + 0.0j
        else:
            s11 = V_ref / V_inc

        s11_complex.append({"real": s11.real, "imag": s11.imag})
        mag = abs(s11)
        s11_mag_db.append(20.0 * math.log10(max(mag, 1e-30)))
        s11_phase_deg.append(math.degrees(math.atan2(s11.imag, s11.real)))

    return {
        "frequencies": frequencies,
        "s11_mag_db": s11_mag_db,
        "s11_phase_deg": s11_phase_deg,
        "s11_complex": s11_complex,
    }


def compute_field_energy_1d(
    Ez: np.ndarray,
    Hy: np.ndarray,
    dx: float,
    epsilon_r: np.ndarray | None = None,
    mu_r: np.ndarray | None = None,
) -> float:
    """Compute total electromagnetic energy in a 1-D domain.

    W = (1/2) Σ [ε|Ez|² + μ|Hy|²] Δx
    """
    eps0 = 8.854187817e-12
    mu0 = 4.0 * np.pi * 1e-7

    if epsilon_r is None:
        epsilon_r = np.ones_like(Ez)
    if mu_r is None:
        mu_r = np.ones_like(Hy)

    W_e = 0.5 * np.sum(epsilon_r * eps0 * Ez**2) * dx
    W_m = 0.5 * np.sum(mu_r * mu0 * Hy**2) * dx
    return float(W_e + W_m)


def compute_field_energy_2d(
    Ez: np.ndarray,
    Hx: np.ndarray,
    Hy: np.ndarray,
    dx: float,
    dy: float,
    epsilon_r: np.ndarray | None = None,
    mu_r: np.ndarray | None = None,
) -> float:
    """Compute total electromagnetic energy in a 2-D TM domain.

    W = (1/2) Σ [ε₀εᵣ|Ez|² + μ₀μᵣ(|Hx|² + |Hy|²)] Δx Δy
    """
    eps0 = 8.854187817e-12
    mu0 = 4.0 * np.pi * 1e-7
    da = dx * dy

    if epsilon_r is None:
        epsilon_r = np.ones_like(Ez)
    if mu_r is None:
        mu_r = np.ones_like(Ez)

    W_e = 0.5 * np.sum(epsilon_r * eps0 * Ez**2) * da
    W_m = 0.5 * np.sum(mu_r * mu0 * (Hx**2 + Hy**2)) * da
    return float(W_e + W_m)
