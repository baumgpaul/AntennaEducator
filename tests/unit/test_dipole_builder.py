"""Tests for antenna builders."""

import numpy as np
import pytest

from backend.preprocessor.builders import create_dipole, dipole_to_mesh


class TestDipoleBuilder:
    """Tests for the dipole antenna builder."""

    def test_create_basic_dipole(self):
        """Test creating a basic dipole with default parameters."""
        element = create_dipole(length=1.0)

        assert element.type == "dipole"
        assert element.name == "Dipole_1000.0mm_gap10.0mm"
        assert element.parameters["length"] == 1.0
        assert element.parameters["center_position"] == [0.0, 0.0, 0.0]
        assert element.parameters["wire_radius"] == 0.001
        assert element.parameters["gap"] == 0.01
        assert element.parameters["segments"] == 21
        assert len(element.sources) == 0

    def test_create_dipole_with_custom_parameters(self):
        """Test creating a dipole with custom parameters."""
        element = create_dipole(
            length=0.5,
            center_position=(1.0, 2.0, 3.0),
            orientation=(1.0, 0.0, 0.0),
            wire_radius=0.002,
            segments=11,
            name="Custom Dipole",
        )

        assert element.name == "Custom Dipole"
        assert element.parameters["length"] == 0.5
        assert element.parameters["center_position"] == [1.0, 2.0, 3.0]
        assert element.parameters["wire_radius"] == 0.002
        assert element.parameters["segments"] == 11

        # Orientation should be normalized
        orientation = element.parameters["orientation"]
        assert np.isclose(np.linalg.norm(orientation), 1.0)

    def test_create_dipole_with_source(self):
        """Test creating a dipole with a voltage source."""
        source_dict = {
            "type": "voltage",
            "amplitude": {"real": 1.0, "imag": 0.5},
        }

        element = create_dipole(length=1.0, source=source_dict)

        assert len(element.sources) > 0
        assert element.sources[0].type == "voltage"
        assert element.sources[0].amplitude == complex(1.0, 0.5)
        assert element.sources[0].node_start == 0  # Ground reference
        assert element.sources[0].node_end == 1  # First node
        element = create_dipole(length=1.0, segments=20)

        # Should keep 20 (segments per half)
        assert element.parameters["segments"] == 20

    def test_create_dipole_normalizes_orientation(self):
        """Test that orientation vector is normalized."""
        element = create_dipole(
            length=1.0,
            orientation=(3.0, 4.0, 0.0),  # Length = 5
        )

        orientation = element.parameters["orientation"]
        # Should be [0.6, 0.8, 0.0]
        assert np.isclose(orientation[0], 0.6)
        assert np.isclose(orientation[1], 0.8)
        assert np.isclose(orientation[2], 0.0)
        assert np.isclose(np.linalg.norm(orientation), 1.0)

    def test_create_dipole_invalid_length(self):
        """Test that invalid length raises ValueError."""
        with pytest.raises(ValueError, match="Length must be positive"):
            create_dipole(length=0.0)

        with pytest.raises(ValueError, match="Length must be positive"):
            create_dipole(length=-1.0)

    def test_create_dipole_invalid_radius(self):
        """Test that invalid wire radius raises ValueError."""
        with pytest.raises(ValueError, match="Wire radius must be positive"):
            create_dipole(length=1.0, wire_radius=0.0)

    def test_create_dipole_invalid_segments(self):
        """Test that invalid segment count raises ValueError."""
        with pytest.raises(ValueError, match="Number of segments must be at least 1"):
            create_dipole(length=1.0, segments=0)

    def test_create_dipole_invalid_gap(self):
        """Test that invalid gap raises ValueError."""
        with pytest.raises(ValueError, match="Gap must be non-negative"):
            create_dipole(length=1.0, gap=-0.01)

        with pytest.raises(ValueError, match="Gap must be less than total length"):
            create_dipole(length=1.0, gap=1.0)

    def test_create_dipole_zero_orientation(self):
        """Test that zero orientation vector raises ValueError."""
        with pytest.raises(ValueError, match="Orientation vector cannot be zero"):
            create_dipole(length=1.0, orientation=(0.0, 0.0, 0.0))


