"""
Resistance matrix calculations for PEEC solver.

This module computes the resistance matrix (R) for wire segments in the PEEC method.
The resistance accounts for resistive losses in the conductors.

For DC or low-frequency analysis:
    R_dc = ρ × L / A = ρ × L / (π × r²)

With skin effect (exact Bessel solution for a round wire):
    R_ac = R_dc × Re{(ka/2) J0(ka)/J1(ka)},  k = (1 - j)/δ
    where δ = skin depth = √(ρ / (π × μ × f)); R_ac → ρ × L / (2π × r × δ) for δ ≪ r

References:
    - Ruehli, A.E., "Equivalent Circuit Models for Three-Dimensional Multiconductor Systems"

Author: PEEC Solver Development
"""

from typing import List

import numpy as np
from scipy.special import jve

from backend.common.constants import MU_0
from backend.solver.geometry import EdgeGeometry

PI = np.pi

# Material resistivities [Ω·m]
COPPER_RESISTIVITY = 1.68e-8  # Copper at 20°C
ALUMINUM_RESISTIVITY = 2.65e-8  # Aluminum at 20°C
SILVER_RESISTIVITY = 1.59e-8  # Silver at 20°C
GOLD_RESISTIVITY = 2.44e-8  # Gold at 20°C

# Default resistivity (copper)
DEFAULT_RESISTIVITY = COPPER_RESISTIVITY


def compute_dc_resistance(
    length: float, radius: float, resistivity: float = DEFAULT_RESISTIVITY
) -> float:
    """
    Compute DC resistance of a cylindrical wire segment.

    The DC resistance is given by:
        R_dc = ρ × L / A = ρ × L / (π × r²)

    where:
        ρ = resistivity [Ω·m]
        L = segment length [m]
        r = wire radius [m]
        A = cross-sectional area [m²]

    Args:
        length: Segment length [m], must be positive
        radius: Wire radius [m], must be positive
        resistivity: Material resistivity [Ω·m], must be positive
                    Default is copper (1.68×10⁻⁸ Ω·m)

    Returns:
        DC resistance [Ω]

    Raises:
        ValueError: If any parameter is not positive

    Example:
        >>> # 1-meter copper wire with 1mm radius
        >>> R = compute_dc_resistance(1.0, 0.001)
        >>> print(f"R = {R:.6f} Ω")
        R = 0.005348 Ω
    """
    if length <= 0:
        raise ValueError(f"Length must be positive, got {length}")
    if radius <= 0:
        raise ValueError(f"Radius must be positive, got {radius}")
    if resistivity <= 0:
        raise ValueError(f"Resistivity must be positive, got {resistivity}")

    # Cross-sectional area
    area = PI * radius**2

    # DC resistance
    R_dc = resistivity * length / area

    return float(R_dc)


def compute_skin_depth(
    frequency: float, resistivity: float = DEFAULT_RESISTIVITY, permeability: float = MU_0
) -> float:
    """
    Compute skin depth for AC current flow at a given frequency.

    The skin depth is defined as:
        δ = √(ρ / (π × μ × f))

    At high frequencies, current concentrates near the surface within approximately
    one skin depth.

    Args:
        frequency: Frequency [Hz], must be positive
        resistivity: Material resistivity [Ω·m], must be positive
        permeability: Magnetic permeability [H/m], must be positive
                     Default is μ₀ (free space)

    Returns:
        Skin depth [m]

    Raises:
        ValueError: If any parameter is not positive

    Example:
        >>> # Copper at 1 MHz
        >>> delta = compute_skin_depth(1e6, COPPER_RESISTIVITY)
        >>> print(f"δ = {delta*1e3:.3f} mm")
        δ = 0.065 mm
    """
    if frequency <= 0:
        raise ValueError(f"Frequency must be positive, got {frequency}")
    if resistivity <= 0:
        raise ValueError(f"Resistivity must be positive, got {resistivity}")
    if permeability <= 0:
        raise ValueError(f"Permeability must be positive, got {permeability}")

    delta = np.sqrt(resistivity / (PI * permeability * frequency))

    return float(delta)


def compute_ac_resistance(
    length: float,
    radius: float,
    frequency: float,
    resistivity: float = DEFAULT_RESISTIVITY,
    permeability: float = MU_0,
) -> float:
    """
    Compute AC resistance of a cylindrical wire segment including skin effect.

    For high frequencies where skin depth δ << radius:
        R_ac ≈ ρ × L / (2π × r × δ)

    For low frequencies where skin depth δ >> radius:
        R_ac ≈ R_dc

    Exact for a round wire at every frequency (Bessel solution of the current
    distribution), continuous between the two limits.

    Args:
        length: Segment length [m], must be positive
        radius: Wire radius [m], must be positive
        frequency: Frequency [Hz], must be non-negative (0 = DC)
        resistivity: Material resistivity [Ω·m], must be positive
        permeability: Magnetic permeability [H/m], must be positive

    Returns:
        AC resistance [Ω]

    Raises:
        ValueError: If parameters are invalid

    Example:
        >>> # 1-meter copper wire, 1mm radius, 1 MHz
        >>> R_ac = compute_ac_resistance(1.0, 0.001, 1e6)
        >>> R_dc = compute_dc_resistance(1.0, 0.001)
        >>> print(f"R_ac/R_dc = {R_ac/R_dc:.2f}")
        R_ac/R_dc = 7.92
    """
    if length <= 0:
        raise ValueError(f"Length must be positive, got {length}")
    if radius <= 0:
        raise ValueError(f"Radius must be positive, got {radius}")
    if frequency < 0:
        raise ValueError(f"Frequency must be non-negative, got {frequency}")
    if resistivity <= 0:
        raise ValueError(f"Resistivity must be positive, got {resistivity}")
    if permeability <= 0:
        raise ValueError(f"Permeability must be positive, got {permeability}")

    # DC case
    if frequency == 0:
        return compute_dc_resistance(length, radius, resistivity)

    # Exact internal impedance of a round wire (Bessel solution):
    #   Z' = k ρ / (2π a) · J0(ka) / J1(ka),  k = (1 - j)/δ
    # R_ac/R_dc = Re{(ka/2) J0(ka)/J1(ka)} → 1 + x⁴/48 for x = a/δ ≪ 1 and
    # x/2 + 1/4 + 3/(32x) for x ≫ 1. jve (exponentially scaled) keeps the ratio
    # finite for thick wires at high frequency; the scaling cancels in the ratio.
    # (Replaces a piecewise fit that dropped to R_dc/2 at a/δ = 1.)
    return compute_internal_impedance(length, radius, frequency, resistivity, permeability).real


