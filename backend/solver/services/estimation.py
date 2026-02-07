"""
Solver complexity estimation module.

Estimates solve time based on problem complexity to warn users before Lambda timeout.
"""

import logging
from typing import Dict

logger = logging.getLogger(__name__)


def estimate_solve_time(
    n_edges: int,
    n_frequencies: int = 1,
    has_lumped_elements: bool = False,
    solver_type: str = "direct",
) -> Dict:
    """
    Estimate solve time based on problem complexity.

    Lambda timeout is 900s (15 minutes). We want to warn users if their problem
    might exceed 10 minutes or will likely timeout.

    Args:
        n_edges: Number of edges in the mesh (main complexity driver)
        n_frequencies: Number of frequency points to solve
        has_lumped_elements: Whether problem includes lumped elements (slight overhead)
        solver_type: "direct" or "iterative" (direct is default, slower for large systems)

    Returns:
        Dictionary with estimation results including:
        - estimated_seconds: Predicted solve time
        - n_edges, n_frequencies: Problem size parameters
        - warning: True if > 10 minutes
        - will_timeout: True if likely to exceed 14 minutes (safety margin)
        - recommendation: User-facing suggestion if problem is large
        - complexity_class: "small", "medium", "large", "very_large"
    """

    # Empirical formulas based on PEEC solver testing
    # These are conservative estimates erring on the side of overestimation

    # Matrix assembly time: O(n²) complexity
    # Measured: ~0.0001s per edge² for PEEC coefficient computation
    assembly_time_per_freq = (n_edges**2) * 0.0001

    # Matrix solve time depends on solver type
    if solver_type == "direct":
        # Direct solver (LU decomposition): O(n³) complexity
        # Measured: ~1e-8s per edge³
        solve_time_per_freq = (n_edges**3) * 0.00000001
    else:
        # Iterative solver: typically O(n²) to O(n^2.5) depending on convergence
        solve_time_per_freq = (n_edges**2.2) * 0.00001

    # Lumped element overhead (additional matrix assembly)
    lumped_overhead = 0.1 * assembly_time_per_freq if has_lumped_elements else 0

    # Total time per frequency
    time_per_freq = assembly_time_per_freq + solve_time_per_freq + lumped_overhead

    # Total time for all frequencies
    total_estimate = time_per_freq * n_frequencies

    # Add 20% overhead for Python/FastAPI/IO overhead
    total_estimate *= 1.2

    # Classify problem complexity
    if n_edges < 100:
        complexity_class = "small"
    elif n_edges < 500:
        complexity_class = "medium"
    elif n_edges < 1000:
        complexity_class = "large"
    else:
        complexity_class = "very_large"

    # Warning thresholds
    warning_threshold = 600  # 10 minutes
    timeout_threshold = 840  # 14 minutes (1 minute safety margin)

    warning = total_estimate > warning_threshold
    will_timeout = total_estimate > timeout_threshold

    # Generate recommendation
    recommendation = None
    if will_timeout:
        recommendation = (
            f"Problem too large for Lambda (estimated {total_estimate:.0f}s). "
            f"Consider: (1) Reduce mesh density, (2) Reduce frequency points from {n_frequencies} to <10, "
            f"or (3) Simplify geometry. Current edge count: {n_edges}"
        )
    elif warning:
        recommendation = (
            f"Large problem (estimated {total_estimate:.0f}s). "
            f"Consider reducing mesh density or frequency points if solve time is too long. "
            f"Current: {n_edges} edges, {n_frequencies} frequencies"
        )

    result = {
        "estimated_seconds": round(total_estimate, 2),
        "estimated_minutes": round(total_estimate / 60, 2),
        "n_edges": n_edges,
        "n_frequencies": n_frequencies,
        "has_lumped_elements": has_lumped_elements,
        "solver_type": solver_type,
        "complexity_class": complexity_class,
        "warning": warning,
        "will_timeout": will_timeout,
        "recommendation": recommendation,
        "lambda_timeout_seconds": 900,
        "time_per_frequency": round(time_per_freq, 2),
    }

    logger.info(
        f"Estimated solve time: {total_estimate:.1f}s for {n_edges} edges, "
        f"{n_frequencies} frequencies (class: {complexity_class})"
    )

    return result


def estimate_from_mesh(mesh_data: Dict) -> Dict:
    """
    Estimate solve time from mesh data structure.

    Args:
        mesh_data: Mesh dictionary containing 'edges', 'frequencies', etc.

    Returns:
        Estimation dictionary from estimate_solve_time()
    """
    n_edges = len(mesh_data.get("edges", []))

    # Extract frequency count
    frequencies = mesh_data.get("frequencies", [])
    if isinstance(frequencies, list):
        n_frequencies = len(frequencies) if frequencies else 1
    else:
        n_frequencies = 1

    # Check for lumped elements
    lumped_elements = mesh_data.get("lumped_elements", [])
    has_lumped_elements = len(lumped_elements) > 0 if lumped_elements else False

    # Check solver type (default to direct)
    solver_type = mesh_data.get("solver_config", {}).get("solver_type", "direct")

    return estimate_solve_time(
        n_edges=n_edges,
        n_frequencies=n_frequencies,
        has_lumped_elements=has_lumped_elements,
        solver_type=solver_type,
    )
