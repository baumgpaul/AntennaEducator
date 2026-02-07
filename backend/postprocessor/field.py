"""Electromagnetic field computation for antenna analysis.

This module computes electric and magnetic fields radiated by wire antennas
using the current distribution from the PEEC solver.

Physical Background:
- Fields are computed using retarded potentials (time-harmonic case)
- Far-field: Uses far-field approximation (r >> λ)
- Near-field: Uses exact expressions for all field components
"""

from typing import List, Tuple

import numpy as np

from backend.common.constants import C_0, EPSILON_0, MU_0


def compute_vector_potential(
    current: complex,
    edge_start: np.ndarray,
    edge_end: np.ndarray,
    observation_point: np.ndarray,
    k: float,
) -> np.ndarray:
    """
    Compute magnetic vector potential A at observation point due to current element.

    Uses piecewise-linear current approximation with analytical integration.

    Formula:
        A(r) = (μ₀/4π) ∫ I(r') exp(-jkR)/R dl'

    where R = |r - r'| is distance from source to observation.

    Args:
        current: Complex current on edge [A]
        edge_start: Start point of edge [m], shape (3,)
        edge_end: End point of edge [m], shape (3,)
        observation_point: Observation point [m], shape (3,)
        k: Wave number = 2π/λ [rad/m]

    Returns:
        Vector potential [Wb/m], shape (3,)
    """
    # Edge properties
    edge_vec = edge_end - edge_start
    edge_length = np.linalg.norm(edge_vec)
    edge_dir = edge_vec / edge_length
    edge_center = (edge_start + edge_end) / 2

    # Distance from edge center to observation point
    R_center = np.linalg.norm(observation_point - edge_center)

    # Far-field approximation: treat edge as point source
    # Valid when R >> edge_length and R >> λ/(2π)
    if R_center > 5 * edge_length and R_center > k:
        # Point source approximation
        exp_factor = np.exp(-1j * k * R_center) / R_center
        A = (MU_0 / (4 * np.pi)) * current * edge_length * edge_dir * exp_factor
        return A

    # Near-field: integrate along edge using midpoint rule
    # For more accuracy, could use Gauss quadrature
    n_segments = max(5, int(np.ceil(edge_length * k / np.pi)))  # ~10 points per wavelength

    A = np.zeros(3, dtype=complex)
    dl = edge_length / n_segments

    for i in range(n_segments):
        # Source point along edge
        t = (i + 0.5) / n_segments  # Midpoint of segment
        source_point = edge_start + t * edge_vec

        # Distance to observation point
        R_vec = observation_point - source_point
        R = np.linalg.norm(R_vec)

        if R < 1e-10:  # Singularity protection
            continue

        # Contribution to vector potential
        exp_factor = np.exp(-1j * k * R) / R
        A += edge_dir * exp_factor * dl

    A *= (MU_0 / (4 * np.pi)) * current

    return A


def compute_electric_field_from_potential(
    A: np.ndarray,
    observation_point: np.ndarray,
    sources: List[Tuple[np.ndarray, np.ndarray, complex]],
    k: float,
    omega: float,
) -> np.ndarray:
    """
    Compute electric field from vector potential using E = -jωA - ∇φ.

    In the Lorenz gauge, the scalar potential φ is related to A by:
        ∇²φ + k²φ = -(1/ε₀)∇·A

    For wire antennas, we use the far-field approximation where ∇φ ≈ 0.

    Args:
        A: Vector potential [Wb/m], shape (3,)
        observation_point: Observation point [m], shape (3,)
        sources: List of (edge_start, edge_end, current) tuples
        k: Wave number [rad/m]
        omega: Angular frequency [rad/s]

    Returns:
        Electric field [V/m], shape (3,)
    """
    # In far-field, E ≈ -jωA (radiation field)
    # This is accurate for r >> λ/(2π)
    E = -1j * omega * A

    return E


