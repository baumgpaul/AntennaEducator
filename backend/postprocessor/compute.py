"""Field computations without the web layer.

Used by the postprocessor endpoints and by the solver's job worker (both
Lambda images contain the whole ``backend`` package), so big near/far-field
requests can run as jobs beyond CloudFront's 60 s limit.
"""

import logging
import time
from datetime import datetime, timezone

import numpy as np

from .config import settings
from .field import compute_directivity_from_pattern, compute_far_field
from .field import compute_near_field as compute_near_field_impl
from .models import FarFieldRequest, FieldRequest, RadiationPatternResponse

logger = logging.getLogger(__name__)

NEAR_FIELD_STENCIL = 19  # finite-difference stencil size
# Measured (one BLAS thread) and doubled for the Lambda's slower CPU
NEAR_FIELD_SECONDS_PER_EVAL = 1e-6  # per observation point x stencil point x edge
FAR_FIELD_SECONDS_PER_EVAL = 2e-7  # per theta x phi sample x edge


class TooManyPointsError(ValueError):
    pass


def parse_branch_currents(raw_currents: list) -> np.ndarray:
    """Parse branch_currents from various serialisation formats into a complex ndarray.

    Accepts per-frequency lists where each element can be:
      - a Python complex number
      - a string like ``"1+2j"``
      - a dict ``{"real": 1, "imag": 2}``
      - a [real, imag] list/tuple pair

    Returns:
        2-D complex ndarray of shape ``(n_frequencies, n_branches)``.
    """
    parsed: list[list[complex]] = []
    for freq_currents in raw_currents:
        currents: list[complex] = []
        for c in freq_currents:
            if isinstance(c, (list, tuple)) and len(c) == 2:
                currents.append(complex(c[0], c[1]))
            elif isinstance(c, str):
                currents.append(complex(c.replace(" ", "").replace("i", "j")))
            elif isinstance(c, dict) and "real" in c and "imag" in c:
                currents.append(complex(c["real"], c["imag"]))
            else:
                currents.append(complex(c))
        parsed.append(currents)
    arr = np.array(parsed, dtype=complex)
    if arr.ndim == 1:
        arr = arr.reshape(1, -1)
    return arr


def estimate_near_field(n_points: int, n_edges: int, n_freq: int) -> dict:
    """Estimate near-field computation time on the Lambda.

    The vectorized implementation processes all observation points × 19-point
    stencil × all edges in a single batched NumPy call per frequency.
    """
    total_evaluations = n_points * NEAR_FIELD_STENCIL * n_edges * n_freq
    est_seconds = total_evaluations * NEAR_FIELD_SECONDS_PER_EVAL
    return {
        "n_points": n_points,
        "n_edges": n_edges,
        "n_freq": n_freq,
        "stencil_size": NEAR_FIELD_STENCIL,
        "total_evaluations": total_evaluations,
        "estimated_seconds": round(est_seconds, 1),
    }


def estimate_far_field_seconds(request: FarFieldRequest) -> float:
    n = request.theta_points * request.phi_points * len(request.edges) * len(request.frequencies)
    return n * FAR_FIELD_SECONDS_PER_EVAL


