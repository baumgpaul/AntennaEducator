"""
Field extraction and derived-quantity computation for FDTD postprocessing.

Functions for extracting field snapshots, computing SAR, and Poynting vectors
from FDTD solver output data.
"""

import numpy as np


def extract_field_snapshot(
    field_data: np.ndarray,
    dx: float,
    dy: float = 0.0,
) -> dict:
    """Extract a field snapshot with spatial coordinate axes.

    Args:
        field_data: 1-D or 2-D numpy array of field values.
        dx: Cell size in x [m].
        dy: Cell size in y [m] (0.0 for 1-D).

    Returns:
        dict with keys: values, x_coords, y_coords, min_value, max_value
    """
    if field_data.ndim == 1:
        nx = field_data.shape[0]
        x_coords = [i * dx for i in range(nx)]
        return {
            "values": field_data.tolist(),
            "x_coords": x_coords,
            "y_coords": [],
            "min_value": float(np.min(field_data)),
            "max_value": float(np.max(field_data)),
        }

    # 2-D case
    nx, ny = field_data.shape
    x_coords = [i * dx for i in range(nx)]
    y_coords = [j * dy for j in range(ny)]
    return {
        "values": field_data.tolist(),
        "x_coords": x_coords,
        "y_coords": y_coords,
        "min_value": float(np.min(field_data)),
        "max_value": float(np.max(field_data)),
    }


def extract_frequency_field(
    dft_real: np.ndarray,
    dft_imag: np.ndarray,
    dx: float,
    dy: float = 0.0,
) -> dict:
    """Compute magnitude and phase from complex DFT field data.

    Args:
        dft_real: Real part of DFT accumulator.
        dft_imag: Imaginary part of DFT accumulator.
        dx: Cell size in x [m].
        dy: Cell size in y [m].

    Returns:
        dict with keys: magnitude, phase_deg, x_coords, y_coords
    """
    field_complex = dft_real + 1j * dft_imag
    magnitude = np.abs(field_complex)
    phase_deg = np.degrees(np.angle(field_complex))

    if magnitude.ndim == 1:
        nx = magnitude.shape[0]
        x_coords = [i * dx for i in range(nx)]
        return {
            "magnitude": magnitude.tolist(),
            "phase_deg": phase_deg.tolist(),
            "x_coords": x_coords,
            "y_coords": [],
        }

    nx, ny = magnitude.shape
    x_coords = [i * dx for i in range(nx)]
    y_coords = [j * dy for j in range(ny)]
    return {
        "magnitude": magnitude.tolist(),
        "phase_deg": phase_deg.tolist(),
        "x_coords": x_coords,
        "y_coords": y_coords,
    }


def compute_sar(
    e_field_magnitude: np.ndarray,
    sigma: np.ndarray,
    density: np.ndarray,
) -> dict:
    """Compute Specific Absorption Rate.

    SAR = σ|E|² / (2ρ)  [W/kg]

    Args:
        e_field_magnitude: |E| field amplitude [V/m].
        sigma: Conductivity [S/m] at each cell.
        density: Mass density [kg/m³] at each cell.

    Returns:
        dict with keys: sar, peak_sar, average_sar
    """
    # Avoid division by zero in non-tissue regions
    safe_density = np.where(density > 0, density, 1.0)
    sar = sigma * e_field_magnitude**2 / (2.0 * safe_density)
    # Zero out SAR where density is zero (free space)
    sar = np.where(density > 0, sar, 0.0)

    # Average only over tissue cells (density > 0)
    tissue_mask = density > 0
    if np.any(tissue_mask):
        average_sar = float(np.mean(sar[tissue_mask]))
    else:
        average_sar = 0.0

    return {
        "sar": sar,
        "peak_sar": float(np.max(sar)),
        "average_sar": average_sar,
    }


def compute_poynting_vector_2d_tm(
    ez: np.ndarray,
    hx: np.ndarray,
    hy: np.ndarray,
) -> dict:
    """Compute Poynting vector for 2-D TM mode.

    S = E × H
    For TM mode (Ez, Hx, Hy):
      Sx = -Ez * Hy  (but with sign convention for outward power)
      Sy =  Ez * Hx

    Actually: S = E × H  →  for Ez, Hx, Hy:
      Sx =  Ez * Hy   (ẑ × ŷ = -x̂, but cross product gives Sx = Ey·Hz - Ez·Hy)
      Wait, let's be careful with the cross product.

    E = Ez ẑ, H = Hx x̂ + Hy ŷ
    S = E × H = Ez ẑ × (Hx x̂ + Hy ŷ) = Ez·Hx (ẑ × x̂) + Ez·Hy (ẑ × ŷ)
      = Ez·Hx ŷ + Ez·Hy (-x̂)
    So Sx = -Ez·Hy, Sy = Ez·Hx

    Args:
        ez: Ez field component (2-D array).
        hx: Hx field component (2-D array).
        hy: Hy field component (2-D array).

    Returns:
        dict with keys: sx, sy, magnitude, total_power
    """
    # Interpolate H to E-grid locations (average adjacent H cells)
    # For a simple computation, use co-located approximation
    min_nx = min(ez.shape[0], hx.shape[0], hy.shape[0])
    min_ny = min(ez.shape[1], hx.shape[1], hy.shape[1])
    ez_c = ez[:min_nx, :min_ny]
    hx_c = hx[:min_nx, :min_ny]
    hy_c = hy[:min_nx, :min_ny]

    sx = -ez_c * hy_c
    sy = ez_c * hx_c
    magnitude = np.sqrt(sx**2 + sy**2)

    return {
        "sx": sx,
        "sy": sy,
        "magnitude": magnitude,
        "total_power": float(np.sum(magnitude)),
    }


def compute_poynting_vector_1d(
    ez: np.ndarray,
    hy: np.ndarray,
) -> dict:
    """Compute Poynting vector for 1-D FDTD (Ez, Hy).

    In 1-D with Ez and Hy, the power flow is in the x-direction:
    Sx = -Ez * Hy (using same convention as 2-D TM)

    Args:
        ez: Ez field (1-D array).
        hy: Hy field (1-D array).

    Returns:
        dict with keys: sx, magnitude, total_power
    """
    n = min(len(ez), len(hy))
    sx = -ez[:n] * hy[:n]
    magnitude = np.abs(sx)

    return {
        "sx": sx,
        "magnitude": magnitude,
        "total_power": float(np.sum(magnitude)),
    }
