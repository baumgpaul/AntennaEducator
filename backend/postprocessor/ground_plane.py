"""Fields over a perfectly conducting ground plane at z = 0 (image theory).

Above the plane the field equals that of the wires plus their mirror images
carrying the opposite current along the mirrored edges (see
backend/solver/ground_plane.py). Below the plane there is no field.
"""

from typing import Tuple

import numpy as np

MIRROR = np.array([1.0, 1.0, -1.0])


def add_images(
    nodes: np.ndarray, edges: np.ndarray, branch_currents: np.ndarray
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Append mirrored nodes/edges (1-based) and the opposite currents."""
    n_nodes = len(nodes)
    nodes_all = np.vstack([nodes, nodes * MIRROR])
    edges_all = np.vstack([edges, edges + n_nodes])
    currents_all = np.concatenate([branch_currents, -branch_currents], axis=-1)
    return nodes_all, edges_all, currents_all


def lower_hemisphere(theta_angles: np.ndarray) -> np.ndarray:
    """Directions below the horizon (theta > 90 deg), where the field is zero."""
    return theta_angles > np.pi / 2 + 1e-9
