"""Electromagnetic field computation for antenna analysis.

This module computes electric and magnetic fields radiated by wire antennas
using the current distribution from the PEEC solver.

Physical Background:
- Fields are computed using retarded potentials (time-harmonic case)
- Far-field: Uses far-field approximation (r >> λ)
- Near-field: Uses exact expressions for all field components

Performance:
- All grid-level computations are fully vectorized with NumPy broadcasting.
- Far-field: O(n_freq) Python loops; theta × phi × edges handled in one array op.
- Near-field: O(n_freq) Python loops; observation points × stencil × edges vectorized.
"""

import logging
import time
from typing import List, Tuple

import numpy as np

from backend.common.constants import C_0, EPSILON_0, MU_0

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Scalar (single-point) helpers — kept for backward compatibility / unit tests
# ---------------------------------------------------------------------------


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
    n_segments = max(5, int(np.ceil(edge_length * k / np.pi)))

    A = np.zeros(3, dtype=complex)
    dl = edge_length / n_segments

    for i in range(n_segments):
        t = (i + 0.5) / n_segments
        source_point = edge_start + t * edge_vec
        R_vec = observation_point - source_point
        R = np.linalg.norm(R_vec)

        if R < 1e-10:
            continue

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

    In the Lorenz gauge the scalar potential gradient is:
        ∇φ = -(1 / (jωμ₀ε₀)) ∇(∇·A)

    so the full expression becomes:
        E = -jωA + (1 / (jωμ₀ε₀)) ∇(∇·A)

    This includes near-field (reactive) terms and is valid at all distances.

    Args:
        A: Vector potential [Wb/m], shape (3,)
        observation_point: Observation point [m], shape (3,)
        sources: List of (edge_start, edge_end, current) tuples
        k: Wave number [rad/m]
        omega: Angular frequency [rad/s]

    Returns:
        Electric field [V/m], shape (3,)
    """
    E = -1j * omega * A

    h = 0.01 / k if k > 0 else 0.01

    A_xp = compute_total_vector_potential(observation_point + np.array([h, 0, 0]), sources, k)
    A_xm = compute_total_vector_potential(observation_point - np.array([h, 0, 0]), sources, k)
    A_yp = compute_total_vector_potential(observation_point + np.array([0, h, 0]), sources, k)
    A_ym = compute_total_vector_potential(observation_point - np.array([0, h, 0]), sources, k)
    A_zp = compute_total_vector_potential(observation_point + np.array([0, 0, h]), sources, k)
    A_zm = compute_total_vector_potential(observation_point - np.array([0, 0, h]), sources, k)

    A_xp_yp = compute_total_vector_potential(observation_point + np.array([h, h, 0]), sources, k)
    A_xp_ym = compute_total_vector_potential(observation_point + np.array([h, -h, 0]), sources, k)
    A_xp_zp = compute_total_vector_potential(observation_point + np.array([h, 0, h]), sources, k)
    A_xp_zm = compute_total_vector_potential(observation_point + np.array([h, 0, -h]), sources, k)

    A_xm_yp = compute_total_vector_potential(observation_point + np.array([-h, h, 0]), sources, k)
    A_xm_ym = compute_total_vector_potential(observation_point + np.array([-h, -h, 0]), sources, k)
    A_xm_zp = compute_total_vector_potential(observation_point + np.array([-h, 0, h]), sources, k)
    A_xm_zm = compute_total_vector_potential(observation_point + np.array([-h, 0, -h]), sources, k)

    A_yp_zp = compute_total_vector_potential(observation_point + np.array([0, h, h]), sources, k)
    A_yp_zm = compute_total_vector_potential(observation_point + np.array([0, h, -h]), sources, k)
    A_ym_zp = compute_total_vector_potential(observation_point + np.array([0, -h, h]), sources, k)
    A_ym_zm = compute_total_vector_potential(observation_point + np.array([0, -h, -h]), sources, k)

    # Direct computation of ∇(∇·A) via proper central-difference second
    # derivatives.  ∇(∇·A)_i = Σ_j ∂²A_j / (∂x_i ∂x_j)
    h2 = h * h
    four_h2 = 4 * h2

    # Diagonal: ∂²A_i/∂x_i²
    d2Ax_dx2 = (A_xp[0] - 2 * A[0] + A_xm[0]) / h2
    d2Ay_dy2 = (A_yp[1] - 2 * A[1] + A_ym[1]) / h2
    d2Az_dz2 = (A_zp[2] - 2 * A[2] + A_zm[2]) / h2

    # Cross-terms: ∂²A_j / (∂x_i ∂x_k)
    d2Ay_dxdy = (A_xp_yp[1] - A_xp_ym[1] - A_xm_yp[1] + A_xm_ym[1]) / four_h2
    d2Az_dxdz = (A_xp_zp[2] - A_xp_zm[2] - A_xm_zp[2] + A_xm_zm[2]) / four_h2

    d2Ax_dydx = (A_xp_yp[0] - A_xm_yp[0] - A_xp_ym[0] + A_xm_ym[0]) / four_h2
    d2Az_dydz = (A_yp_zp[2] - A_yp_zm[2] - A_ym_zp[2] + A_ym_zm[2]) / four_h2

    d2Ax_dzdx = (A_xp_zp[0] - A_xm_zp[0] - A_xp_zm[0] + A_xm_zm[0]) / four_h2
    d2Ay_dzdy = (A_yp_zp[1] - A_ym_zp[1] - A_yp_zm[1] + A_ym_zm[1]) / four_h2

    grad_div_A = np.array(
        [
            d2Ax_dx2 + d2Ay_dxdy + d2Az_dxdz,
            d2Ax_dydx + d2Ay_dy2 + d2Az_dydz,
            d2Ax_dzdx + d2Ay_dzdy + d2Az_dz2,
        ],
        dtype=complex,
    )

    if omega > 0:
        E += grad_div_A / (1j * omega * MU_0 * EPSILON_0)

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
    h = 0.01 / k if k > 0 else 0.01

    # ∇×A = (∂Az/∂y − ∂Ay/∂z,  ∂Ax/∂z − ∂Az/∂x,  ∂Ay/∂x − ∂Ax/∂y)
    curl = np.zeros(3, dtype=complex)

    A_yp = compute_total_vector_potential(observation_point + [0, h, 0], sources, k)
    A_ym = compute_total_vector_potential(observation_point - [0, h, 0], sources, k)
    A_zp = compute_total_vector_potential(observation_point + [0, 0, h], sources, k)
    A_zm = compute_total_vector_potential(observation_point - [0, 0, h], sources, k)
    curl[0] = (A_yp[2] - A_ym[2]) / (2 * h) - (A_zp[1] - A_zm[1]) / (2 * h)

    A_xp = compute_total_vector_potential(observation_point + [h, 0, 0], sources, k)
    A_xm = compute_total_vector_potential(observation_point - [h, 0, 0], sources, k)
    curl[1] = (A_zp[0] - A_zm[0]) / (2 * h) - (A_xp[2] - A_xm[2]) / (2 * h)

    curl[2] = (A_xp[1] - A_xm[1]) / (2 * h) - (A_yp[0] - A_ym[0]) / (2 * h)

    H = curl / MU_0
    return H


def compute_total_vector_potential(
    observation_point: np.ndarray,
    sources: List[Tuple[np.ndarray, np.ndarray, complex]],
    k: float,
) -> np.ndarray:
    """
    Compute total vector potential from all current elements (single point).

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


