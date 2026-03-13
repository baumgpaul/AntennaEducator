"""
Far-field computation for FDTD postprocessing.

Near-to-far-field transformation, radiation pattern, and RCS computation
using surface equivalence theorem applied to 2-D FDTD near-field data.
"""

import math

import numpy as np

from backend.common.constants import C_0, PI, Z_0


def near_to_far_field_2d(
    ez_surface: np.ndarray,
    hx_surface: np.ndarray,
    hy_surface: np.ndarray,
    dx: float,
    dy: float,
    frequency_hz: float,
    num_angles: int = 360,
) -> dict:
    """Compute 2-D far-field radiation pattern from near-field surface data.

    Uses the 2-D surface equivalence principle. The near-field data is
    sampled on a rectangular contour surrounding the antenna. Equivalent
    electric (J) and magnetic (M) currents are computed on the surface,
    then the far-field is obtained via radiation integrals.

    For 2-D TM mode (Ez, Hx, Hy), the equivalent surface currents are:
      Jz = n̂ × H → Jz on each face
      Mx, My = -n̂ × E → tangential M components

    The far-field at angle φ for 2-D:
      Nz(φ) = ∮ Jz · exp(jk(x'cosφ + y'sinφ)) dl'
      Lx(φ) = ∮ Mx · exp(jk(x'cosφ + y'sinφ)) dl'
      Ly(φ) = ∮ My · exp(jk(x'cosφ + y'sinφ)) dl'

    Then: E_far(φ) ∝ -jk/(4) · [Z₀·Nz + Lx·sinφ - Ly·cosφ]

    Args:
        ez_surface: Ez values on the near-field contour (dict with 4 sides).
            Expected as a single 1-D array concatenating all 4 sides of the
            rectangular contour: bottom (y=y_min), right (x=x_max),
            top (y=y_max, reversed), left (x=x_min, reversed).
        hx_surface: Hx values on the contour (same format).
        hy_surface: Hy values on the contour (same format).
        dx: Cell spacing in x [m].
        dy: Cell spacing in y [m].
        frequency_hz: Frequency [Hz].
        num_angles: Number of angular samples for the pattern.

    Returns:
        dict with:
            angles_deg: observation angles [0, 360)
            pattern_linear: normalized linear pattern
            pattern_db: normalized pattern in dB
            max_directivity_db: maximum directivity [dBi]
            beam_width_deg: half-power beamwidth [degrees] or None
    """
    k = 2.0 * PI * frequency_hz / C_0
    angles = np.linspace(0, 2 * PI, num_angles, endpoint=False)

    # Build contour coordinates and surface currents.
    # The 1-D arrays sample the rectangular contour in order:
    # bottom, right, top (reversed), left (reversed).
    n_pts = len(ez_surface)

    # Split into 4 segments of roughly equal length.
    side_len = n_pts // 4
    remainder = n_pts - 4 * side_len

    # Distribute remainder to first sides
    sides = [side_len] * 4
    for i in range(remainder):
        sides[i] += 1
    n_bottom, n_right, n_top, n_left = sides

    # Physical extents
    lx = n_bottom * dx
    ly = n_right * dy

    # Build (x, y) coordinates and outward normals for each segment
    x_coords = []
    y_coords = []
    normals_x = []
    normals_y = []
    dl_list = []

    # Bottom side: y = 0, x goes from 0 to lx, normal = -ŷ
    for i in range(n_bottom):
        x_coords.append((i + 0.5) * dx)
        y_coords.append(0.0)
        normals_x.append(0.0)
        normals_y.append(-1.0)
        dl_list.append(dx)

    # Right side: x = lx, y goes from 0 to ly, normal = +x̂
    for i in range(n_right):
        x_coords.append(lx)
        y_coords.append((i + 0.5) * dy)
        normals_x.append(1.0)
        normals_y.append(0.0)
        dl_list.append(dy)

    # Top side: y = ly, x goes from lx to 0, normal = +ŷ
    for i in range(n_top):
        x_coords.append(lx - (i + 0.5) * dx)
        y_coords.append(ly)
        normals_x.append(0.0)
        normals_y.append(1.0)
        dl_list.append(dx)

    # Left side: x = 0, y goes from ly to 0, normal = -x̂
    for i in range(n_left):
        x_coords.append(0.0)
        y_coords.append(ly - (i + 0.5) * dy)
        normals_x.append(-1.0)
        normals_y.append(0.0)
        dl_list.append(dy)

    x_arr = np.array(x_coords)
    y_arr = np.array(y_coords)
    nx_arr = np.array(normals_x)
    ny_arr = np.array(normals_y)
    dl_arr = np.array(dl_list)

    # Shift coordinates to be centered at origin
    x_arr = x_arr - lx / 2.0
    y_arr = y_arr - ly / 2.0

    ez = np.asarray(ez_surface, dtype=complex)
    hx = np.asarray(hx_surface, dtype=complex)
    hy = np.asarray(hy_surface, dtype=complex)

    # Surface equivalence currents:
    # J = n̂ × H  →  Jz = nx·Hy - ny·Hx  (for 2-D TM)
    # M = -n̂ × E  →  Mx = ny·Ez, My = -nx·Ez  (for Ez only)
    jz = nx_arr * hy - ny_arr * hx
    mx = ny_arr * ez
    my = -nx_arr * ez

    # Radiation integrals for each observation angle
    pattern = np.zeros(num_angles)

    for idx, phi in enumerate(angles):
        cos_phi = math.cos(phi)
        sin_phi = math.sin(phi)

        # Phase factor: exp(+jk(x'cosφ + y'sinφ))
        phase = np.exp(1j * k * (x_arr * cos_phi + y_arr * sin_phi))

        # Integrate along contour
        nz = np.sum(jz * phase * dl_arr)
        lx_int = np.sum(mx * phase * dl_arr)
        ly_int = np.sum(my * phase * dl_arr)

        # Far-field: E_φ ∝ -(jk/4)[Z₀·Nz + Lx·sinφ - Ly·cosφ]
        e_far = Z_0 * nz + lx_int * sin_phi - ly_int * cos_phi
        pattern[idx] = abs(e_far) ** 2

    # Normalize
    max_pattern = np.max(pattern)
    if max_pattern > 0:
        pattern_linear = pattern / max_pattern
    else:
        pattern_linear = pattern

    # Directivity: D = 2π · U_max / P_rad  (2-D case)
    # U(φ) = pattern (unnormalized) is proportional to power density
    # P_rad = ∫ U(φ) dφ over [0, 2π]
    d_phi = 2.0 * PI / num_angles
    p_rad = np.sum(pattern) * d_phi
    if p_rad > 0:
        directivity = 2.0 * PI * max_pattern / p_rad
    else:
        directivity = 1.0
    max_directivity_db = 10.0 * math.log10(max(directivity, 1e-30))

    # Pattern in dB (clamped at -60 dB)
    pattern_db = 10.0 * np.log10(np.maximum(pattern_linear, 1e-6))

    # Half-power beamwidth
    beam_width_deg = _compute_beam_width(pattern_linear, angles)

    return {
        "angles_deg": np.degrees(angles).tolist(),
        "pattern_linear": pattern_linear.tolist(),
        "pattern_db": pattern_db.tolist(),
        "max_directivity_db": float(max_directivity_db),
        "beam_width_deg": beam_width_deg,
    }


