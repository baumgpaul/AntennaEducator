"""Boundary and volume integral quantities for FEM postprocessing.

Provides charge integration (Q = ∫ D·n dΓ), capacitance extraction (C = Q/V),
current integration (I = ∫ J·n dΓ), and resistance extraction (R = V/I).
"""

import numpy as np

from backend.common.models.fem.mesh import FEMMesh
from backend.common.models.fem.results import VectorFieldResult


def integrate_surface_charge(
    mesh: FEMMesh,
    d_field: VectorFieldResult,
    boundary_name: str,
) -> float:
    """Compute charge on a boundary: Q = ∫ D·n dΓ.

    For each boundary edge, finds the adjacent element to get D,
    then computes the outward normal and integrates D·n over the edge.

    Parameters
    ----------
    mesh : FEMMesh
        The finite element mesh.
    d_field : VectorFieldResult
        Displacement field D per element.
    boundary_name : str
        Name of the boundary to integrate over.

    Returns
    -------
    float
        Total charge Q on the boundary.
    """
    coords = np.array([n.coords[:2] for n in mesh.nodes])

    # Build edge → element adjacency lookup
    edge_to_elem = _build_edge_to_element_map(mesh)

    total_charge = 0.0

    for edge in mesh.boundary_edges:
        if edge.region_name != boundary_name:
            continue

        n0, n1 = edge.node_ids[0], edge.node_ids[1]
        p0 = coords[n0]
        p1 = coords[n1]
        edge_vec = p1 - p0
        edge_len = np.linalg.norm(edge_vec)

        if edge_len < 1e-30:
            continue

        # Outward normal (rotate edge 90° clockwise)
        normal = np.array([edge_vec[1], -edge_vec[0]])
        normal /= edge_len

        # Find the element adjacent to this edge
        edge_key = _edge_key(n0, n1)
        elem_idx = edge_to_elem.get(edge_key)
        if elem_idx is None:
            continue

        # Ensure normal points outward (away from element centroid)
        elem = mesh.elements[elem_idx]
        centroid = np.mean(coords[elem.node_ids], axis=0)
        edge_midpoint = 0.5 * (p0 + p1)
        outward_dir = edge_midpoint - centroid
        if np.dot(normal, outward_dir) < 0:
            normal = -normal

        # D at this element
        d_vec = np.array(d_field.element_values[elem_idx][:2])

        # Q_edge = D·n * L  (constant D over edge for Tri3)
        total_charge += np.dot(d_vec, normal) * edge_len

    return float(total_charge)


def compute_capacitance(
    mesh: FEMMesh,
    d_field: VectorFieldResult,
    electrode_boundary: str,
    voltage_difference: float,
) -> float:
    """Compute capacitance C = Q / V.

    Parameters
    ----------
    mesh : FEMMesh
        The finite element mesh.
    d_field : VectorFieldResult
        Displacement field D per element.
    electrode_boundary : str
        Name of the electrode boundary to integrate charge on.
    voltage_difference : float
        Applied voltage difference between the electrodes.

    Returns
    -------
    float
        Capacitance in Farads (per unit depth for 2D).
    """
    if abs(voltage_difference) < 1e-30:
        raise ValueError("Voltage difference must be non-zero for capacitance")

    charge = integrate_surface_charge(mesh, d_field, electrode_boundary)
    return abs(charge / voltage_difference)


def _edge_key(n0: int, n1: int) -> tuple[int, int]:
    """Canonical edge key (smaller node first)."""
    return (min(n0, n1), max(n0, n1))


def _build_edge_to_element_map(mesh: FEMMesh) -> dict[tuple[int, int], int]:
    """Map each edge (node pair) to the element index that contains it.

    For boundary edges, this gives the single adjacent interior element.
    If an edge appears in multiple elements, the last one wins (which
    is fine because for a boundary edge there is always exactly one).
    """
    edge_map: dict[tuple[int, int], int] = {}

    for idx, elem in enumerate(mesh.elements):
        nids = elem.node_ids
        n = len(nids)
        for i in range(n):
            key = _edge_key(nids[i], nids[(i + 1) % n])
            edge_map[key] = idx

    return edge_map


def integrate_boundary_current(
    mesh: FEMMesh,
    j_field: VectorFieldResult,
    boundary_name: str,
) -> float:
    """Compute current through a boundary: I = ∫ J·n dΓ.

    For each boundary edge, finds the adjacent element to get J,
    then computes the outward normal and integrates J·n over the edge.

    Parameters
    ----------
    mesh : FEMMesh
        The finite element mesh.
    j_field : VectorFieldResult
        Current density field J per element.
    boundary_name : str
        Name of the boundary to integrate over.

    Returns
    -------
    float
        Total current I through the boundary.
    """
    coords = np.array([n.coords[:2] for n in mesh.nodes])
    edge_to_elem = _build_edge_to_element_map(mesh)

    total_current = 0.0

    for edge in mesh.boundary_edges:
        if edge.region_name != boundary_name:
            continue

        n0, n1 = edge.node_ids[0], edge.node_ids[1]
        p0 = coords[n0]
        p1 = coords[n1]
        edge_vec = p1 - p0
        edge_len = np.linalg.norm(edge_vec)

        if edge_len < 1e-30:
            continue

        # Outward normal (rotate edge 90° clockwise)
        normal = np.array([edge_vec[1], -edge_vec[0]])
        normal /= edge_len

        # Find the element adjacent to this edge
        edge_key = _edge_key(n0, n1)
        elem_idx = edge_to_elem.get(edge_key)
        if elem_idx is None:
            continue

        # Ensure normal points outward (away from element centroid)
        elem = mesh.elements[elem_idx]
        centroid = np.mean(coords[elem.node_ids], axis=0)
        edge_midpoint = 0.5 * (p0 + p1)
        outward_dir = edge_midpoint - centroid
        if np.dot(normal, outward_dir) < 0:
            normal = -normal

        # J at this element
        j_vec = np.array(j_field.element_values[elem_idx][:2])

        # I_edge = J·n * L  (constant J over edge for Tri3)
        total_current += np.dot(j_vec, normal) * edge_len

    return float(total_current)


def compute_resistance(
    mesh: FEMMesh,
    j_field: VectorFieldResult,
    electrode_boundary: str,
    voltage_difference: float,
) -> float:
    """Compute resistance R = V / I.

    Parameters
    ----------
    mesh : FEMMesh
        The finite element mesh.
    j_field : VectorFieldResult
        Current density field J per element.
    electrode_boundary : str
        Name of the electrode boundary to integrate current on.
    voltage_difference : float
        Applied voltage difference between the electrodes.

    Returns
    -------
    float
        Resistance in Ohms·m (per unit depth for 2D).
    """
    current = integrate_boundary_current(mesh, j_field, electrode_boundary)
    if abs(current) < 1e-30:
        raise ValueError("Current is zero — cannot compute resistance")

    return abs(voltage_difference / current)
