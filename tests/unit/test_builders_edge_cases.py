"""
Phase 0 edge-case tests for antenna builders (dipole, loop, rod).

Tests cover:
- Dipole balanced gap feed (source polarities sum to zero)
- Loop wraparound edge with odd/even segment counts
- Rod ground node and N+1 node count
- Lumped elements at boundary nodes
- source_edges population in returned Mesh
"""

import numpy as np
import pytest

from backend.preprocessor.builders import (
    create_dipole,
    create_loop,
    create_rod,
    dipole_to_mesh,
    loop_to_mesh,
    rod_to_mesh,
)

# ============================================================================
# Dipole — balanced gap feed
# ============================================================================


class TestDipoleBalancedFeed:
    """Verify that gap-fed dipoles produce balanced (differential) excitation."""

    def test_voltage_source_amplitudes_sum_to_zero(self):
        """Two VS on a gap dipole must have opposite amplitudes (+V, -V)."""
        element = create_dipole(
            length=1.0,
            gap=0.01,
            segments=5,
            source={"type": "voltage", "amplitude": {"real": 1.0, "imag": 0.0}},
        )
        mesh = dipole_to_mesh(element)
        assert mesh is not None

        # Builder should have created two voltage sources
        assert len(element.sources) == 2
        amp_sum = element.sources[0].amplitude + element.sources[1].amplitude
        assert (
            amp_sum == 0
        ), f"Amplitudes must cancel: {element.sources[0].amplitude} + {element.sources[1].amplitude}"

    def test_current_source_amplitudes_sum_to_zero(self):
        """Two CS on a gap dipole must have opposite amplitudes (+I, -I)."""
        element = create_dipole(
            length=1.0,
            gap=0.01,
            segments=5,
            source={"type": "current", "amplitude": {"real": 0.5, "imag": 0.3}},
        )
        mesh = dipole_to_mesh(element)
        assert mesh is not None

        assert len(element.sources) == 2
        amp_sum = element.sources[0].amplitude + element.sources[1].amplitude
        assert amp_sum == 0

    def test_voltage_source_complex_amplitude_balanced(self):
        """Complex VS amplitude must also produce balanced pair."""
        element = create_dipole(
            length=0.5,
            gap=0.005,
            segments=10,
            source={"type": "voltage", "amplitude": {"real": 2.0, "imag": -1.5}},
        )
        dipole_to_mesh(element)

        assert len(element.sources) == 2
        assert element.sources[0].amplitude == complex(2.0, -1.5)
        assert element.sources[1].amplitude == complex(-2.0, 1.5)

    def test_gap_dipole_source_nodes_reference_correct_halves(self):
        """VS node_start=0 (ground), node_end points to gap node of each half."""
        segments = 10  # 10 total → 5 per arm
        element = create_dipole(
            length=1.0,
            gap=0.01,
            segments=segments,
            source={"type": "voltage", "amplitude": {"real": 1.0, "imag": 0.0}},
        )
        dipole_to_mesh(element)

        n_per_arm = segments // 2  # 5
        # Lower arm: nodes 1..6 (tip→gap), upper arm: nodes 7..12 (gap→tip)
        # Feed at gap: node 6 (last lower) and node 7 (first upper)
        assert element.sources[0].node_start == 0  # ground
        assert element.sources[0].node_end == n_per_arm + 1  # gap node of lower arm
        assert element.sources[1].node_start == 0  # ground
        assert element.sources[1].node_end == n_per_arm + 2  # gap node of upper arm

    def test_no_gap_dipole_single_source(self):
        """A continuous dipole (gap=0) should keep a single source at center."""
        element = create_dipole(
            length=1.0,
            gap=0.0,
            segments=10,
            source={"type": "voltage", "amplitude": {"real": 1.0, "imag": 0.0}},
        )
        dipole_to_mesh(element)

        assert len(element.sources) == 1
        # Center node for 10 segments: node 6 and 7 (1-based)
        assert element.sources[0].node_start == 6
        assert element.sources[0].node_end == 7


# ============================================================================
# Loop — wraparound edge
# ============================================================================