def compute_rcs_2d(
    scattered_e: np.ndarray,
    scattered_h: np.ndarray,
    incident_e0: float,
    frequency_hz: float,
    contour_radius: float,
    num_angles: int = 360,
) -> dict:
    """Compute 2-D bistatic radar cross section (RCS).

    Uses the standard 2-D RCS definition:
      σ₂D(φ) = 2πr · |E_scat(φ)|² / |E_inc|²

    For RCS, the scattered fields on a circular contour are used.

    Args:
        scattered_e: Complex scattered E-field on circular contour.
        scattered_h: Complex scattered H-field tangential component on contour.
        incident_e0: Incident plane wave E-field amplitude [V/m].
        frequency_hz: Frequency [Hz].
        contour_radius: Radius of the near-field contour [m].
        num_angles: Number of angular samples.

    Returns:
        dict with: angles_deg, rcs_2d, rcs_db, max_rcs, max_rcs_angle_deg
    """
    e_scat = np.asarray(scattered_e, dtype=complex)
    n_pts = len(e_scat)
    angles = np.linspace(0, 2 * PI, n_pts, endpoint=False)

    # Interpolate to requested number of angles if needed
    if n_pts != num_angles:
        target_angles = np.linspace(0, 2 * PI, num_angles, endpoint=False)
        e_scat_interp = np.interp(target_angles, angles, np.abs(e_scat))
    else:
        target_angles = angles
        e_scat_interp = np.abs(e_scat)

    # 2-D RCS: σ₂D = 2πr · |E_scat|² / |E_inc|²
    rcs_2d = 2.0 * PI * contour_radius * e_scat_interp**2 / incident_e0**2

    # dB·m (2-D RCS has units of meters, not m²)
    rcs_db = 10.0 * np.log10(np.maximum(rcs_2d, 1e-30))

    max_idx = int(np.argmax(rcs_2d))

    return {
        "angles_deg": np.degrees(target_angles).tolist(),
        "rcs_2d": rcs_2d.tolist(),
        "rcs_db": rcs_db.tolist(),
        "max_rcs": float(rcs_2d[max_idx]),
        "max_rcs_angle_deg": float(np.degrees(target_angles[max_idx])),
    }


