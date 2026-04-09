"""Prepare field data for WebGL rendering: positions, indices, values, arrows."""

import numpy as np

from backend.common.models.fem.mesh import FEMMesh
from backend.common.models.fem.results import ScalarFieldResult, VectorFieldResult


def prepare_scalar_field(mesh: FEMMesh, field: ScalarFieldResult) -> dict:
    """Prepare a scalar field for WebGL contour rendering.

    Returns a dict with:
        positions: flat [x0, y0, x1, y1, ...] float array
        indices:   flat [i0, i1, i2, ...] int array (triangle indices)
        values:    [v0, v1, ...] one per node
        min_value, max_value: float
    """
    positions = []
    for node in mesh.nodes:
        positions.extend(node.coords[:2])

    indices = []
    for elem in mesh.elements:
        indices.extend(elem.node_ids)

    return {
        "positions": positions,
        "indices": indices,
        "values": field.node_values,
        "min_value": field.min_value,
        "max_value": field.max_value,
    }


def prepare_vector_field(mesh: FEMMesh, field: VectorFieldResult) -> dict:
    """Prepare a vector field for arrow rendering.

    Returns a dict with:
        arrows: list of {cx, cy, vx, vy} dicts (one per element)
        max_magnitude: float
    """
    coords = np.array([n.coords[:2] for n in mesh.nodes])

    arrows = []
    for i, elem in enumerate(mesh.elements):
        elem_coords = coords[elem.node_ids]
        cx = float(np.mean(elem_coords[:, 0]))
        cy = float(np.mean(elem_coords[:, 1]))

        vec = field.element_values[i]
        arrows.append(
            {
                "cx": cx,
                "cy": cy,
                "vx": float(vec[0]),
                "vy": float(vec[1]),
            }
        )

    return {
        "arrows": arrows,
        "max_magnitude": field.max_magnitude,
    }
