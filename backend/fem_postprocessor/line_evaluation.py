"""Interpolate a scalar field along a line through the mesh."""

import numpy as np

from backend.common.models.fem.mesh import FEMMesh
from backend.common.models.fem.results import ScalarFieldResult

from .point_probe import _find_element_and_interpolate


def sample_field_along_line(
    mesh: FEMMesh,
    field: ScalarFieldResult,
    start: list[float],
    end: list[float],
    num_points: int = 100,
) -> tuple[list[float], list[float]]:
    """Sample a scalar field along a straight line.

    Points outside the mesh are assigned NaN.

    Returns (distances, values) where distances are measured from start.
    """
    start_arr = np.array(start[:2], dtype=float)
    end_arr = np.array(end[:2], dtype=float)
    total_length = float(np.linalg.norm(end_arr - start_arr))

    if total_length < 1e-15:
        raise ValueError("Start and end points are identical")

    t_values = np.linspace(0.0, 1.0, num_points)
    distances = (t_values * total_length).tolist()
    values = []

    node_values = np.array(field.node_values)
    coords = np.array([n.coords[:2] for n in mesh.nodes])

    for t in t_values:
        pt = start_arr + t * (end_arr - start_arr)
        val = _find_element_and_interpolate(mesh, coords, node_values, pt)
        values.append(val)

    return distances, values
