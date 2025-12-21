"""Tests for solver geometry utilities."""

import pytest
import numpy as np
from backend.solver.geometry import (
    compute_distance,
    compute_edge_midpoint,
    compute_edge_direction,
    compute_edge_to_edge_distance,
    EdgeGeometry,
    build_edge_geometries
)


class TestDistance:
    """Test distance computation."""
    
    def test_distance_along_axis(self):
        """Test distance along single axis."""
        p1 = np.array([0.0, 0.0, 0.0])
        p2 = np.array([3.0, 0.0, 0.0])
        dist = compute_distance(p1, p2)
        assert np.isclose(dist, 3.0)
    
    def test_distance_3d(self):
        """Test 3D distance."""
        p1 = np.array([1.0, 2.0, 3.0])
        p2 = np.array([4.0, 6.0, 8.0])
        dist = compute_distance(p1, p2)
        expected = np.sqrt(9 + 16 + 25)
        assert np.isclose(dist, expected)
    
    def test_unit_distance_z_axis(self):
        """Test unit distance along z-axis."""
        node1 = np.array([0.0, 0.0, 0.0])
        node2 = np.array([0.0, 0.0, 1.0])
        length = compute_distance(node1, node2)
        assert np.isclose(length, 1.0)
    
    def test_diagonal_distance(self):
        """Test diagonal distance."""
        node1 = np.array([0.0, 0.0, 0.0])
        node2 = np.array([1.0, 1.0, 1.0])
        length = compute_distance(node1, node2)
        expected = np.sqrt(3.0)
        assert np.isclose(length, expected)


class TestEdgeMidpoint:
    """Test edge midpoint computation."""
    
    def test_midpoint_z_axis(self):
        """Test midpoint on z-axis."""
        node1 = np.array([0.0, 0.0, 0.0])
        node2 = np.array([0.0, 0.0, 2.0])
        midpoint = compute_edge_midpoint(node1, node2)
        expected = np.array([0.0, 0.0, 1.0])
        assert np.allclose(midpoint, expected)
    
    def test_midpoint_diagonal(self):
        """Test midpoint of diagonal edge."""
        node1 = np.array([0.0, 0.0, 0.0])
        node2 = np.array([2.0, 4.0, 6.0])
        midpoint = compute_edge_midpoint(node1, node2)
        expected = np.array([1.0, 2.0, 3.0])
        assert np.allclose(midpoint, expected)


class TestEdgeDirection:
    """Test edge direction vector computation."""
    
    def test_direction_z_axis(self):
        """Test direction along z-axis."""
        node1 = np.array([0.0, 0.0, 0.0])
        node2 = np.array([0.0, 0.0, 5.0])
        direction = compute_edge_direction(node1, node2)
        expected = np.array([0.0, 0.0, 1.0])
        assert np.allclose(direction, expected)
    
    def test_direction_diagonal(self):
        """Test direction of diagonal edge."""
        node1 = np.array([0.0, 0.0, 0.0])
        node2 = np.array([1.0, 1.0, 1.0])
        direction = compute_edge_direction(node1, node2)
        expected = np.array([1.0, 1.0, 1.0]) / np.sqrt(3.0)
        assert np.allclose(direction, expected)
    
    def test_direction_unit_length(self):
        """Test that direction vector has unit length."""
        node1 = np.array([1.0, 2.0, 3.0])
        node2 = np.array([4.0, 6.0, 8.0])
        direction = compute_edge_direction(node1, node2)
        length = np.linalg.norm(direction)
        assert np.isclose(length, 1.0)
    
    def test_zero_length_edge_raises_error(self):
        """Test that zero-length edge raises error."""
        no = np.array([4.0, 6.0, 8.0])
        with pytest.raises(ValueError, match="Edge has zero length"):
            compute_edge_direction(no, no)