def compute_radiation_pattern_from_probes(
    probe_data: list[dict],
    frequency_hz: float,
    probe_radius: float,
    num_angles: int = 360,
) -> dict:
    """Compute radiation pattern from multiple point probes on a circle.

    Simplified approach: use point probe frequency-domain data (from DFT)
    arranged in a circle around the source to estimate the radiation pattern.

    Args:
        probe_data: List of probe results, each with 'angle_deg' and
                     'dft_magnitude' keys.
        frequency_hz: Frequency [Hz].
        probe_radius: Radius at which probes are placed [m].
        num_angles: Output angular resolution.

    Returns:
        dict with: angles_deg, pattern_linear, pattern_db,
                   max_directivity_db, beam_width_deg
    """
    # Extract angles and magnitudes from probe data
    angles_raw = np.array([p["angle_deg"] for p in probe_data])
    mags_raw = np.array([p["dft_magnitude"] for p in probe_data])

    # Sort by angle
    sort_idx = np.argsort(angles_raw)
    angles_sorted = angles_raw[sort_idx]
    mags_sorted = mags_raw[sort_idx]

    # Interpolate to uniform angular grid
    target_angles = np.linspace(0, 360, num_angles, endpoint=False)
    # Periodic interpolation
    angles_ext = np.concatenate([angles_sorted - 360, angles_sorted, angles_sorted + 360])
    mags_ext = np.concatenate([mags_sorted, mags_sorted, mags_sorted])
    pattern_interp = np.interp(target_angles, angles_ext, mags_ext)

    # Power pattern (proportional to |E|²)
    power_pattern = pattern_interp**2
    max_power = np.max(power_pattern)
    if max_power > 0:
        pattern_linear = power_pattern / max_power
    else:
        pattern_linear = power_pattern

    # Directivity (2-D)
    d_phi = 2.0 * PI / num_angles
    p_rad = np.sum(power_pattern) * d_phi
    if p_rad > 0:
        directivity = 2.0 * PI * max_power / p_rad
    else:
        directivity = 1.0
    max_directivity_db = 10.0 * math.log10(max(directivity, 1e-30))

    pattern_db = 10.0 * np.log10(np.maximum(pattern_linear, 1e-6))
    beam_width = _compute_beam_width(pattern_linear, np.radians(target_angles))

    return {
        "angles_deg": target_angles.tolist(),
        "pattern_linear": pattern_linear.tolist(),
        "pattern_db": pattern_db.tolist(),
        "max_directivity_db": float(max_directivity_db),
        "beam_width_deg": beam_width,
    }


def _compute_beam_width(
    pattern_linear: np.ndarray,
    angles_rad: np.ndarray,
) -> float | None:
    """Compute half-power (-3 dB) beamwidth from a normalized linear pattern.

    Returns beamwidth in degrees, or None if the pattern has no clear main lobe.
    """
    max_idx = int(np.argmax(pattern_linear))

    # Search forward from max for -3 dB crossing
    half_power = 0.5
    n = len(pattern_linear)

    # Search in both directions from peak
    left_angle = None
    right_angle = None

    # Search right (increasing index)
    for i in range(1, n):
        idx = (max_idx + i) % n
        if pattern_linear[idx] < half_power:
            right_angle = angles_rad[idx]
            break

    # Search left (decreasing index)
    for i in range(1, n):
        idx = (max_idx - i) % n
        if pattern_linear[idx] < half_power:
            left_angle = angles_rad[idx]
            break

    if left_angle is not None and right_angle is not None:
        # Compute angular span
        bw = right_angle - left_angle
        if bw < 0:
            bw += 2 * PI
        return float(np.degrees(bw))

    return None