# ---------------------------------------------------------------------------
# Vectorized batch helpers — used by the optimized near/far-field functions
# ---------------------------------------------------------------------------


def _compute_total_vector_potential_batch(
    obs_points: np.ndarray,
    edge_starts: np.ndarray,
    edge_ends: np.ndarray,
    currents: np.ndarray,
    k: float,
    _chunk_size: int = 50_000,
) -> np.ndarray:
    """
    Compute total vector potential at many observation points (vectorized).

    Handles both far-field (point-source) and near-field (segment integration)
    regimes automatically per edge, vectorised over all observation points.

    Automatically chunks large inputs to cap peak memory at ~200 MB,
    preventing OOM on memory-constrained environments (e.g. AWS Lambda).

    Args:
        obs_points: Observation points [m], shape (N, 3)
        edge_starts: Edge start coordinates [m], shape (n_edges, 3)
        edge_ends: Edge end coordinates [m], shape (n_edges, 3)
        currents: Complex edge currents [A], shape (n_edges,)
        k: Wave number [rad/m]
        _chunk_size: Max observation points per chunk (default 50 000).
            With 42 edges this keeps peak memory under ~200 MB per chunk.

    Returns:
        Total vector potential [Wb/m], shape (N, 3)
    """
    # --- Memory-safe chunking ------------------------------------------------
    n_obs = len(obs_points)
    if n_obs > _chunk_size:
        n_chunks = -(-n_obs // _chunk_size)  # ceil division
        logger.info(
            "Chunking %d obs points into %d batches of <=%d",
            n_obs,
            n_chunks,
            _chunk_size,
        )
        chunks = []
        for i_chunk, start in enumerate(range(0, n_obs, _chunk_size)):
            end = min(start + _chunk_size, n_obs)
            logger.debug(
                "  Chunk %d/%d: points %d–%d", i_chunk + 1, n_chunks, start, end
            )
            chunks.append(
                _compute_total_vector_potential_batch(
                    obs_points[start:end],
                    edge_starts,
                    edge_ends,
                    currents,
                    k,
                    _chunk_size,
                )
            )
        return np.concatenate(chunks, axis=0)
    # -------------------------------------------------------------------------

    edge_vecs = edge_ends - edge_starts  # (n_edges, 3)
    edge_lengths = np.linalg.norm(edge_vecs, axis=1)  # (n_edges,)
    edge_dirs = edge_vecs / np.maximum(edge_lengths[:, np.newaxis], 1e-30)  # (n_edges, 3)
    edge_centers = (edge_starts + edge_ends) / 2  # (n_edges, 3)

    # Distance from each obs point to each edge center: (N, n_edges)
    R_center = np.linalg.norm(
        obs_points[:, np.newaxis, :] - edge_centers[np.newaxis, :, :], axis=-1
    )

    # Far-field mask: (N, n_edges)
    far_mask = (R_center > 5 * edge_lengths[np.newaxis, :]) & (R_center > k)

    # ---- Far-field contributions (fully vectorized) -----------------------
    R_safe = np.maximum(R_center, 1e-30)
    exp_factor = np.exp(-1j * k * R_safe) / R_safe  # (N, n_edges)
    exp_factor_far = np.where(far_mask, exp_factor, 0.0)

    # weights: current * edge_length -> (n_edges,)
    weights = currents * edge_lengths
    # (N, n_edges) * (n_edges,) -> (N, n_edges) then broadcast edge_dirs
    weighted_exp = exp_factor_far * weights[np.newaxis, :]  # (N, n_edges)
    A_total = (MU_0 / (4 * np.pi)) * np.einsum("ne,ed->nd", weighted_exp, edge_dirs)  # (N, 3)

    # ---- Near-field contributions (per-edge, vectorised over obs points) --
    near_edge_mask = np.any(~far_mask, axis=0)  # (n_edges,) — any obs is near
    near_edge_indices = np.where(near_edge_mask)[0]

    for i_edge in near_edge_indices:
        obs_near_mask = ~far_mask[:, i_edge]  # (N,) bool
        if not np.any(obs_near_mask):
            continue

        near_obs = obs_points[obs_near_mask]  # (n_near, 3)
        edge_start = edge_starts[i_edge]
        edge_vec = edge_vecs[i_edge]
        edge_length = edge_lengths[i_edge]
        edge_dir = edge_dirs[i_edge]
        current = currents[i_edge]

        n_segments = max(5, int(np.ceil(edge_length * k / np.pi)))
        dl = edge_length / n_segments

        # Source sample points along edge: (n_seg, 3)
        t_vals = (np.arange(n_segments) + 0.5) / n_segments
        src_pts = edge_start[np.newaxis, :] + t_vals[:, np.newaxis] * edge_vec[np.newaxis, :]

        # Distances: (n_near, n_seg)
        R_vec = near_obs[:, np.newaxis, :] - src_pts[np.newaxis, :, :]  # (n_near, n_seg, 3)
        R = np.linalg.norm(R_vec, axis=-1)  # (n_near, n_seg)

        # Singularity protection
        valid = R > 1e-10
        R_s = np.where(valid, R, 1.0)
        seg_exp = np.where(valid, np.exp(-1j * k * R_s) / R_s, 0.0)  # (n_near, n_seg)

        # Sum over segments -> (n_near,)
        seg_sum = np.sum(seg_exp, axis=1)

        # A_edge contribution: (n_near, 3)
        A_edge = (
            (MU_0 / (4 * np.pi)) * current * dl * seg_sum[:, np.newaxis] * edge_dir[np.newaxis, :]
        )
        A_total[obs_near_mask] += A_edge

    return A_total


# ---------------------------------------------------------------------------
# Vectorized public API
# ---------------------------------------------------------------------------


def compute_near_field(
    frequencies: np.ndarray,
    branch_currents: np.ndarray,
    nodes: np.ndarray,
    edges: np.ndarray,
    observation_points: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Compute near electric and magnetic fields at observation points.

    Fully vectorized: all observation points and finite-difference stencil
    evaluations are batched into a single call per frequency, giving
    ~100-1000× speedup over the scalar loop version.

    Args:
        frequencies: Array of frequencies [Hz], shape (n_freq,)
        branch_currents: Branch currents [A], shape (n_freq, n_branches)
        nodes: Node coordinates [m], shape (n_nodes, 3)
        edges: Edge connectivity (1-based), shape (n_edges, 2)
        observation_points: Points to evaluate field [m], shape (n_points, 3)

    Returns:
        E_field: Electric field [V/m], shape (n_freq, n_points, 3)
        H_field: Magnetic field [A/m], shape (n_freq, n_points, 3)
    """
    n_freq = len(frequencies)
    n_points = len(observation_points)
    n_edges = len(edges)

    # Ensure array inputs (callers may pass Python lists)
    nodes = np.asarray(nodes, dtype=float)
    edges = np.asarray(edges)
    observation_points = np.asarray(observation_points, dtype=float)

    # Memory estimate for the stencil-expanded batch (19 offsets per point)
    n_stencil = 19
    total_eval_points = n_points * n_stencil
    # Peak per-chunk in _compute_total_vector_potential_batch:
    #   (chunk × n_edges) arrays of float64/complex128 → ~40 bytes/element
    peak_mb = (min(total_eval_points, 50_000) * n_edges * 40) / (1024**2)
    logger.info(
        "Near-field setup: %d obs × %d stencil = %d evals, %d edges, "
        "est. peak ~%.0f MB/chunk",
        n_points,
        n_stencil,
        total_eval_points,
        n_edges,
        peak_mb,
    )

    E_field = np.zeros((n_freq, n_points, 3), dtype=complex)
    H_field = np.zeros((n_freq, n_points, 3), dtype=complex)

    # Precompute edge geometry (1-based → 0-based node indices)
    edge_starts = nodes[edges[:, 0] - 1]  # (n_edges, 3)
    edge_ends = nodes[edges[:, 1] - 1]  # (n_edges, 3)

    for i_freq, freq in enumerate(frequencies):
        omega = 2 * np.pi * freq
        k = 2 * np.pi * freq / C_0
        currents = branch_currents[i_freq, :n_edges]

        h = 0.01 / k if k > 0 else 0.01

        logger.info(
            "Freq %d/%d: f=%.4f MHz, λ=%.4f m, k=%.4f, %d edges, %d obs points",
            i_freq + 1,
            n_freq,
            freq / 1e6,
            C_0 / freq,
            k,
            n_edges,
            n_points,
        )

        # 19-point stencil offsets for ∇(∇·A) and ∇×A
        #  0: centre
        #  1-6: ±x, ±y, ±z
        #  7-18: cross-term pairs for the E-field divergence stencil
        offsets = np.array(
            [
                [0, 0, 0],  # 0  centre
                [h, 0, 0],  # 1  +x
                [-h, 0, 0],  # 2  -x
                [0, h, 0],  # 3  +y
                [0, -h, 0],  # 4  -y
                [0, 0, h],  # 5  +z
                [0, 0, -h],  # 6  -z
                [h, h, 0],  # 7  +x+y
                [h, -h, 0],  # 8  +x-y
                [h, 0, h],  # 9  +x+z
                [h, 0, -h],  # 10 +x-z
                [-h, h, 0],  # 11 -x+y
                [-h, -h, 0],  # 12 -x-y
                [-h, 0, h],  # 13 -x+z
                [-h, 0, -h],  # 14 -x-z
                [0, h, h],  # 15 +y+z
                [0, h, -h],  # 16 +y-z
                [0, -h, h],  # 17 -y+z
                [0, -h, -h],  # 18 -y-z
            ]
        )  # (19, 3)

        n_stencil = offsets.shape[0]

        # Build all stencil-displaced observation points: (n_points, 19, 3)
        all_pts = observation_points[:, np.newaxis, :] + offsets[np.newaxis, :, :]
        all_pts_flat = all_pts.reshape(-1, 3)  # (n_points * 19, 3)

        # Single batched evaluation for ALL points
        t_batch = time.perf_counter()
        A_all = _compute_total_vector_potential_batch(
            all_pts_flat, edge_starts, edge_ends, currents, k
        )
        batch_duration = time.perf_counter() - t_batch
        logger.info(
            "  Batch VP evaluation: %d points × %d stencil = %d evals in %.2f s",
            n_points,
            n_stencil,
            len(all_pts_flat),
            batch_duration,
        )
        # Reshape back: (n_points, 19, 3)
        A_s = A_all.reshape(n_points, n_stencil, 3)

        # Alias stencil slices — names match the original scalar code
        A0 = A_s[:, 0, :]  # centre                    (n_points, 3)
        Axp = A_s[:, 1, :]  # +x
        Axm = A_s[:, 2, :]  # -x
        Ayp = A_s[:, 3, :]  # +y
        Aym = A_s[:, 4, :]  # -y
        Azp = A_s[:, 5, :]  # +z
        Azm = A_s[:, 6, :]  # -z
        Axp_yp = A_s[:, 7, :]  # +x+y
        Axp_ym = A_s[:, 8, :]  # +x-y
        Axp_zp = A_s[:, 9, :]  # +x+z
        Axp_zm = A_s[:, 10, :]  # +x-z
        Axm_yp = A_s[:, 11, :]  # -x+y
        Axm_ym = A_s[:, 12, :]  # -x-y
        Axm_zp = A_s[:, 13, :]  # -x+z
        Axm_zm = A_s[:, 14, :]  # -x-z
        Ayp_zp = A_s[:, 15, :]  # +y+z
        Ayp_zm = A_s[:, 16, :]  # +y-z
        Aym_zp = A_s[:, 17, :]  # -y+z
        Aym_zm = A_s[:, 18, :]  # -y-z

        # ---- E-field: E = -jωA + (1/(jωμ₀ε₀)) ∇(∇·A) -------------------
        E = -1j * omega * A0  # (n_points, 3)

        # Direct computation of ∇(∇·A) via proper central-difference
        # second derivatives.  ∇(∇·A)_i = Σ_j ∂²A_j / (∂x_i ∂x_j)
        #
        # Previous divergence-based scheme used forward/backward differences
        # for ∂A_i/∂x_i, which halved the diagonal second-derivative terms.
        # The direct approach avoids that systematic error.
        h2 = h * h
        four_h2 = 4 * h2

        # Diagonal: ∂²A_i/∂x_i²  = (A_i(+h) - 2A_i(0) + A_i(-h)) / h²
        d2Ax_dx2 = (Axp[:, 0] - 2 * A0[:, 0] + Axm[:, 0]) / h2
        d2Ay_dy2 = (Ayp[:, 1] - 2 * A0[:, 1] + Aym[:, 1]) / h2
        d2Az_dz2 = (Azp[:, 2] - 2 * A0[:, 2] + Azm[:, 2]) / h2

        # Cross-terms: ∂²A_j / (∂x_i ∂x_k)
        #   = (A_j(+i,+k) - A_j(+i,-k) - A_j(-i,+k) + A_j(-i,-k)) / 4h²
        d2Ay_dxdy = (Axp_yp[:, 1] - Axp_ym[:, 1] - Axm_yp[:, 1] + Axm_ym[:, 1]) / four_h2
        d2Az_dxdz = (Axp_zp[:, 2] - Axp_zm[:, 2] - Axm_zp[:, 2] + Axm_zm[:, 2]) / four_h2

        d2Ax_dydx = (Axp_yp[:, 0] - Axm_yp[:, 0] - Axp_ym[:, 0] + Axm_ym[:, 0]) / four_h2
        d2Az_dydz = (Ayp_zp[:, 2] - Ayp_zm[:, 2] - Aym_zp[:, 2] + Aym_zm[:, 2]) / four_h2

        d2Ax_dzdx = (Axp_zp[:, 0] - Axm_zp[:, 0] - Axp_zm[:, 0] + Axm_zm[:, 0]) / four_h2
        d2Ay_dzdy = (Ayp_zp[:, 1] - Aym_zp[:, 1] - Ayp_zm[:, 1] + Aym_zm[:, 1]) / four_h2

        grad_div_A = np.stack(
            [
                d2Ax_dx2 + d2Ay_dxdy + d2Az_dxdz,
                d2Ax_dydx + d2Ay_dy2 + d2Az_dydz,
                d2Ax_dzdx + d2Ay_dzdy + d2Az_dz2,
            ],
            axis=-1,
        )  # (n_points, 3)

        if omega > 0:
            E += grad_div_A / (1j * omega * MU_0 * EPSILON_0)

        E_field[i_freq] = E

        # ---- H-field: H = (1/μ₀) ∇×A  (reuses axis-displaced A) ---------
        # ∇×A = (∂Az/∂y − ∂Ay/∂z,  ∂Ax/∂z − ∂Az/∂x,  ∂Ay/∂x − ∂Ax/∂y)
        curl = np.zeros((n_points, 3), dtype=complex)
        curl[:, 0] = (Ayp[:, 2] - Aym[:, 2]) / (2 * h) - (Azp[:, 1] - Azm[:, 1]) / (2 * h)
        curl[:, 1] = (Azp[:, 0] - Azm[:, 0]) / (2 * h) - (Axp[:, 2] - Axm[:, 2]) / (2 * h)
        curl[:, 2] = (Axp[:, 1] - Axm[:, 1]) / (2 * h) - (Ayp[:, 0] - Aym[:, 0]) / (2 * h)

        H_field[i_freq] = curl / MU_0

        freq_duration = time.perf_counter() - t_batch  # includes E/H assembly
        logger.info(
            "  Freq %d/%d total: %.2f s (%.1f pts/s)",
            i_freq + 1,
            n_freq,
            freq_duration,
            n_points / freq_duration if freq_duration > 0 else 0,
        )

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

    Fully vectorized: the theta × phi × edges triple loop is replaced by a
    single NumPy broadcasting operation per frequency, giving ~100-1000×
    speedup over the original scalar version.

    Uses far-field approximation: r >> λ/(2π) and r >> antenna_size.

    Args:
        frequencies: Array of frequencies [Hz], shape (n_freq,)
        branch_currents: Branch currents [A], shape (n_freq, n_branches)
        nodes: Node coordinates [m], shape (n_nodes, 3)
        edges: Edge connectivity (1-based), shape (n_edges, 2)
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

    # Ensure array inputs (callers may pass Python lists)
    nodes = np.asarray(nodes, dtype=float)
    edges = np.asarray(edges)

    E_field = np.zeros((n_freq, n_theta, n_phi, 2), dtype=complex)
    H_field = np.zeros((n_freq, n_theta, n_phi, 2), dtype=complex)

    # Precompute edge geometry (once, outside frequency loop)
    edge_starts = nodes[edges[:, 0] - 1]  # (n_edges, 3)
    edge_ends = nodes[edges[:, 1] - 1]  # (n_edges, 3)
    edge_vecs = edge_ends - edge_starts
    edge_lengths = np.linalg.norm(edge_vecs, axis=1)  # (n_edges,)
    edge_dirs = edge_vecs / np.maximum(edge_lengths[:, np.newaxis], 1e-30)
    edge_centers = (edge_starts + edge_ends) / 2  # (n_edges, 3)

    # Precompute angular grids (indexing='ij' → shapes (n_theta, n_phi))
    THETA, PHI = np.meshgrid(theta_angles, phi_angles, indexing="ij")
    sin_t = np.sin(THETA)
    cos_t = np.cos(THETA)
    sin_p = np.sin(PHI)
    cos_p = np.cos(PHI)

    # Observation-point Cartesian coordinates (far-field distance cancels)
    r_far = 1000.0
    obs_xyz = np.stack(
        [r_far * sin_t * cos_p, r_far * sin_t * sin_p, r_far * cos_t], axis=-1
    )  # (n_theta, n_phi, 3)

    # Distance from every (theta,phi) to every edge centre: (n_theta, n_phi, n_edges)
    R = np.linalg.norm(
        obs_xyz[:, :, np.newaxis, :] - edge_centers[np.newaxis, np.newaxis, :, :],
        axis=-1,
    )

    eta_0 = np.sqrt(MU_0 / EPSILON_0)

    for i_freq, freq in enumerate(frequencies):
        omega = 2 * np.pi * freq
        k = 2 * np.pi * freq / C_0
        currents = branch_currents[i_freq, :n_edges]

        # Green's function: exp(-jkR)/R  -> (n_theta, n_phi, n_edges)
        R_safe = np.maximum(R, 1e-30)
        green = np.exp(-1j * k * R_safe) / R_safe

        # Weighted contributions per edge: current * edge_length
        weights = currents * edge_lengths  # (n_edges,) complex

        # Vector potential via Einstein summation:
        #   A_d = (μ₀/4π) Σ_e weights_e * green_{θ,φ,e} * dir_{e,d}
        # Using einsum: 'e, tpe, ed -> tpd'
        A = (MU_0 / (4 * np.pi)) * np.einsum(
            "e,tpe,ed->tpd", weights, green, edge_dirs
        )  # (n_theta, n_phi, 3)

        # Far-field E = -jωA
        E_cart = -1j * omega * A  # (n_theta, n_phi, 3)

        # Cartesian → spherical
        E_theta = (
            cos_t * cos_p * E_cart[..., 0] + cos_t * sin_p * E_cart[..., 1] - sin_t * E_cart[..., 2]
        )
        E_phi = -sin_p * E_cart[..., 0] + cos_p * E_cart[..., 1]

        E_field[i_freq, :, :, 0] = E_theta
        E_field[i_freq, :, :, 1] = E_phi

        # Far-field H from impedance relation: H = (r̂ × E) / η₀
        # r̂ × θ̂ = φ̂,  r̂ × φ̂ = −θ̂
        # ⇒ H_θ = −E_φ/η₀,  H_φ = E_θ/η₀
        H_field[i_freq, :, :, 0] = -E_phi / eta_0
        H_field[i_freq, :, :, 1] = E_theta / eta_0

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