def near_field_result(request: FieldRequest) -> dict:
    """Electric and magnetic fields at the observation points (compact flat format)."""
    t_start = time.perf_counter()
    n_points = len(request.observation_points)
    n_edges = len(request.edges)
    n_freq = len(request.frequencies)
    n_branches = len(request.branch_currents[0]) if request.branch_currents else 0

    logger.info(
        "=== Near-field request received ==="
        " | frequencies=%d (%.2f MHz)"
        " | observation_points=%d"
        " | edges=%d, nodes=%d, branches=%d",
        n_freq,
        request.frequencies[0] / 1e6 if request.frequencies else 0,
        n_points,
        n_edges,
        len(request.nodes),
        n_branches,
    )

    estimate = estimate_near_field(n_points, n_edges, n_freq)
    logger.info(
        "Computation estimate: %d total evals, ~%.1f s",
        estimate["total_evaluations"],
        estimate["estimated_seconds"],
    )

    if n_points > settings.max_observation_points:
        raise TooManyPointsError(
            f"Too many observation points: {n_points}. "
            f"Maximum allowed is {settings.max_observation_points}. "
            f"Reduce sampling resolution."
        )

    t_parse = time.perf_counter()
    frequencies = np.array(request.frequencies)
    nodes = np.array(request.nodes)
    edges = np.array(request.edges)
    observation_points = np.array(request.observation_points)
    branch_currents = parse_branch_currents(request.branch_currents)
    logger.info("Request parsed in %.3f s", time.perf_counter() - t_parse)

    logger.debug(
        "Array shapes: frequencies=%s, nodes=%s, edges=%s, obs_points=%s, currents=%s",
        frequencies.shape,
        nodes.shape,
        edges.shape,
        observation_points.shape,
        branch_currents.shape,
    )

    t_compute = time.perf_counter()
    E_field, H_field = compute_near_field_impl(
        frequencies=frequencies,
        branch_currents=branch_currents,
        nodes=nodes,
        edges=edges,
        observation_points=observation_points,
    )
    compute_duration = time.perf_counter() - t_compute
    logger.info("Near-field computation completed in %.2f s", compute_duration)

    # Extract first frequency results (n_points x 3, complex)
    E_vectors = E_field[0]
    H_vectors = H_field[0]

    E_magnitudes = np.linalg.norm(E_vectors, axis=1).tolist()
    H_magnitudes = np.linalg.norm(H_vectors, axis=1).tolist()

    # Log field statistics
    E_mag_arr = np.array(E_magnitudes)
    H_mag_arr = np.array(H_magnitudes)
    logger.info(
        "Field stats: |E| min=%.4e max=%.4e mean=%.4e | |H| min=%.4e max=%.4e mean=%.4e",
        E_mag_arr.min(),
        E_mag_arr.max(),
        E_mag_arr.mean(),
        H_mag_arr.min(),
        H_mag_arr.max(),
        H_mag_arr.mean(),
    )

    total_duration = time.perf_counter() - t_start
    logger.info("=== Near-field request completed in %.2f s ===", total_duration)

    # Compact flat-array format: 5-10× smaller than per-point dicts.
    # Each array is [x0, y0, z0, x1, y1, z1, ...] of length n_points * 3.
    # Frontend reconstructs complex vector objects from these arrays.
    return {
        "status": "success",
        "format": "flat",
        "frequency": float(frequencies[0]),
        "num_points": len(observation_points),
        "E_real": E_vectors.real.flatten().tolist(),
        "E_imag": E_vectors.imag.flatten().tolist(),
        "H_real": H_vectors.real.flatten().tolist(),
        "H_imag": H_vectors.imag.flatten().tolist(),
        "E_magnitudes": E_magnitudes,
        "H_magnitudes": H_magnitudes,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "_debug": {
            "compute_seconds": round(compute_duration, 3),
            "total_seconds": round(total_duration, 3),
            "estimate": estimate,
        },
    }


def far_field_result(request: FarFieldRequest) -> RadiationPatternResponse:
    """Far-field radiation pattern over the angular grid.

    Raises ValueError for physically undefined input (e.g. zero currents).
    """
    frequencies = np.array(request.frequencies)
    nodes = np.array(request.nodes)
    edges = np.array(request.edges)
    branch_currents = parse_branch_currents(request.branch_currents)

    theta_angles = np.linspace(0, np.pi, request.theta_points)
    phi_angles = np.linspace(0, 2 * np.pi, request.phi_points)

    E_field, H_field = compute_far_field(
        frequencies=frequencies,
        branch_currents=branch_currents,
        nodes=nodes,
        edges=edges,
        theta_angles=theta_angles,
        phi_angles=phi_angles,
    )

    # Extract first frequency results
    E_theta = E_field[0, :, :, 0]
    E_phi = E_field[0, :, :, 1]

    directivity_linear, directivity_dBi, U_pattern, max_indices = compute_directivity_from_pattern(
        E_theta, E_phi, theta_angles, phi_angles
    )

    E_theta_mag = np.abs(E_theta).flatten().tolist()
    E_phi_mag = np.abs(E_phi).flatten().tolist()
    E_total_mag = np.sqrt(np.abs(E_theta) ** 2 + np.abs(E_phi) ** 2).flatten().tolist()

    U_max = np.max(U_pattern)
    pattern_db_array = 10 * np.log10(U_pattern / U_max)
    pattern_db_array = np.nan_to_num(pattern_db_array, nan=-100.0, posinf=0.0, neginf=-100.0)
    pattern_db = pattern_db_array.flatten().tolist()

    max_theta_idx, max_phi_idx = max_indices
    max_theta_deg = np.rad2deg(theta_angles[max_theta_idx])
    max_phi_deg = np.rad2deg(phi_angles[max_phi_idx])

    return RadiationPatternResponse(
        frequency=float(frequencies[0]),
        theta_angles=theta_angles.tolist(),
        phi_angles=phi_angles.tolist(),
        E_theta_mag=E_theta_mag,
        E_phi_mag=E_phi_mag,
        E_total_mag=E_total_mag,
        pattern_db=pattern_db,
        directivity=float(directivity_dBi),
        gain=float(directivity_dBi),  # Assume 100% efficiency for now
        efficiency=1.0,
        beamwidth_theta=None,
        beamwidth_phi=None,
        max_direction=[float(max_theta_deg), float(max_phi_deg)],
    )
