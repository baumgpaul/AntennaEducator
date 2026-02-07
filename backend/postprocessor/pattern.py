"""Radiation pattern analysis and antenna characteristics.

This module analyzes far-field patterns to extract key antenna parameters
like directivity, beamwidth, and polarization characteristics.
"""

from typing import Optional, Tuple

import numpy as np

from backend.common.constants import Z_0

# NumPy 2.0 renamed trapz → trapezoid; support both
try:
    _trapezoid = np.trapezoid  # NumPy >= 2.0
except AttributeError:
    _trapezoid = np.trapz  # NumPy < 2.0


def compute_radiation_intensity(E_theta: np.ndarray, E_phi: np.ndarray) -> np.ndarray:
    """
    Compute radiation intensity U(θ,φ) = r²S_avg where S_avg is Poynting vector.

    For far-field:
        U = r²/(2η₀) * (|E_θ|² + |E_φ|²)

    Args:
        E_theta: E_θ component [V/m], shape (..., n_theta, n_phi)
        E_phi: E_φ component [V/m], shape (..., n_theta, n_phi)

    Returns:
        Radiation intensity [W/sr], same shape as inputs
    """
    E_magnitude_sq = np.abs(E_theta) ** 2 + np.abs(E_phi) ** 2
    U = E_magnitude_sq / (2 * Z_0)

    return U


def compute_total_radiated_power(
    radiation_intensity: np.ndarray, theta_angles: np.ndarray, phi_angles: np.ndarray
) -> float:
    """
    Compute total radiated power by integrating radiation intensity.

    P_rad = ∫∫ U(θ,φ) sin(θ) dθ dφ

    Args:
        radiation_intensity: U(θ,φ) [W/sr], shape (n_theta, n_phi)
        theta_angles: θ values [rad], shape (n_theta,)
        phi_angles: φ values [rad], shape (n_phi,)

    Returns:
        Total radiated power [W]
    """
    # Angular step sizes
    dtheta = np.diff(theta_angles).mean() if len(theta_angles) > 1 else 0
    np.diff(phi_angles).mean() if len(phi_angles) > 1 else 0

    # Integrate using trapezoidal rule with sin(θ) weighting
    P_rad = 0.0
    for i, theta in enumerate(theta_angles):
        sin_theta = np.sin(theta)
        # Integrate over φ at this θ
        P_theta = _trapezoid(radiation_intensity[i, :], phi_angles) * sin_theta
        P_rad += P_theta

    P_rad *= dtheta

    return P_rad


def compute_directivity(
    radiation_intensity: np.ndarray, theta_angles: np.ndarray, phi_angles: np.ndarray
) -> Tuple[float, Tuple[float, float]]:
    """
    Compute directivity and direction of maximum radiation.

    Directivity D = 4π * U_max / P_rad

    Args:
        radiation_intensity: U(θ,φ) [W/sr], shape (n_theta, n_phi)
        theta_angles: θ values [rad], shape (n_theta,)
        phi_angles: φ values [rad], shape (n_phi,)

    Returns:
        directivity: Maximum directivity (linear, not dB)
        max_direction: (theta, phi) of maximum radiation [rad]
    """
    # Find maximum radiation intensity
    U_max = np.max(radiation_intensity)
    max_idx = np.unravel_index(np.argmax(radiation_intensity), radiation_intensity.shape)
    theta_max = theta_angles[max_idx[0]]
    phi_max = phi_angles[max_idx[1]]

    # Total radiated power
    P_rad = compute_total_radiated_power(radiation_intensity, theta_angles, phi_angles)

    # Directivity
    if P_rad > 0:
        D = 4 * np.pi * U_max / P_rad
    else:
        D = 0.0

    return D, (theta_max, phi_max)