def compute_magnetic_field_from_potential(
    A: np.ndarray,
    observation_point: np.ndarray,
    sources: List[Tuple[np.ndarray, np.ndarray, complex]],
    k: float,
) -> np.ndarray:
    """
    Compute magnetic field from vector potential using H = (1/μ₀)∇×A.

    The curl is computed numerically using finite differences.

    Args:
        A: Vector potential at observation point [Wb/m], shape (3,)
        observation_point: Observation point [m], shape (3,)
        sources: List of (edge_start, edge_end, current) tuples
        k: Wave number [rad/m]

    Returns:
        Magnetic field [A/m], shape (3,)
    """
    # Finite difference step size (fraction of wavelength)
    h = 0.01 / k if k > 0 else 0.01

    # Compute curl using central differences
    # ∇×A = [(∂Az/∂y - ∂Ay/∂z), (∂Ax/∂z - ∂Az/∂x), (∂Ay/∂x - ∂Ax/∂y)]

    curl = np.zeros(3, dtype=complex)

    # x-component: ∂Az/∂y - ∂Ay/∂z
    A_yp = compute_total_vector_potential(observation_point + [0, h, 0], sources, k)
    A_ym = compute_total_vector_potential(observation_point - [0, h, 0], sources, k)
    A_zp = compute_total_vector_potential(observation_point + [0, 0, h], sources, k)
    A_zm = compute_total_vector_potential(observation_point - [0, 0, h], sources, k)
    curl[0] = (A_zp[1] - A_zm[1]) / (2 * h) - (A_yp[2] - A_ym[2]) / (2 * h)

    # y-component: ∂Ax/∂z - ∂Az/∂x
    A_xp = compute_total_vector_potential(observation_point + [h, 0, 0], sources, k)
    A_xm = compute_total_vector_potential(observation_point - [h, 0, 0], sources, k)
    curl[1] = (A_xp[2] - A_xm[2]) / (2 * h) - (A_zp[0] - A_zm[0]) / (2 * h)

    # z-component: ∂Ay/∂x - ∂Ax/∂y
    curl[2] = (A_xp[1] - A_xm[1]) / (2 * h) - (A_yp[0] - A_ym[0]) / (2 * h)

    # H = (1/μ₀) ∇×A
    H = curl / MU_0

    return H


def compute_total_vector_potential(
    observation_point: np.ndarray, sources: List[Tuple[np.ndarray, np.ndarray, complex]], k: float
) -> np.ndarray:
    """
    Compute total vector potential from all current elements.

    Args:
        observation_point: Observation point [m], shape (3,)
        sources: List of (edge_start, edge_end, current) tuples
        k: Wave number [rad/m]

    Returns:
        Total vector potential [Wb/m], shape (3,)
    """
    A_total = np.zeros(3, dtype=complex)

    for edge_start, edge_end, current in sources:
        A = compute_vector_potential(current, edge_start, edge_end, observation_point, k)
        A_total += A

    return A_total