def compute_internal_impedance(
    length: float,
    radius: float,
    frequency: float,
    resistivity: float = DEFAULT_RESISTIVITY,
    permeability: float = MU_0,
) -> complex:
    """Internal impedance of a round wire segment (exact Bessel solution).

        Z = R_dc · (ka/2) · J0(ka)/J1(ka),   k = (1 - j)/δ

    Re Z is the AC resistance (``compute_ac_resistance``); Im Z = ω·L_int is the
    reactance of the magnetic field inside the wire: L_int' = μ/(8π) for a uniform
    current (low frequency), Im Z → Re Z when the current crowds into the skin.
    The external (partial) inductance is computed separately.
    """
    if length <= 0:
        raise ValueError(f"Length must be positive, got {length}")
    if radius <= 0:
        raise ValueError(f"Radius must be positive, got {radius}")
    if frequency < 0:
        raise ValueError(f"Frequency must be non-negative, got {frequency}")
    r_dc = compute_dc_resistance(length, radius, resistivity)
    if frequency == 0:
        return complex(r_dc, 0.0)
    delta = compute_skin_depth(frequency, resistivity, permeability)
    ka = (1 - 1j) * radius / delta
    # jve (exponentially scaled) keeps the ratio finite for thick wires; the scaling cancels
    return complex(r_dc * 0.5 * ka * jve(0, ka) / jve(1, ka))


def assemble_resistance_matrix(
    edges: List[EdgeGeometry],
    radii: np.ndarray,
    frequency: float = 0.0,
    resistivity: float = DEFAULT_RESISTIVITY,
    permeability: float = MU_0,
    include_skin_effect: bool = False,
) -> np.ndarray:
    """
    Assemble the resistance matrix for a wire mesh.

    The resistance matrix R is diagonal, with each diagonal element representing
    the resistance of one wire segment.

    By default (include_skin_effect=False), uses simple DC formula to match the reference implementation:
        R[i,i] = ρ × L / (π × r²)

    With include_skin_effect=True and frequency > 0, uses AC resistance:
        R[i,i] = ρ × L / (2π × r × δ)  for high frequency
        where δ = skin depth = √(ρ / (π × μ × f))

    Off-diagonal elements are zero (no resistive coupling between segments).

    Args:
        edges: List of EdgeGeometry objects representing wire segments
        radii: Array of wire radii [m], length must match edges
        frequency: Frequency [Hz], must be non-negative (0 = DC)
        resistivity: Material resistivity [Ω·m]
        permeability: Magnetic permeability [H/m]
        include_skin_effect: If True and frequency > 0, compute AC resistance
                           with skin effect. If False, use DC resistance.

    Returns:
        Resistance matrix R [Ω], shape (n_edges, n_edges)
        Diagonal matrix with positive diagonal elements

    Raises:
        ValueError: If radii array has wrong length or invalid parameters

    Example:
        >>> # Two-segment dipole
        >>> edges = [
        ...     EdgeGeometry([0.0, 0.0, 0.0], [0.0, 0.0, 0.5]),
        ...     EdgeGeometry([0.0, 0.0, 0.5], [0.0, 0.0, 1.0])
        ... ]
        >>> radii = np.array([0.001, 0.001])
        >>> R = assemble_resistance_matrix(edges, radii)
        >>> print(f"R[0,0] = {R[0,0]:.6f} Ω")
        R[0,0] = 0.002674 Ω
    """
    n_edges = len(edges)

    # Validate frequency
    if frequency < 0:
        raise ValueError(f"Frequency must be non-negative, got {frequency}")

    # Validate radii array
    if len(radii) != n_edges:
        raise ValueError(f"Radii array has length {len(radii)}, expected {n_edges}")

    # Check for positive radii
    if np.any(radii <= 0):
        raise ValueError("All radii must be positive")

    # Initialize resistance matrix (diagonal)
    R = np.zeros((n_edges, n_edges))

    # Decide whether to include skin effect
    use_ac = include_skin_effect and frequency > 0

    # Compute resistance for each edge
    for i, edge in enumerate(edges):
        length = edge.length
        radius = radii[i]

        if use_ac:
            # AC resistance with skin effect
            R[i, i] = compute_ac_resistance(length, radius, frequency, resistivity, permeability)
        else:
            # DC resistance (matches reference implementation)
            R[i, i] = resistivity * length / (PI * radius**2)

    return R