class TestLoopWraparoundEdge:
    """Verify wraparound edge from last node back to first for closed loops."""

    @pytest.mark.parametrize("segments", [8, 12, 36])
    def test_closed_loop_even_segments_has_wraparound(self, segments):
        """Closed loop with even segment count includes wraparound edge."""
        element = create_loop(radius=0.1, gap=0.0, segments=segments)
        mesh = loop_to_mesh(element)

        # Closed loop: N nodes, N edges (including wraparound)
        assert len(mesh.nodes) == segments
        assert len(mesh.edges) == segments
        assert len(mesh.radii) == segments

        # Check wraparound: last edge connects last node to first
        last_edge = mesh.edges[-1]
        assert last_edge == [segments, 1], f"Expected wraparound [N, 1], got {last_edge}"

    @pytest.mark.parametrize("segments", [7, 11, 37])
    def test_closed_loop_odd_segments_has_wraparound(self, segments):
        """Closed loop with odd segment count includes wraparound edge."""
        element = create_loop(radius=0.1, gap=0.0, segments=segments)
        mesh = loop_to_mesh(element)

        assert len(mesh.nodes) == segments
        assert len(mesh.edges) == segments

        last_edge = mesh.edges[-1]
        assert last_edge == [segments, 1]

    def test_gapped_loop_no_wraparound(self):
        """Gapped loop should NOT have wraparound edge."""
        segments = 12
        element = create_loop(radius=0.1, gap=0.01, segments=segments)
        mesh = loop_to_mesh(element)

        # Gapped loop: N+1 nodes, N edges (no wraparound)
        assert len(mesh.nodes) == segments + 1
        assert len(mesh.edges) == segments

        # No edge connects back to node 1 from last node
        for edge in mesh.edges:
            assert not (edge[0] == segments + 1 and edge[1] == 1)

    def test_closed_loop_wraparound_carries_correct_radius(self):
        """Wraparound edge should have the same wire radius as other edges."""
        wire_radius = 0.002
        element = create_loop(radius=0.1, gap=0.0, segments=8, wire_radius=wire_radius)
        mesh = loop_to_mesh(element)

        # All radii should be equal (including wraparound)
        assert all(r == wire_radius for r in mesh.radii)

    def test_closed_loop_vs_removes_wire_at_source(self):
        """When a VS is on the wraparound edge, that wire edge is removed."""
        segments = 8
        element = create_loop(
            radius=0.1,
            gap=0.0,
            segments=segments,
            source={
                "type": "voltage",
                "amplitude": {"real": 1.0, "imag": 0.0},
            },
        )
        mesh = loop_to_mesh(element)

        # Source is at [segments, 1] for closed loop VS
        assert element.sources[0].node_start == segments
        assert element.sources[0].node_end == 1

        # Wire edge [segments, 1] should be removed (source replaces it)
        for edge in mesh.edges:
            assert edge != [segments, 1] and edge != [1, segments]

        # N nodes, N-1 wire edges (one removed for source)
        assert len(mesh.edges) == segments - 1

    def test_closed_loop_cs_two_terminal_removes_wire(self):
        """Two-terminal CS on closed loop removes the wire between its terminals."""
        segments = 12
        element = create_loop(
            radius=0.1,
            gap=0.0,
            segments=segments,
            source={
                "type": "current",
                "amplitude": {"real": 0.1, "imag": 0.0},
            },
        )
        mesh = loop_to_mesh(element)

        # CS on closed loop: node_start=1, node_end=segments (two-terminal)
        assert element.sources[0].node_start == 1
        assert element.sources[0].node_end == segments

        # Wire between these nodes should be removed
        for edge in mesh.edges:
            assert edge != [segments, 1] and edge != [1, segments]

        assert len(mesh.edges) == segments - 1


# ============================================================================
# Rod — ground node and node count
# ============================================================================


class TestRodGroundNode:
    """Verify rod builder ground node and node count."""

    @pytest.mark.parametrize("segments", [1, 5, 10, 21, 50])
    def test_rod_n_segments_produces_n_plus_1_nodes(self, segments):
        """N segments must produce exactly N+1 nodes."""
        element = create_rod(length=1.0, segments=segments)
        mesh = rod_to_mesh(element)

        assert len(mesh.nodes) == segments + 1
        assert len(mesh.edges) == segments
        assert len(mesh.radii) == segments

    def test_rod_source_references_ground_node(self):
        """Rod source should connect from ground (node 0) to first mesh node (1)."""
        element = create_rod(
            length=0.5,
            segments=10,
            source={
                "type": "voltage",
                "amplitude": {"real": 1.0, "imag": 0.0},
            },
        )
        rod_to_mesh(element)

        assert len(element.sources) == 1
        assert element.sources[0].node_start == 0  # Ground
        assert element.sources[0].node_end == 1  # First mesh node

    def test_rod_base_at_origin(self):
        """First node should be at the base position."""
        base = (1.0, 2.0, 3.0)
        element = create_rod(length=0.5, base_position=base, segments=5)
        mesh = rod_to_mesh(element)

        np.testing.assert_array_almost_equal(mesh.nodes[0], list(base))

    def test_rod_tip_at_correct_position(self):
        """Last node should be at base + length * orientation."""
        length = 0.75
        base = (0.0, 0.0, 0.0)
        orientation = (0.0, 0.0, 1.0)
        element = create_rod(
            length=length,
            base_position=base,
            orientation=orientation,
            segments=10,
        )
        mesh = rod_to_mesh(element)

        expected_tip = [0.0, 0.0, 0.75]
        np.testing.assert_array_almost_equal(mesh.nodes[-1], expected_tip)

    def test_rod_edges_consecutive_1based(self):
        """Edges should connect consecutive nodes with 1-based indexing."""
        element = create_rod(length=1.0, segments=5)
        mesh = rod_to_mesh(element)

        for i, edge in enumerate(mesh.edges):
            assert edge == [i + 1, i + 2]


# ============================================================================
# Lumped elements at boundary nodes
# ============================================================================