class TestEdgeToEdgeDistance:
    """Test edge-to-edge distance computation."""
    
    def test_parallel_edges_same_z(self):
        """Test parallel edges at same z-coordinate."""
        # Edge 1: from (0,0,0) to (1,0,0), center at (0.5, 0, 0)
        # Edge 2: from (0,2,0) to (1,2,0), center at (0.5, 2, 0)
        # Distance should be 2.0
        edge1_n1 = np.array([0.0, 0.0, 0.0])
        edge1_n2 = np.array([1.0, 0.0, 0.0])
        edge2_n1 = np.array([0.0, 2.0, 0.0])
        edge2_n2 = np.array([1.0, 2.0, 0.0])
        
        dist = compute_edge_to_edge_distance(edge1_n1, edge1_n2, edge2_n1, edge2_n2)
        assert np.isclose(dist, 2.0)
    
    def test_perpendicular_edges(self):
        """Test perpendicular edges."""
        # Edge 1: z-axis from (0,0,0) to (0,0,1), center at (0,0,0.5)
        # Edge 2: x-axis from (0,0,0) to (1,0,0), center at (0.5,0,0)
        edge1_n1 = np.array([0.0, 0.0, 0.0])
        edge1_n2 = np.array([0.0, 0.0, 1.0])
        edge2_n1 = np.array([0.0, 0.0, 0.0])
        edge2_n2 = np.array([1.0, 0.0, 0.0])
        
        dist = compute_edge_to_edge_distance(edge1_n1, edge1_n2, edge2_n1, edge2_n2)
        expected = np.sqrt(0.5**2 + 0.5**2)  # Distance from (0,0,0.5) to (0.5,0,0)
        assert np.isclose(dist, expected)


class TestEdgeGeometry:
    """Test EdgeGeometry class."""
    
    def test_create_edge_geometry(self):
        """Test creating EdgeGeometry object."""
        node1 = np.array([0.0, 0.0, 0.0])
        node2 = np.array([0.0, 0.0, 1.0])
        edge = EdgeGeometry(node1, node2)
        
        assert np.isclose(edge.length, 1.0)
        assert np.allclose(edge.midpoint, [0.0, 0.0, 0.5])
        assert np.allclose(edge.direction, [0.0, 0.0, 1.0])
    
    def test_edge_distance_to(self):
        """Test distance between two EdgeGeometry objects."""
        edge1 = EdgeGeometry(
            np.array([0.0, 0.0, 0.0]),
            np.array([1.0, 0.0, 0.0])
        )
        edge2 = EdgeGeometry(
            np.array([0.0, 2.0, 0.0]),
            np.array([1.0, 2.0, 0.0])
        )
        
        dist = edge1.distance_to(edge2)
        assert np.isclose(dist, 2.0)
    
    def test_edge_from_lists(self):
        """Test creating EdgeGeometry from lists."""
        edge = EdgeGeometry([0.0, 0.0, 0.0], [1.0, 1.0, 1.0])
        assert np.isclose(edge.length, np.sqrt(3.0))


class TestBuildEdgeGeometries:
    """Test building edge geometries from mesh."""
    
    def test_simple_dipole_mesh(self):
        """Test building geometries for simple dipole."""
        # Two nodes, one edge
        nodes = [[0.0, 0.0, 0.0], [0.0, 0.0, 1.0]]
        edges = [[0, 1]]
        
        edge_geoms = build_edge_geometries(nodes, edges)
        
        assert len(edge_geoms) == 1
        assert np.isclose(edge_geoms[0].length, 1.0)
        assert np.allclose(edge_geoms[0].midpoint, [0.0, 0.0, 0.5])
    
    def test_multiple_edges(self):
        """Test building geometries for multiple edges."""
        nodes = [
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [1.0, 1.0, 0.0],
            [0.0, 1.0, 0.0]
        ]
        edges = [[0, 1], [1, 2], [2, 3], [3, 0]]
        
        edge_geoms = build_edge_geometries(nodes, edges)
        
        assert len(edge_geoms) == 4
        # All edges should have unit length (square)
        for edge_geom in edge_geoms:
            assert np.isclose(edge_geom.length, 1.0)