def compute_beamwidth(
    radiation_intensity: np.ndarray, angles: np.ndarray, threshold_db: float = -3.0
) -> Optional[float]:
    """
    Compute beamwidth at specified threshold below maximum.

    Args:
        radiation_intensity: Pattern along one cut [W/sr], shape (n_angles,)
        angles: Angle values [rad], shape (n_angles,)
        threshold_db: Threshold below peak [dB], default -3 dB (half power)

    Returns:
        Beamwidth [rad], or None if not found
    """
    if len(radiation_intensity) == 0:
        return None

    # Normalize to peak and convert to dB
    U_max = np.max(radiation_intensity)
    if U_max <= 0:
        return None

    pattern_db = 10 * np.log10(radiation_intensity / U_max + 1e-10)

    # Find angles where pattern crosses threshold
    crossings = []
    for i in range(len(pattern_db) - 1):
        if (pattern_db[i] >= threshold_db) != (pattern_db[i + 1] >= threshold_db):
            # Linear interpolation to find crossing point
            alpha = (threshold_db - pattern_db[i]) / (pattern_db[i + 1] - pattern_db[i])
            angle_cross = angles[i] + alpha * (angles[i + 1] - angles[i])
            crossings.append(angle_cross)

    # Beamwidth is difference between first and last crossing
    if len(crossings) >= 2:
        return crossings[-1] - crossings[0]

    return None


