"""Geometric utility functions for PEEC solver calculations."""

from typing import List

import numpy as np


def compute_distance(point1: np.ndarray, point2: np.ndarray) -> float:
    """
    Compute Euclidean distance between two points.

    Args:
        point1: First point coordinates [x, y, z]
        point2: Second point coordinates [x, y, z]

    Returns:
        Distance in meters
    """
    return np.linalg.norm(point2 - point1)


def compute_edge_midpoint(node1: np.ndarray, node2: np.ndarray) -> np.ndarray:
    """
    Compute the midpoint of an edge.

    Args:
        node1: First node coordinates [x, y, z]
        node2: Second node coordinates [x, y, z]

    Returns:
        Midpoint coordinates [x, y, z]
    """
    return 0.5 * (node1 + node2)


def compute_edge_direction(node1: np.ndarray, node2: np.ndarray) -> np.ndarray:
    """
    Compute the unit direction vector of an edge.

    Args:
        node1: First node coordinates (start) [x, y, z]
        node2: Second node coordinates (end) [x, y, z]

    Returns:
        Unit direction vector [dx, dy, dz]
    """
    vector = node2 - node1
    length = np.linalg.norm(vector)
    if length < 1e-12:
        raise ValueError("Edge has zero length")
    return vector / length


def compute_edge_to_edge_distance(
    edge1_node1: np.ndarray,
    edge1_node2: np.ndarray,
    edge2_node1: np.ndarray,
    edge2_node2: np.ndarray,
) -> float:
    """
    Compute center-to-center distance between two edges.

    This is used in PEEC calculations for partial inductance and
    potential coefficient calculations.

    Args:
        edge1_node1: First node of edge 1 [x, y, z]
        edge1_node2: Second node of edge 1 [x, y, z]
        edge2_node1: First node of edge 2 [x, y, z]
        edge2_node2: Second node of edge 2 [x, y, z]

    Returns:
        Distance between edge centers in meters
    """
    center1 = compute_edge_midpoint(edge1_node1, edge1_node2)
    center2 = compute_edge_midpoint(edge2_node1, edge2_node2)
    return compute_distance(center1, center2)


class EdgeGeometry:
    """Precomputed geometric properties of a mesh edge."""

    def __init__(self, node1: np.ndarray, node2: np.ndarray):
        """
        Initialize edge geometry.

        Args:
            node1: First node coordinates [x, y, z]
            node2: Second node coordinates [x, y, z]
        """
        self.node1 = np.asarray(node1, dtype=float)
        self.node2 = np.asarray(node2, dtype=float)

        # Precompute geometric properties
        self.length = compute_distance(self.node1, self.node2)
        self.midpoint = compute_edge_midpoint(self.node1, self.node2)
        self.direction = compute_edge_direction(self.node1, self.node2)

    def distance_to(self, other: "EdgeGeometry") -> float:
        """
        Compute center-to-center distance to another edge.

        Args:
            other: Another EdgeGeometry object

        Returns:
            Distance between edge centers in meters
        """
        return compute_distance(self.midpoint, other.midpoint)

    def __repr__(self) -> str:
        return f"EdgeGeometry(length={self.length:.4f}m, midpoint={self.midpoint})"


def build_edge_geometries(nodes: List[List[float]], edges: List[List[int]]) -> List[EdgeGeometry]:
    """
    Build EdgeGeometry objects for all edges in a mesh.

    Args:
        nodes: List of node coordinates [[x, y, z], ...]
        edges: List of edge connectivity [[n1, n2], ...] (0-based indices)

    Returns:
        List of EdgeGeometry objects, one per edge
    """
    nodes_array = np.array(nodes, dtype=float)
    edge_geometries = []

    for n1, n2 in edges:
        edge_geom = EdgeGeometry(nodes_array[n1], nodes_array[n2])
        edge_geometries.append(edge_geom)

    return edge_geometries