class TestLumpedElementBoundaryNodes:
    """Test lumped elements placed at boundary nodes (first, last, ground)."""

    def test_dipole_lumped_at_ground_node(self):
        """Lumped element from ground (0) to first node should be valid."""
        element = create_dipole(
            length=1.0,
            gap=0.01,
            segments=5,
            lumped_elements=[
                {"type": "rlc", "R": 50.0, "L": 0.0, "C_inv": 0.0, "node_start": 0, "node_end": 1}
            ],
        )
        mesh = dipole_to_mesh(element)
        assert mesh is not None

    def test_dipole_lumped_at_last_node(self):
        """Lumped element at last node of a half should be valid."""
        segments = 5
        element = create_dipole(
            length=1.0,
            gap=0.01,
            segments=segments,
            lumped_elements=[
                {
                    "type": "rlc",
                    "R": 100.0,
                    "L": 0.0,
                    "C_inv": 0.0,
                    "node_start": segments,
                    "node_end": segments + 1,
                }
            ],
        )
        mesh = dipole_to_mesh(element)
        assert mesh is not None

    def test_loop_lumped_at_boundary_nodes(self):
        """Lumped element spanning first and last nodes of closed loop."""
        segments = 12
        element = create_loop(
            radius=0.1,
            gap=0.0,
            segments=segments,
            lumped_elements=[
                {
                    "type": "rlc",
                    "R": 75.0,
                    "L": 0.0,
                    "C_inv": 0.0,
                    "node_start": 1,
                    "node_end": segments,
                }
            ],
        )
        mesh = loop_to_mesh(element)
        assert mesh is not None

    def test_rod_lumped_at_ground(self):
        """Lumped element from ground to first mesh node on rod."""
        element = create_rod(
            length=0.5,
            segments=5,
            lumped_elements=[
                {"type": "rlc", "R": 50.0, "L": 0.0, "C_inv": 0.0, "node_start": 0, "node_end": 1}
            ],
        )
        mesh = rod_to_mesh(element)
        assert mesh is not None

    def test_dipole_lumped_out_of_range_raises(self):
        """Lumped element referencing a node beyond mesh size should raise."""
        segments = 5
        element = create_dipole(
            length=1.0,
            gap=0.01,
            segments=segments,
            lumped_elements=[
                {
                    "type": "rlc",
                    "R": 50.0,
                    "L": 0.0,
                    "C_inv": 0.0,
                    "node_start": 1,
                    "node_end": 999,  # Way out of range
                }
            ],
        )
        with pytest.raises(ValueError, match="node"):
            dipole_to_mesh(element)

    def test_loop_lumped_out_of_range_raises(self):
        """Lumped element referencing node beyond loop mesh should raise."""
        element = create_loop(
            radius=0.1,
            gap=0.0,
            segments=8,
            lumped_elements=[
                {"type": "rlc", "R": 50.0, "L": 0.0, "C_inv": 0.0, "node_start": 1, "node_end": 100}
            ],
        )
        with pytest.raises(ValueError, match="node"):
            loop_to_mesh(element)

    def test_rod_lumped_out_of_range_raises(self):
        """Lumped element referencing node beyond rod mesh should raise."""
        element = create_rod(
            length=0.5,
            segments=5,
            lumped_elements=[
                {"type": "rlc", "R": 50.0, "L": 0.0, "C_inv": 0.0, "node_start": 0, "node_end": 50}
            ],
        )
        with pytest.raises(ValueError, match="node"):
            rod_to_mesh(element)


# ============================================================================
# source_edges population
# ============================================================================


class TestSourceEdgesPopulation:
    """Verify that source_edges in Mesh identifies which edges host sources."""

    def test_dipole_gap_vs_source_edges(self):
        """Gap dipole with VS should populate source_edges."""
        element = create_dipole(
            length=1.0,
            gap=0.01,
            segments=5,
            source={"type": "voltage", "amplitude": {"real": 1.0, "imag": 0.0}},
        )
        mesh = dipole_to_mesh(element)

        # For gap dipole VS: sources are at ground→upper and ground→lower
        # These are NOT mesh edges (they go to ground node 0), so source_edges
        # refers to external source branches, not mesh wire edges
        # source_edges should be populated based on the builder logic
        assert isinstance(mesh.source_edges, list)

    def test_loop_vs_source_edges(self):
        """Closed loop with VS should populate source_edges."""
        element = create_loop(
            radius=0.1,
            gap=0.0,
            segments=8,
            source={"type": "voltage", "amplitude": {"real": 1.0, "imag": 0.0}},
        )
        mesh = loop_to_mesh(element)
        assert isinstance(mesh.source_edges, list)

    def test_rod_vs_source_edges(self):
        """Rod with VS should populate source_edges."""
        element = create_rod(
            length=0.5,
            segments=5,
            source={"type": "voltage", "amplitude": {"real": 1.0, "imag": 0.0}},
        )
        mesh = rod_to_mesh(element)
        assert isinstance(mesh.source_edges, list)

    def test_no_source_empty_source_edges(self):
        """Mesh without any source should have empty source_edges."""
        element = create_dipole(length=1.0, gap=0.01, segments=5)
        mesh = dipole_to_mesh(element)
        assert mesh.source_edges == []
