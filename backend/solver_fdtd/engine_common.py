"""
Common utilities for FDTD solver engines.

Provides:
- Array backend selection (NumPy / CuPy)
- Gaussian pulse generation
- On-the-fly DFT accumulator
- Update coefficient computation
"""

import math
import os

import numpy as np

from backend.common.constants import C_0


# ---------------------------------------------------------------------------
# Array backend (NumPy / CuPy)
# ---------------------------------------------------------------------------
def get_array_module():
    """Return cupy if FDTD_USE_GPU=true and cupy is available, else numpy.

    The returned module exposes the ndarray API (zeros, ones, arange, etc.).
    """
    if os.environ.get("FDTD_USE_GPU", "").lower() == "true":
        try:
            import cupy  # type: ignore[import-untyped]

            return cupy
        except ImportError:
            pass
    return np


# ---------------------------------------------------------------------------
# Source waveforms
# ---------------------------------------------------------------------------
def gaussian_pulse(t: float, t0: float, spread: float) -> float:
    """Normalised Gaussian pulse.

    Args:
        t: Current time [s].
        t0: Pulse centre time [s].
        spread: Pulse width (temporal standard deviation) [s].

    Returns:
        Pulse amplitude in [-1, 1].
    """
    return math.exp(-((t - t0) / spread) ** 2)


def modulated_gaussian(t: float, t0: float, spread: float, freq: float) -> float:
    """Gaussian-envelope sinusoidal pulse.

    Args:
        t: Current time [s].
        t0: Envelope centre time [s].
        spread: Envelope width [s].
        freq: Carrier frequency [Hz].

    Returns:
        Pulse amplitude.
    """
    envelope = math.exp(-((t - t0) / spread) ** 2)
    return envelope * math.sin(2.0 * math.pi * freq * (t - t0))


def sinusoidal_source(t: float, freq: float, phase: float = 0.0) -> float:
    """Continuous sinusoidal source.

    Args:
        t: Current time [s].
        freq: Frequency [Hz].
        phase: Initial phase [rad].

    Returns:
        sin(2 pi f t + phase).
    """
    return math.sin(2.0 * math.pi * freq * t + phase)


# ---------------------------------------------------------------------------
# Source dispatcher
# ---------------------------------------------------------------------------
def evaluate_source(source_type: str, t: float, parameters: dict) -> float:
    """Evaluate a source waveform at time *t*.

    Args:
        source_type: One of 'gaussian_pulse', 'sinusoidal', 'modulated_gaussian'.
        t: Current simulation time [s].
        parameters: Source-specific parameters.

    Returns:
        Source amplitude at time *t*.
    """
    if source_type == "gaussian_pulse":
        t0 = parameters.get("t0", parameters.get("center_time", 0.0))
        spread = parameters.get("spread", parameters.get("pulse_width", 1e-10))
        return gaussian_pulse(t, t0, spread)

    if source_type == "sinusoidal":
        freq = parameters["frequency"]
        phase = parameters.get("phase", 0.0)
        return sinusoidal_source(t, freq, phase)

    if source_type == "modulated_gaussian":
        t0 = parameters.get("t0", parameters.get("center_time", 0.0))
        spread = parameters.get("spread", parameters.get("pulse_width", 1e-10))
        freq = parameters["frequency"]
        return modulated_gaussian(t, t0, spread, freq)

    raise ValueError(f"Unknown source type: {source_type}")


# ---------------------------------------------------------------------------
# Update coefficients
# ---------------------------------------------------------------------------
def compute_update_coefficients(
    epsilon_r: np.ndarray,
    sigma: np.ndarray,
    dt: float,
    xp=None,
) -> tuple[np.ndarray, np.ndarray]:
    """Compute FDTD E-field update coefficients Ca and Cb.

    For the standard lossy E-field update:
        E_new = Ca * E_old + Cb * (curl_H)

    where:
        Ca = (1 - σΔt / (2ε)) / (1 + σΔt / (2ε))
        Cb = (Δt / ε) / (1 + σΔt / (2ε))

    Args:
        epsilon_r: Relative permittivity array.
        sigma: Conductivity array [S/m].
        dt: Time step [s].
        xp: Array module (numpy or cupy). Defaults to numpy.

    Returns:
        (Ca, Cb) coefficient arrays with same shape as epsilon_r.
    """
    if xp is None:
        xp = np
    eps0 = 8.854187817e-12  # Use literal to avoid numpy dependency in constants
    epsilon = epsilon_r * eps0
    loss = sigma * dt / (2.0 * epsilon)
    Ca = (1.0 - loss) / (1.0 + loss)
    Cb = (dt / epsilon) / (1.0 + loss)
    return Ca, Cb


# ---------------------------------------------------------------------------
# DFT accumulator
# ---------------------------------------------------------------------------
def dft_accumulator_init(
    field_shape: tuple,
    frequencies: list[float],
    xp=None,
) -> np.ndarray:
    """Allocate complex DFT accumulator array.

    Shape: (n_freqs, *field_shape).
    """
    if xp is None:
        xp = np
    n_freqs = len(frequencies)
    return xp.zeros((n_freqs, *field_shape), dtype=xp.complex128)


def dft_accumulator_update(
    accumulator: np.ndarray,
    field_slice: np.ndarray,
    dt: float,
    step: int,
    frequencies: list[float],
    xp=None,
) -> None:
    """Accumulate one time step into the running DFT.

    Correlation sum: X(f) += field(n) * exp(-j 2π f n Δt)

    Args:
        accumulator: Complex array (n_freqs, *field_shape), modified in-place.
        field_slice: Real field values at this time step.
        dt: Time step [s].
        step: Current time step index (0-based).
        frequencies: List of DFT frequencies [Hz].
        xp: Array module.
    """
    if xp is None:
        xp = np
    t = step * dt
    for i, f in enumerate(frequencies):
        phase = -2.0 * math.pi * f * t
        accumulator[i] += field_slice * (math.cos(phase) + 1j * math.sin(phase))