class TestDipoleToMesh:
    """Tests for converting dipole element to mesh."""

    def test_dipole_to_mesh_basic_no_gap(self):
        """Test basic dipole to mesh conversion without gap."""
        element = create_dipole(length=1.0, gap=0.0, segments=11)
        mesh = dipole_to_mesh(element)

        # Should have 12 nodes (11 segments + 1)
        assert len(mesh.nodes) == 12
        assert len(mesh.edges) == 11
        assert len(mesh.radii) == 11

        # All radii should be the same
        assert all(r == 0.001 for r in mesh.radii)

        # Edges should connect consecutive nodes (1-based indexing)
        for i, edge in enumerate(mesh.edges):
            assert edge == [i + 1, i + 2]

    def test_dipole_to_mesh_with_gap(self):
        """Test dipole to mesh conversion with gap between halves."""
        element = create_dipole(length=1.0, gap=0.01, segments=10)
        mesh = dipole_to_mesh(element)

        # segments=10 total → 5 per arm → 2*(5+1) = 12 nodes
        assert len(mesh.nodes) == 12
        # 2*5 = 10 edges
        assert len(mesh.edges) == 10
        assert len(mesh.radii) == 10

        # Lower arm first (tip → gap): nodes 0..5
        # First node of lower arm at -(length-gap)/2 = -0.495
        assert np.allclose(mesh.nodes[0], [0.0, 0.0, -0.495])
        # Last node of lower arm at -gap/2 = -0.005
        assert np.allclose(mesh.nodes[5], [0.0, 0.0, -0.005])

        # Upper arm (gap → tip): nodes 6..11
        # First node of upper arm at +gap/2 = +0.005
        assert np.allclose(mesh.nodes[6], [0.0, 0.0, 0.005])
        # Last node of upper arm at +(length-gap)/2 = 0.495
        assert np.allclose(mesh.nodes[11], [0.0, 0.0, 0.495])

    def test_dipole_to_mesh_positions(self):
        """Test that mesh nodes are positioned correctly."""
        element = create_dipole(
            length=2.0,
            center_position=(0.0, 0.0, 0.0),
            orientation=(0.0, 0.0, 1.0),
            gap=0.0,
            segments=5,
        )
        mesh = dipole_to_mesh(element)

        # First node should be at -1.0 in z
        assert np.allclose(mesh.nodes[0], [0.0, 0.0, -1.0])

        # Last node should be at +1.0 in z
        assert np.allclose(mesh.nodes[5], [0.0, 0.0, 1.0])

    def test_dipole_to_mesh_with_source(self):
        """Test that source is between center nodes."""
        source_dict = {
            "type": "voltage",
            "amplitude": {"real": 1.0, "imag": 0.0},
        }
        element = create_dipole(length=1.0, gap=0.0, segments=11, source=source_dict)
        mesh = dipole_to_mesh(element)

        # 11 segments = 12 nodes, center is between nodes 6 and 7 (1-based indexing)
        assert element.sources[0].node_start == 6
        assert element.sources[0].node_end == 7

    def test_dipole_to_mesh_with_gap_voltage_source(self):
        """Test that voltage source with gap is at gap nodes."""
        source_dict = {
            "type": "voltage",
            "amplitude": {"real": 1.0, "imag": 0.0},
        }
        element = create_dipole(length=1.0, gap=0.01, segments=10, source=source_dict)
        mesh = dipole_to_mesh(element)

        # segments=10 total → 5 per arm
        # Lower arm: nodes 1-6 (tip→gap), upper arm: nodes 7-12 (gap→tip)
        # Feed at gap: node 6 (last lower) and node 7 (first upper)
        assert len(element.sources) == 2
        assert element.sources[0].node_start == 0  # Ground to lower gap
        assert element.sources[0].node_end == 6
        assert element.sources[1].node_start == 0  # Ground to upper gap
        assert element.sources[1].node_end == 7
        assert element.sources[1].amplitude == -element.sources[0].amplitude  # Opposite polarity

    def test_dipole_to_mesh_with_gap_current_source(self):
        """Test that current source with gap uses node injection (PEEC style)."""
        source_dict = {
            "type": "current",
            "amplitude": {"real": 1.0, "imag": 0.0},
        }
        element = create_dipole(length=1.0, gap=0.01, segments=10, source=source_dict)
        mesh = dipole_to_mesh(element)

        # segments=10 total → 5 per arm; feed at gap nodes 6 and 7
        assert len(element.sources) == 2
        assert element.sources[0].node_start == 6  # Gap node of lower arm
        assert element.sources[0].node_end is None  # Current source (single node)
        assert element.sources[1].node_start == 7  # Gap node of upper arm
        assert element.sources[1].node_end is None  # Current source (single node)
        assert element.sources[1].amplitude == -element.sources[0].amplitude  # Opposite polarity

    def test_dipole_to_mesh_edge_mapping(self):
        """Test that edge to element mapping is correct."""
        element = create_dipole(length=1.0, segments=10, gap=0.01)
        mesh = dipole_to_mesh(element)

        # segments=10 total → 5 per arm → 2*5 = 10 edges
        assert len(mesh.edge_to_element) == 10
        element_id_str = str(element.id)
        for edge_id, elem_id in mesh.edge_to_element.items():
            assert elem_id == element_id_str

    def test_dipole_to_mesh_wrong_type(self):
        """Test that wrong element type raises ValueError."""
        element = create_dipole(length=1.0)
        element.type = "loop"  # Change type

        with pytest.raises(ValueError, match="Expected dipole element"):
            dipole_to_mesh(element)

    def test_dipole_to_mesh_custom_orientation(self):
        """Test mesh generation with custom orientation."""
        element = create_dipole(
            length=1.0,
            center_position=(1.0, 2.0, 3.0),
            orientation=(1.0, 0.0, 0.0),
            gap=0.0,
            segments=5,
        )
        mesh = dipole_to_mesh(element)

        # First node: center - length/2 * orientation = [1,2,3] - 0.5*[1,0,0] = [0.5,2,3]
        assert np.allclose(mesh.nodes[0], [0.5, 2.0, 3.0])

        # Last node: center + length/2 * orientation = [1,2,3] + 0.5*[1,0,0] = [1.5,2,3]
        assert np.allclose(mesh.nodes[5], [1.5, 2.0, 3.0])

    def test_dipole_to_mesh_gap_with_orientation(self):
        """Test mesh generation with gap and custom orientation."""
        element = create_dipole(
            length=1.0,
            gap=0.1,
            center_position=(0.0, 0.0, 0.0),
            orientation=(1.0, 0.0, 0.0),
            segments=10,
        )
        mesh = dipole_to_mesh(element)

        # Lower arm first (tip → gap): nodes 0..5
        # First node (lower tip): center - (length-gap)/2 * orientation = [-0.45,0,0]
        assert np.allclose(mesh.nodes[0], [-0.45, 0.0, 0.0])
        # Last node (lower gap): center - gap/2 * orientation = [-0.05,0,0]
        assert np.allclose(mesh.nodes[5], [-0.05, 0.0, 0.0])

        # Upper arm (gap → tip): nodes 6..11
        # First node (upper gap): center + gap/2 * orientation = [0.05,0,0]
        assert np.allclose(mesh.nodes[6], [0.05, 0.0, 0.0])
        # Last node (upper tip): center + (length-gap)/2 * orientation = [0.45,0,0]
        assert np.allclose(mesh.nodes[11], [0.45, 0.0, 0.0])
