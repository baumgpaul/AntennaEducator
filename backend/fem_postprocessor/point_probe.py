"""Interpolate a scalar field at a single point in the mesh."""

import numpy as np

from backend.common.models.fem.mesh import FEMMesh
from backend.common.models.fem.results import ScalarFieldResult


def probe_field_at_point(
    mesh: FEMMesh,
    field: ScalarFieldResult,
    point: list[float],
) -> float:
    """Evaluate a scalar field at a given point via barycentric interpolation.

    Raises ValueError if the point is outside the mesh domain.
    """
    coords = np.array([n.coords[:2] for n in mesh.nodes])
    node_values = np.array(field.node_values)
    pt = np.array(point[:2], dtype=float)

    val = _find_element_and_interpolate(mesh, coords, node_values, pt)
    if np.isnan(val):
        raise ValueError(f"Point {point} is outside the mesh domain")
    return val


def _find_element_and_interpolate(
    mesh: FEMMesh,
    coords: np.ndarray,
    node_values: np.ndarray,
    pt: np.ndarray,
) -> float:
    """Locate the element containing *pt* and interpolate.

    Returns NaN if the point is outside all elements.
    """
    for elem in mesh.elements:
        nids = elem.node_ids
        v0 = coords[nids[0]]
        v1 = coords[nids[1]]
        v2 = coords[nids[2]]

        # Barycentric coordinates
        d = (v1[1] - v2[1]) * (v0[0] - v2[0]) + (v2[0] - v1[0]) * (v0[1] - v2[1])
        if abs(d) < 1e-20:
            continue

        l1 = ((v1[1] - v2[1]) * (pt[0] - v2[0]) + (v2[0] - v1[0]) * (pt[1] - v2[1])) / d
        l2 = ((v2[1] - v0[1]) * (pt[0] - v2[0]) + (v0[0] - v2[0]) * (pt[1] - v2[1])) / d
        l3 = 1.0 - l1 - l2

        tol = -1e-10
        if l1 >= tol and l2 >= tol and l3 >= tol:
            val = l1 * node_values[nids[0]] + l2 * node_values[nids[1]] + l3 * node_values[nids[2]]
            return float(val)

    return float("nan")