def compute_principal_plane_patterns(
    E_theta: np.ndarray, E_phi: np.ndarray, theta_angles: np.ndarray, phi_angles: np.ndarray
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Extract E-plane and H-plane patterns from 3D pattern.

    For typical dipole along z-axis:
    - E-plane: φ = 0° (xz-plane), E_θ component
    - H-plane: φ = 90° (yz-plane), E_θ component

    Args:
        E_theta: E_θ [V/m], shape (n_theta, n_phi)
        E_phi: E_φ [V/m], shape (n_theta, n_phi)
        theta_angles: θ [rad], shape (n_theta,)
        phi_angles: φ [rad], shape (n_phi,)

    Returns:
        E_plane_theta: θ angles for E-plane [rad]
        E_plane_pattern: Pattern in E-plane [linear]
        H_plane_theta: θ angles for H-plane [rad]
        H_plane_pattern: Pattern in H-plane [linear]
    """
    # Find φ = 0° (E-plane) and φ = 90° (H-plane)
    phi_0_idx = np.argmin(np.abs(phi_angles - 0))
    phi_90_idx = np.argmin(np.abs(phi_angles - np.pi / 2))

    # E-plane pattern (φ = 0°)
    E_plane_pattern = np.sqrt(np.abs(E_theta[:, phi_0_idx]) ** 2 + np.abs(E_phi[:, phi_0_idx]) ** 2)

    # H-plane pattern (φ = 90°)
    H_plane_pattern = np.sqrt(
        np.abs(E_theta[:, phi_90_idx]) ** 2 + np.abs(E_phi[:, phi_90_idx]) ** 2
    )

    return theta_angles, E_plane_pattern, theta_angles, H_plane_pattern


def normalize_pattern_db(radiation_intensity: np.ndarray, floor_db: float = -40.0) -> np.ndarray:
    """
    Normalize radiation pattern to 0 dB maximum and apply floor.

    Args:
        radiation_intensity: U(θ,φ) [W/sr]
        floor_db: Minimum value [dB], default -40 dB

    Returns:
        Normalized pattern [dB], 0 dB at maximum
    """
    U_max = np.max(radiation_intensity)
    if U_max <= 0:
        return np.full_like(radiation_intensity, floor_db)

    pattern_db = 10 * np.log10(radiation_intensity / U_max + 1e-10)
    pattern_db = np.maximum(pattern_db, floor_db)

    return pattern_db


def compute_front_to_back_ratio(
    radiation_intensity: np.ndarray, theta_angles: np.ndarray, phi_angles: np.ndarray
) -> float:
    """
    Compute front-to-back ratio (F/B).

    F/B = U(θ_max, φ_max) / U(π - θ_max, φ_max + π)

    Args:
        radiation_intensity: U(θ,φ) [W/sr], shape (n_theta, n_phi)
        theta_angles: θ [rad], shape (n_theta,)
        phi_angles: φ [rad], shape (n_phi,)

    Returns:
        Front-to-back ratio [dB]
    """
    # Find maximum
    max_idx = np.unravel_index(np.argmax(radiation_intensity), radiation_intensity.shape)
    U_max = radiation_intensity[max_idx]
    theta_max = theta_angles[max_idx[0]]
    phi_max = phi_angles[max_idx[1]]

    # Find back direction
    theta_back = np.pi - theta_max
    phi_back = (phi_max + np.pi) % (2 * np.pi)

    # Find nearest grid point
    theta_back_idx = np.argmin(np.abs(theta_angles - theta_back))
    phi_back_idx = np.argmin(np.abs(phi_angles - phi_back))

    U_back = radiation_intensity[theta_back_idx, phi_back_idx]

    if U_back > 0:
        FB_ratio = 10 * np.log10(U_max / U_back)
    else:
        FB_ratio = 100.0  # Very high F/B

    return FB_ratio


def compute_radiation_efficiency(radiated_power: float, input_power: float) -> float:
    """
    Compute radiation efficiency.

    η_rad = P_rad / P_in

    Args:
        radiated_power: Radiated power [W]
        input_power: Input power [W]

    Returns:
        Radiation efficiency (0 to 1)
    """
    if input_power > 0:
        return min(radiated_power / input_power, 1.0)
    return 0.0


def compute_gain(directivity: float, efficiency: float) -> float:
    """
    Compute antenna gain from directivity and efficiency.

    G = η_rad * D

    Args:
        directivity: Directivity (linear)
        efficiency: Radiation efficiency (0 to 1)

    Returns:
        Gain (linear)
    """
    return efficiency * directivity


def analyze_radiation_pattern(
    E_theta: np.ndarray,
    E_phi: np.ndarray,
    theta_angles: np.ndarray,
    phi_angles: np.ndarray,
    input_power: Optional[float] = None,
) -> dict:
    """
    Comprehensive radiation pattern analysis.

    Args:
        E_theta: E_θ [V/m], shape (n_theta, n_phi)
        E_phi: E_φ [V/m], shape (n_theta, n_phi)
        theta_angles: θ [rad], shape (n_theta,)
        phi_angles: φ [rad], shape (n_phi,)
        input_power: Input power [W], optional for efficiency

    Returns:
        Dictionary with pattern characteristics:
        - radiation_intensity: U(θ,φ) [W/sr]
        - pattern_db: Normalized pattern [dB]
        - directivity_linear: D (linear)
        - directivity_dbi: D [dBi]
        - max_direction: (θ, φ) of maximum [rad]
        - beamwidth_e_plane: 3dB BW in E-plane [deg]
        - beamwidth_h_plane: 3dB BW in H-plane [deg]
        - front_to_back_ratio: F/B [dB]
        - radiated_power: P_rad [W]
        - efficiency: η_rad (if input_power given)
        - gain_dbi: G [dBi] (if input_power given)
    """
    # Compute radiation intensity
    U = compute_radiation_intensity(E_theta, E_phi)

    # Directivity
    D, (theta_max, phi_max) = compute_directivity(U, theta_angles, phi_angles)
    D_dBi = 10 * np.log10(D) if D > 0 else -100.0

    # Normalized pattern
    pattern_db = normalize_pattern_db(U)

    # Radiated power
    P_rad = compute_total_radiated_power(U, theta_angles, phi_angles)

    # Beamwidths in principal planes
    theta_e, pattern_e, theta_h, pattern_h = compute_principal_plane_patterns(
        E_theta, E_phi, theta_angles, phi_angles
    )
    U_e = compute_radiation_intensity(pattern_e, np.zeros_like(pattern_e))
    U_h = compute_radiation_intensity(pattern_h, np.zeros_like(pattern_h))

    bw_e = compute_beamwidth(U_e, theta_e, -3.0)
    bw_h = compute_beamwidth(U_h, theta_h, -3.0)

    # Front-to-back ratio
    fb_ratio = compute_front_to_back_ratio(U, theta_angles, phi_angles)

    result = {
        "radiation_intensity": U,
        "pattern_db": pattern_db,
        "directivity_linear": D,
        "directivity_dbi": D_dBi,
        "max_direction": (np.degrees(theta_max), np.degrees(phi_max)),
        "beamwidth_e_plane": np.degrees(bw_e) if bw_e else None,
        "beamwidth_h_plane": np.degrees(bw_h) if bw_h else None,
        "front_to_back_ratio": fb_ratio,
        "radiated_power": P_rad,
    }

    # Optional: efficiency and gain
    if input_power is not None:
        efficiency = compute_radiation_efficiency(P_rad, input_power)
        gain = compute_gain(D, efficiency)
        gain_dBi = 10 * np.log10(gain) if gain > 0 else -100.0

        result["efficiency"] = efficiency
        result["gain_linear"] = gain
        result["gain_dbi"] = gain_dBi

    return result
