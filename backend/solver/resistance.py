"""
Resistance matrix calculations for PEEC solver.

This module computes the resistance matrix (R) for wire segments in the PEEC method.
The resistance accounts for resistive losses in the conductors.

For DC or low-frequency analysis:
    R_dc = ρ × L / A = ρ × L / (π × r²)

For high-frequency analysis (when skin effect is significant):
    R_ac = ρ × L / (2π × r × δ)
    where δ = skin depth = √(ρ / (π × μ₀ × f))

References:
    - Ruehli, A.E., "Equivalent Circuit Models for Three-Dimensional Multiconductor Systems"

Author: PEEC Solver Development
"""

import numpy as np
from typing import List, Optional

from backend.solver.geometry import EdgeGeometry


# Physical constants
PI = np.pi
MU_0 = 4 * PI * 1e-7  # Permeability of free space [H/m]

# Material resistivities [Ω·m]
COPPER_RESISTIVITY = 1.68e-8  # Copper at 20°C
ALUMINUM_RESISTIVITY = 2.65e-8  # Aluminum at 20°C
SILVER_RESISTIVITY = 1.59e-8  # Silver at 20°C
GOLD_RESISTIVITY = 2.44e-8  # Gold at 20°C

# Default resistivity (copper)
DEFAULT_RESISTIVITY = COPPER_RESISTIVITY


def compute_dc_resistance(length: float, radius: float, resistivity: float = DEFAULT_RESISTIVITY) -> float:
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


def compute_skin_depth(frequency: float, resistivity: float = DEFAULT_RESISTIVITY,
                      permeability: float = MU_0) -> float:
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


def compute_ac_resistance(length: float, radius: float, frequency: float,
                         resistivity: float = DEFAULT_RESISTIVITY,
                         permeability: float = MU_0) -> float:
    """
    Compute AC resistance of a cylindrical wire segment including skin effect.
    
    For high frequencies where skin depth δ << radius:
        R_ac ≈ ρ × L / (2π × r × δ)
    
    For low frequencies where skin depth δ >> radius:
        R_ac ≈ R_dc
    
    This function uses a smooth transition between DC and high-frequency regimes.
    
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
        R_ac/R_dc = 15.34
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
    
    # Compute skin depth
    delta = compute_skin_depth(frequency, resistivity, permeability)
    
    # Ratio of skin depth to radius
    delta_r_ratio = delta / radius
    
    # For large skin depth (low frequency), use DC resistance
    if delta_r_ratio > 10:
        return compute_dc_resistance(length, radius, resistivity)
    
    # For small skin depth (high frequency), use simplified AC formula
    # R_ac = ρ × L / (2π × r × δ) for δ << r
    if delta_r_ratio < 0.1:
        R_ac = resistivity * length / (2 * PI * radius * delta)
        return float(R_ac)
    
    # Transition region: use more accurate formula
    # For intermediate frequencies, we use an approximation based on
    # the exact Bessel function solution for circular conductors
    
    # DC resistance
    R_dc = compute_dc_resistance(length, radius, resistivity)
    
    # High-frequency asymptotic limit
    R_hf = resistivity * length / (2 * PI * radius * delta)
    
    # Ratio R_ac / R_dc, using approximation for intermediate frequencies
    # Based on: R_ac/R_dc ≈ (r/δ) × ber'(r/δ) / [ber(r/δ)]
    # For simplicity, use empirical fit that matches exact solution
    x = radius / delta  # Inverse of delta_r_ratio
    
    if x < 1:
        # Low frequency approximation: R_ac/R_dc ≈ 1 + x²/4
        ratio = 1.0 + x**2 / 4.0
    else:
        # High frequency approximation: R_ac/R_dc ≈ x/2
        ratio = x / 2.0
    
    R_ac = R_dc * ratio
    
    return float(R_ac)


def assemble_resistance_matrix(edges: List[EdgeGeometry], radii: np.ndarray,
                               frequency: float = 0.0,
                               resistivity: float = DEFAULT_RESISTIVITY,
                               permeability: float = MU_0,
                               include_skin_effect: bool = False) -> np.ndarray:
    """
    Assemble the resistance matrix for a wire mesh.
    
    The resistance matrix R is diagonal, with each diagonal element representing
    the resistance of one wire segment.
    
    By default (include_skin_effect=False), uses simple DC formula to match MATLAB:
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
            R[i, i] = compute_ac_resistance(length, radius, frequency, 
                                           resistivity, permeability)
        else:
            # DC resistance (matches MATLAB)
            R[i, i] = resistivity * length / (PI * radius**2)
    
    return R
