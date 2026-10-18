"""Perfectly conducting ground plane at z = 0 by image theory.

The plane is replaced by the mirror image of every wire (z -> -z) carrying the
opposite current along the mirrored edge (so vertical currents keep their
direction and horizontal ones reverse) and the opposite charge. In PEEC this
means subtracting the coupling to the images from L and P:

    L_ij -> L_ij - L(i, j'),   P_ij -> P_ij - P(i, j')

Node 0 ("ground") then is the plane: both are at the potential of infinity.
"""

from typing import List, Tuple

import numpy as np

from .gauss_quadrature import get_gauss_points
from .geometry import EdgeGeometry
from .inductance import compute_mutual_inductance_1d
from .potential_nodal import compute_nodal_potential_coefficient

MIRROR = np.array([1.0, 1.0, -1.0])
_EPS_0 = 8.8541878176e-12  # as in potential_nodal


def check_above_plane(nodes: np.ndarray, tolerance: float = 1e-9) -> None:
    """Wires must not go below the ground plane."""
    z_min = float(np.min(np.asarray(nodes)[:, 2])) if len(nodes) else 0.0
    if z_min < -tolerance:
        raise ValueError(
            f"Geometry reaches z = {z_min:.4g} m, below the ground plane at z = 0. "
            "Move the antenna up or disable the ground plane."
        )


def lift_feed_nodes(nodes: np.ndarray, edges: List[List[int]], radii: np.ndarray) -> np.ndarray:
    """Give wires that touch the plane a feed gap of one wire diameter.

    A node exactly on the plane touches its own image: a feed gap of zero width
    whose capacitance shunts the port and makes the input impedance diverge with
    mesh refinement (short monopole: X = -594 -> -337 Ohm for 10 -> 20
    segments). Lifting it to z = 2a (the loop feed gap) converges and gives
    Z_monopole = Z_dipole / 2.
    """
    nodes = np.array(nodes, dtype=float)
    gap = np.zeros(len(nodes))
    for (n1, n2), a in zip(edges, radii):
        for n in (n1, n2):
            if n > 0:
                gap[n - 1] = max(gap[n - 1], 2 * a)
    low = (gap > 0) & (nodes[:, 2] < gap)
    # A fixed physical gap: a mesh-dependent one would make Z drift with refinement
    for n1, n2 in edges:
        if n1 <= 0 or n2 <= 0 or not (low[n1 - 1] or low[n2 - 1]):
            continue
        length = np.linalg.norm(nodes[n1 - 1] - nodes[n2 - 1])
        g = max(gap[n1 - 1], gap[n2 - 1])
        if length - g < g / 2:  # what is left must stay longer than the radius
            raise ValueError(
                f"Segment {n1}-{n2} at the ground plane is {length * 1e3:.2f} mm, too short "
                f"for the {g * 1e3:.2f} mm feed gap (one wire diameter) plus one radius. "
                "Use fewer segments."
            )
    nodes[low, 2] = gap[low]
    return nodes


def image_inductance(
    edges: List[EdgeGeometry], radii: np.ndarray, n_gauss: int = 4
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Mutual inductance of each edge with each mirrored edge.

    Returns (L_img, dist_img, moments_img) with moments_img the first-order
    retardation matrix mu0/4pi (m_i . m_j') of the image pairs.
    """
    points, weights = get_gauss_points(n_gauss)
    images = [EdgeGeometry(e.node1 * MIRROR, e.node2 * MIRROR) for e in edges]
    n = len(edges)
    L_img = np.zeros((n, n))
    dist = np.zeros((n, n))
    for i in range(n):
        for j in range(n):
            a_ij = np.sqrt(0.5 * (radii[i] ** 2 + radii[j] ** 2))
            L_img[i, j] = compute_mutual_inductance_1d(
                edges[i], images[j], points, weights, radius=a_ij
            )
            dist[i, j] = np.linalg.norm(edges[i].midpoint - images[j].midpoint)
    moments = np.array([e.length * e.direction for e in edges])
    moments_img = moments * MIRROR
    first_order = 1e-7 * (moments @ moments_img.T)  # mu0 / 4pi = 1e-7
    return L_img, dist, first_order


def image_potential(
    cap_elem: np.ndarray, radii_cap: np.ndarray, n_gauss: int = 10
) -> Tuple[np.ndarray, np.ndarray]:
    """Potential coefficient of each nodal charge cell with each mirrored cell."""
    points, weights = get_gauss_points(n_gauss)
    n = cap_elem.shape[2]
    mirrored = cap_elem * MIRROR[np.newaxis, :, np.newaxis]
    P_img = np.zeros((n, n))
    dist = np.zeros((n, n))
    scale = 1.0 / (4 * np.pi * _EPS_0)
    for i in range(n):
        for j in range(n):
            a_ij = np.sqrt(0.25 * np.sum(radii_cap[i] ** 2 + radii_cap[j] ** 2))
            P_img[i, j] = scale * compute_nodal_potential_coefficient(
                mirrored[:, :, j], cap_elem[:, :, i], points, weights, radius=a_ij
            )
            dist[i, j] = np.linalg.norm(cap_elem[1, :, i] - mirrored[1, :, j])
    return P_img, dist