def compute_near_field(
    frequencies: np.ndarray,
    branch_currents: np.ndarray,
    nodes: np.ndarray,
    edges: np.ndarray,
    observation_points: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Compute near electric and magnetic fields at observation points.

    Args:
        frequencies: Array of frequencies [Hz], shape (n_freq,)
        branch_currents: Branch currents [A], shape (n_freq, n_branches)
        nodes: Node coordinates [m], shape (n_nodes, 3)
        edges: Edge connectivity, shape (n_edges, 2)
        observation_points: Points to evaluate field [m], shape (n_points, 3)

    Returns:
        E_field: Electric field [V/m], shape (n_freq, n_points, 3)
        H_field: Magnetic field [A/m], shape (n_freq, n_points, 3)
    """
    n_freq = len(frequencies)
    n_points = len(observation_points)
    n_edges = len(edges)

    E_field = np.zeros((n_freq, n_points, 3), dtype=complex)
    H_field = np.zeros((n_freq, n_points, 3), dtype=complex)

    for i_freq, freq in enumerate(frequencies):
        omega = 2 * np.pi * freq
        wavelength = C_0 / freq
        k = 2 * np.pi / wavelength

        # Get currents for this frequency (only edge currents, not voltage sources)
        currents = branch_currents[i_freq, :n_edges]

        # Build source list
        sources = []
        for i_edge, edge in enumerate(edges):
            # Convert 1-based edge node IDs to 0-based array indices
            edge_start = nodes[edge[0] - 1]
            edge_end = nodes[edge[1] - 1]
            current = currents[i_edge]
            sources.append((edge_start, edge_end, current))

        # Compute fields at each observation point
        for i_point, obs_point in enumerate(observation_points):
            # Vector potential
            A = compute_total_vector_potential(obs_point, sources, k)

            # Electric field
            E = compute_electric_field_from_potential(A, obs_point, sources, k, omega)
            E_field[i_freq, i_point] = E

            # Magnetic field
            H = compute_magnetic_field_from_potential(A, obs_point, sources, k)
            H_field[i_freq, i_point] = H

    return E_field, H_field


def compute_far_field(
    frequencies: np.ndarray,
    branch_currents: np.ndarray,
    nodes: np.ndarray,
    edges: np.ndarray,
    theta_angles: np.ndarray,
    phi_angles: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Compute far-field radiation pattern in spherical coordinates.

    Uses far-field approximation: r >> λ/(2π) and r >> antenna_size.

    Args:
        frequencies: Array of frequencies [Hz], shape (n_freq,)
        branch_currents: Branch currents [A], shape (n_freq, n_branches)
        nodes: Node coordinates [m], shape (n_nodes, 3)
        edges: Edge connectivity, shape (n_edges, 2)
        theta_angles: Theta angles [rad], shape (n_theta,)
        phi_angles: Phi angles [rad], shape (n_phi,)

    Returns:
        E_field: Electric field [V/m], shape (n_freq, n_theta, n_phi, 2)
                 where last dimension is [E_theta, E_phi]
        H_field: Magnetic field [A/m], shape (n_freq, n_theta, n_phi, 2)
                 where last dimension is [H_theta, H_phi]
    """
    n_freq = len(frequencies)
    n_theta = len(theta_angles)
    n_phi = len(phi_angles)
    n_edges = len(edges)

    E_field = np.zeros((n_freq, n_theta, n_phi, 2), dtype=complex)
    H_field = np.zeros((n_freq, n_theta, n_phi, 2), dtype=complex)

    # Far-field distance (arbitrary, cancels out in pattern)
    r_far = 1000.0  # meters

    for i_freq, freq in enumerate(frequencies):
        omega = 2 * np.pi * freq
        wavelength = C_0 / freq
        k = 2 * np.pi / wavelength

        # Get currents for this frequency
        currents = branch_currents[i_freq, :n_edges]

        for i_theta, theta in enumerate(theta_angles):
            for i_phi, phi in enumerate(phi_angles):
                # Observation point in spherical coordinates
                x = r_far * np.sin(theta) * np.cos(phi)
                y = r_far * np.sin(theta) * np.sin(phi)
                z = r_far * np.cos(theta)
                obs_point = np.array([x, y, z])

                # Compute vector potential
                A = np.zeros(3, dtype=complex)
                for i_edge, edge in enumerate(edges):
                    # Convert 1-based edge node IDs to 0-based array indices
                    edge_start = nodes[edge[0] - 1]
                    edge_end = nodes[edge[1] - 1]
                    current = currents[i_edge]
                    A += compute_vector_potential(current, edge_start, edge_end, obs_point, k)

                # Convert to spherical components
                # E_θ and E_φ (far-field: E_r ≈ 0)
                sin_theta = np.sin(theta)
                cos_theta = np.cos(theta)
                sin_phi = np.sin(phi)
                cos_phi = np.cos(phi)

                # Electric field: E = -jωA (far-field approximation)
                E_cart = -1j * omega * A

                # Transform to spherical: (E_x, E_y, E_z) -> (E_r, E_θ, E_φ)
                # E_r = sin(θ)cos(φ)E_x + sin(θ)sin(φ)E_y + cos(θ)E_z
                # E_θ = cos(θ)cos(φ)E_x + cos(θ)sin(φ)E_y - sin(θ)E_z
                # E_φ = -sin(φ)E_x + cos(φ)E_y

                E_theta = (
                    cos_theta * cos_phi * E_cart[0]
                    + cos_theta * sin_phi * E_cart[1]
                    - sin_theta * E_cart[2]
                )

                E_phi = -sin_phi * E_cart[0] + cos_phi * E_cart[1]

                E_field[i_freq, i_theta, i_phi] = [E_theta, E_phi]

                # Magnetic field: H = (r̂ × E) / η₀ where η₀ = √(μ₀/ε₀) ≈ 377 Ω
                eta_0 = np.sqrt(MU_0 / EPSILON_0)
                H_theta = E_phi / eta_0
                H_phi = -E_theta / eta_0

                H_field[i_freq, i_theta, i_phi] = [H_theta, H_phi]

    return E_field, H_field


def compute_poynting_vector(E_field: np.ndarray, H_field: np.ndarray) -> np.ndarray:
    """
    Compute time-averaged Poynting vector from E and H fields.

    Formula: S_avg = 0.5 * Re(E × H*)

    Args:
        E_field: Electric field [V/m], shape (..., 3)
        H_field: Magnetic field [A/m], shape (..., 3)

    Returns:
        Poynting vector [W/m²], shape (..., 3)

    Note:
        For far-field in spherical coordinates with E and H in (θ, φ) components:
        S = 0.5 * Re(E_θ H_φ* - E_φ H_θ*) r̂
    """
    # Cross product: E × H*
    # For complex phasors, time-average is 0.5 * Re(E × H*)
    E_x_H_conj = np.cross(E_field, np.conj(H_field))
    S_avg = 0.5 * np.real(E_x_H_conj)

    return S_avg


def compute_poynting_magnitude_spherical(
    E_theta: np.ndarray, E_phi: np.ndarray, H_theta: np.ndarray, H_phi: np.ndarray
) -> np.ndarray:
    """
    Compute magnitude of Poynting vector from spherical field components.

    For far-field, S points radially: S = 0.5 * Re(E_θ H_φ* - E_φ H_θ*) r̂

    Args:
        E_theta: E_θ component [V/m]
        E_phi: E_φ component [V/m]
        H_theta: H_θ component [A/m]
        H_phi: H_φ component [A/m]

    Returns:
        |S| in radial direction [W/m²]
    """
    # In far-field: H = (r̂ × E) / η₀, so S = (|E|² / η₀) r̂
    # Or more accurately: S_r = 0.5 * Re(E_θ H_φ* - E_φ H_θ*)
    S_r = 0.5 * np.real(E_theta * np.conj(H_phi) - E_phi * np.conj(H_theta))

    return S_r


def compute_directivity_from_pattern(
    E_theta: np.ndarray, E_phi: np.ndarray, theta_angles: np.ndarray, phi_angles: np.ndarray
) -> Tuple[float, float, np.ndarray, Tuple[int, int]]:
    """
    Compute directivity from far-field pattern.

    Directivity D = 4π * U_max / P_rad
    where U(θ,φ) = r² * S_avg is radiation intensity

    Args:
        E_theta: E_θ component [V/m], shape (n_theta, n_phi)
        E_phi: E_φ component [V/m], shape (n_theta, n_phi)
        theta_angles: Theta angles [rad], shape (n_theta,)
        phi_angles: Phi angles [rad], shape (n_phi,)

    Returns:
        directivity_max: Maximum directivity (dimensionless)
        directivity_dBi: Maximum directivity in dBi
        directivity_pattern: Directivity pattern (n_theta, n_phi)
        max_idx: (theta_idx, phi_idx) of maximum direction
    """
    from backend.postprocessor.pattern import (
        compute_directivity,
        compute_radiation_intensity,
        compute_total_radiated_power,
    )

    # Compute radiation intensity: U = r² * S_avg
    # For far-field: U = r²/(2η₀) * (|E_θ|² + |E_φ|²)
    U = compute_radiation_intensity(E_theta, E_phi)

    # Compute directivity
    directivity_max, max_direction = compute_directivity(U, theta_angles, phi_angles)

    # Find indices of maximum
    max_idx = np.unravel_index(np.argmax(U), U.shape)

    # Compute total radiated power
    P_rad = compute_total_radiated_power(U, theta_angles, phi_angles)

    # Directivity pattern: D(θ,φ) = 4π * U(θ,φ) / P_rad
    directivity_pattern = 4 * np.pi * U / P_rad

    # Convert to dBi
    directivity_dBi = 10 * np.log10(directivity_max)

    return directivity_max, directivity_dBi, directivity_pattern, max_idx
