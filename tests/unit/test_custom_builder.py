"""
TDD tests for the custom antenna builder.

Tests cover:
  - create_custom() input validation
  - custom_to_mesh() mesh generation
  - Source and lumped element handling
  - Connectivity checking (warnings for disconnected graphs)
  - Larger / performance geometries
  - POST /api/antenna/custom endpoint integration

These tests are written BEFORE the implementation (TDD) and are expected
to fail with ImportError until create_custom / custom_to_mesh are added to
backend/preprocessor/builders.py and the endpoint is wired up in main.py.
"""

import logging
import math
from datetime import datetime, timedelta, timezone

import pytest

from backend.preprocessor.builders import create_custom, custom_to_mesh

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _two_node_geometry(**overrides):
    """Minimal valid geometry: two nodes, one edge."""
    base = {
        "nodes": [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 2, "x": 0, "y": 0, "z": 0.5},
        ],
        "edges": [{"node_start": 1, "node_end": 2}],
    }
    base.update(overrides)
    return base


# =========================================================================
# Unit tests — create_custom() validation
# =========================================================================


class TestCustomBuilderValidation:
    """Test input validation for create_custom()."""

    def test_valid_simple_geometry(self):
        """Two nodes, one edge — basic happy path."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 2, "x": 0, "y": 0, "z": 0.1},
        ]
        edges = [{"node_start": 1, "node_end": 2}]
        element = create_custom(nodes=nodes, edges=edges)

        assert element.type == "custom"
        assert element.name == "Custom Antenna"
        assert "nodes" in element.parameters
        assert "edges" in element.parameters

    def test_custom_name(self):
        """Name is stored in element."""
        geo = _two_node_geometry()
        element = create_custom(name="My Yagi", **geo)
        assert element.name == "My Yagi"

    def test_element_has_uuid(self):
        """Element receives a unique UUID."""
        geo = _two_node_geometry()
        e1 = create_custom(**geo)
        e2 = create_custom(**geo)
        assert e1.id != e2.id

    def test_element_has_created_at(self):
        """Element has a created_at timestamp."""
        geo = _two_node_geometry()
        element = create_custom(**geo)
        assert element.created_at is not None

    # --- duplicate / missing node validation ----------------------------------

    def test_duplicate_node_ids_raises(self):
        """Two nodes with same ID raises ValueError."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 1, "x": 1, "y": 0, "z": 0},
        ]
        edges = [{"node_start": 1, "node_end": 1}]
        with pytest.raises(ValueError, match="[Dd]uplicate"):
            create_custom(nodes=nodes, edges=edges)

    def test_edge_references_nonexistent_node_raises(self):
        """Edge pointing to non-existent node raises ValueError."""
        nodes = [{"id": 1, "x": 0, "y": 0, "z": 0}]
        edges = [{"node_start": 1, "node_end": 99}]
        with pytest.raises(ValueError, match="node"):
            create_custom(nodes=nodes, edges=edges)

    # --- edge validation -------------------------------------------------------

    def test_no_edges_raises(self):
        """At least one edge required."""
        nodes = [{"id": 1, "x": 0, "y": 0, "z": 0}]
        with pytest.raises(ValueError, match="[Ee]dge"):
            create_custom(nodes=nodes, edges=[])

    def test_duplicate_edges_raises(self):
        """Same node pair appearing twice raises ValueError."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 2, "x": 1, "y": 0, "z": 0},
        ]
        edges = [
            {"node_start": 1, "node_end": 2},
            {"node_start": 1, "node_end": 2},
        ]
        with pytest.raises(ValueError, match="[Dd]uplicate"):
            create_custom(nodes=nodes, edges=edges)

    def test_reverse_duplicate_edges_raises(self):
        """Edge (1,2) and (2,1) are duplicates."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 2, "x": 1, "y": 0, "z": 0},
        ]
        edges = [
            {"node_start": 1, "node_end": 2},
            {"node_start": 2, "node_end": 1},
        ]
        with pytest.raises(ValueError, match="[Dd]uplicate"):
            create_custom(nodes=nodes, edges=edges)

    def test_self_loop_edge_raises(self):
        """Edge connecting node to itself raises ValueError."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 2, "x": 1, "y": 0, "z": 0},
        ]
        edges = [{"node_start": 1, "node_end": 1}]
        with pytest.raises(ValueError, match="[Ss]elf"):
            create_custom(nodes=nodes, edges=edges)

    # --- coordinate / numeric validation --------------------------------------

    def test_nan_coordinates_raises(self):
        """NaN in node coordinates raises ValueError."""
        nodes = [
            {"id": 1, "x": float("nan"), "y": 0, "z": 0},
            {"id": 2, "x": 1, "y": 0, "z": 0},
        ]
        edges = [{"node_start": 1, "node_end": 2}]
        with pytest.raises(ValueError, match="[Ff]inite|[Nn]aN"):
            create_custom(nodes=nodes, edges=edges)

    def test_inf_coordinates_raises(self):
        """Inf in node coordinates raises ValueError."""
        nodes = [
            {"id": 1, "x": float("inf"), "y": 0, "z": 0},
            {"id": 2, "x": 1, "y": 0, "z": 0},
        ]
        edges = [{"node_start": 1, "node_end": 2}]
        with pytest.raises(ValueError, match="[Ff]inite|[Ii]nf"):
            create_custom(nodes=nodes, edges=edges)

    def test_negative_inf_coordinates_raises(self):
        """Negative infinity in node coordinates raises ValueError."""
        nodes = [
            {"id": 1, "x": float("-inf"), "y": 0, "z": 0},
            {"id": 2, "x": 1, "y": 0, "z": 0},
        ]
        edges = [{"node_start": 1, "node_end": 2}]
        with pytest.raises(ValueError, match="[Ff]inite|[Ii]nf"):
            create_custom(nodes=nodes, edges=edges)

    # --- node ID validation ---------------------------------------------------

    def test_non_positive_node_id_raises(self):
        """Node ID must be positive integer."""
        nodes = [
            {"id": 0, "x": 0, "y": 0, "z": 0},
            {"id": 1, "x": 1, "y": 0, "z": 0},
        ]
        edges = [{"node_start": 0, "node_end": 1}]
        with pytest.raises(ValueError, match="positive"):
            create_custom(nodes=nodes, edges=edges)

    def test_negative_node_id_raises(self):
        """Negative node ID raises ValueError."""
        nodes = [
            {"id": -1, "x": 0, "y": 0, "z": 0},
            {"id": 2, "x": 1, "y": 0, "z": 0},
        ]
        edges = [{"node_start": -1, "node_end": 2}]
        with pytest.raises(ValueError, match="positive"):
            create_custom(nodes=nodes, edges=edges)

    # --- radius validation ----------------------------------------------------

    def test_negative_radius_raises(self):
        """Negative wire radius raises ValueError."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0, "radius": -0.001},
            {"id": 2, "x": 1, "y": 0, "z": 0},
        ]
        edges = [{"node_start": 1, "node_end": 2}]
        with pytest.raises(ValueError, match="[Rr]adius"):
            create_custom(nodes=nodes, edges=edges)

    def test_zero_radius_raises(self):
        """Zero wire radius raises ValueError."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0, "radius": 0.0},
            {"id": 2, "x": 1, "y": 0, "z": 0},
        ]
        edges = [{"node_start": 1, "node_end": 2}]
        with pytest.raises(ValueError, match="[Rr]adius"):
            create_custom(nodes=nodes, edges=edges)

    def test_negative_edge_radius_raises(self):
        """Negative per-edge radius raises ValueError."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 2, "x": 1, "y": 0, "z": 0},
        ]
        edges = [{"node_start": 1, "node_end": 2, "radius": -0.001}]
        with pytest.raises(ValueError, match="[Rr]adius"):
            create_custom(nodes=nodes, edges=edges)

    def test_no_nodes_raises(self):
        """Empty node list raises ValueError."""
        with pytest.raises(ValueError, match="[Nn]ode"):
            create_custom(nodes=[], edges=[{"node_start": 1, "node_end": 2}])

    # --- parameter storage ----------------------------------------------------

    def test_parameters_contain_input_data(self):
        """Element parameters dict stores the input nodes and edges."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0, "radius": 0.002},
            {"id": 2, "x": 0, "y": 0, "z": 0.5},
        ]
        edges = [{"node_start": 1, "node_end": 2}]
        element = create_custom(nodes=nodes, edges=edges)

        assert "nodes" in element.parameters
        assert "edges" in element.parameters
        assert len(element.parameters["nodes"]) == 2
        assert len(element.parameters["edges"]) == 1

    def test_default_radius_applied_to_node(self):
        """Nodes without explicit radius get default 0.001."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 2, "x": 1, "y": 0, "z": 0},
        ]
        edges = [{"node_start": 1, "node_end": 2}]
        element = create_custom(nodes=nodes, edges=edges)

        for node in element.parameters["nodes"]:
            assert node["radius"] == 0.001


# =========================================================================
# Unit tests — custom_to_mesh() mesh generation
# =========================================================================


class TestCustomMeshGeneration:
    """Test mesh generation from custom elements."""

    def test_simple_two_node_mesh(self):
        """Two nodes, one edge: mesh has correct structure."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 2, "x": 0, "y": 0, "z": 0.5},
        ]
        edges = [{"node_start": 1, "node_end": 2}]
        element = create_custom(nodes=nodes, edges=edges)
        mesh = custom_to_mesh(element)

        assert mesh.num_nodes == 2
        assert mesh.num_edges == 1
        assert mesh.nodes[0] == [0.0, 0.0, 0.0]
        assert mesh.nodes[1] == [0.0, 0.0, 0.5]
        assert mesh.edges[0] == [1, 2]
        assert len(mesh.radii) == 1
        assert mesh.radii[0] == 0.001  # default radius

    def test_three_node_triangle(self):
        """Three nodes forming triangle: 3 edges, correct topology."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 2, "x": 1, "y": 0, "z": 0},
            {"id": 3, "x": 0.5, "y": 1, "z": 0},
        ]
        edges = [
            {"node_start": 1, "node_end": 2},
            {"node_start": 2, "node_end": 3},
            {"node_start": 3, "node_end": 1},
        ]
        element = create_custom(nodes=nodes, edges=edges)
        mesh = custom_to_mesh(element)

        assert mesh.num_nodes == 3
        assert mesh.num_edges == 3

    def test_reindex_gapped_node_ids(self):
        """Node IDs with gaps (1, 5, 10) re-indexed to (1, 2, 3)."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 5, "x": 1, "y": 0, "z": 0},
            {"id": 10, "x": 2, "y": 0, "z": 0},
        ]
        edges = [
            {"node_start": 1, "node_end": 5},
            {"node_start": 5, "node_end": 10},
        ]
        element = create_custom(nodes=nodes, edges=edges)
        mesh = custom_to_mesh(element)

        assert mesh.num_nodes == 3
        # Edges should be re-indexed to [1,2], [2,3]
        assert mesh.edges[0] == [1, 2]
        assert mesh.edges[1] == [2, 3]
        # Coordinates preserved in sorted-ID order
        assert mesh.nodes[0] == [0, 0, 0]
        assert mesh.nodes[1] == [1, 0, 0]
        assert mesh.nodes[2] == [2, 0, 0]

    def test_reindex_unsorted_node_ids(self):
        """Node IDs supplied out of order are sorted and re-indexed."""
        nodes = [
            {"id": 10, "x": 2, "y": 0, "z": 0},
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 5, "x": 1, "y": 0, "z": 0},
        ]
        edges = [
            {"node_start": 1, "node_end": 5},
            {"node_start": 5, "node_end": 10},
        ]
        element = create_custom(nodes=nodes, edges=edges)
        mesh = custom_to_mesh(element)

        assert mesh.num_nodes == 3
        assert mesh.edges[0] == [1, 2]
        assert mesh.edges[1] == [2, 3]
        assert mesh.nodes[0] == [0, 0, 0]
        assert mesh.nodes[1] == [1, 0, 0]
        assert mesh.nodes[2] == [2, 0, 0]

    def test_per_edge_radius_override(self):
        """Edge-level radius overrides node-level radius."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0, "radius": 0.001},
            {"id": 2, "x": 1, "y": 0, "z": 0, "radius": 0.001},
        ]
        edges = [{"node_start": 1, "node_end": 2, "radius": 0.005}]
        element = create_custom(nodes=nodes, edges=edges)
        mesh = custom_to_mesh(element)

        assert mesh.radii[0] == 0.005  # edge override wins

    def test_node_radius_fallback(self):
        """When no edge radius: use average of start/end node radii."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0, "radius": 0.002},
            {"id": 2, "x": 1, "y": 0, "z": 0, "radius": 0.004},
        ]
        edges = [{"node_start": 1, "node_end": 2}]
        element = create_custom(nodes=nodes, edges=edges)
        mesh = custom_to_mesh(element)

        assert mesh.radii[0] == pytest.approx(0.003)  # avg of 0.002 and 0.004

    def test_mixed_radius_sources(self):
        """Some edges have explicit radius, others fall back to node avg."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0, "radius": 0.002},
            {"id": 2, "x": 1, "y": 0, "z": 0, "radius": 0.004},
            {"id": 3, "x": 2, "y": 0, "z": 0, "radius": 0.006},
        ]
        edges = [
            {"node_start": 1, "node_end": 2, "radius": 0.01},  # explicit
            {"node_start": 2, "node_end": 3},  # fallback: avg(0.004, 0.006) = 0.005
        ]
        element = create_custom(nodes=nodes, edges=edges)
        mesh = custom_to_mesh(element)

        assert mesh.radii[0] == pytest.approx(0.01)
        assert mesh.radii[1] == pytest.approx(0.005)

    def test_edge_to_element_maps_all_edges(self):
        """All edges map to the element's UUID."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 2, "x": 1, "y": 0, "z": 0},
            {"id": 3, "x": 2, "y": 0, "z": 0},
        ]
        edges = [
            {"node_start": 1, "node_end": 2},
            {"node_start": 2, "node_end": 3},
        ]
        element = create_custom(nodes=nodes, edges=edges)
        mesh = custom_to_mesh(element)

        assert len(mesh.edge_to_element) == 2
        assert all(v == str(element.id) for v in mesh.edge_to_element.values())

    def test_mesh_edges_are_one_based(self):
        """Mesh edges use 1-based node indexing (PEEC convention)."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 2, "x": 1, "y": 0, "z": 0},
        ]
        edges = [{"node_start": 1, "node_end": 2}]
        element = create_custom(nodes=nodes, edges=edges)
        mesh = custom_to_mesh(element)

        # All node refs in edges must be >= 1
        for edge in mesh.edges:
            assert edge[0] >= 1
            assert edge[1] >= 1

    def test_mesh_nodes_are_3d(self):
        """Every mesh node has exactly 3 coordinates."""
        geo = _two_node_geometry()
        element = create_custom(**geo)
        mesh = custom_to_mesh(element)

        for node in mesh.nodes:
            assert len(node) == 3

    def test_mesh_metadata_present(self):
        """Mesh has a metadata dict (may be empty)."""
        geo = _two_node_geometry()
        element = create_custom(**geo)
        mesh = custom_to_mesh(element)

        assert isinstance(mesh.metadata, dict)

    def test_mesh_can_convert_to_numpy(self):
        """Mesh.to_numpy() returns valid arrays."""
        geo = _two_node_geometry()
        element = create_custom(**geo)
        mesh = custom_to_mesh(element)

        nodes_np, edges_np, radii_np = mesh.to_numpy()
        assert nodes_np.shape == (2, 3)
        assert edges_np.shape == (1, 2)
        assert radii_np.shape == (1,)


# =========================================================================
# Unit tests — source and lumped element handling
# =========================================================================


class TestCustomSourcesAndLumpedElements:
    """Test source and lumped element handling in custom builder."""

    def test_source_passthrough(self):
        """Source with explicit node_start/node_end is preserved."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 2, "x": 0, "y": 0, "z": 0.5},
        ]
        edges = [{"node_start": 1, "node_end": 2}]
        source = {
            "type": "voltage",
            "amplitude": {"real": 1.0, "imag": 0.0},
            "node_start": 1,
            "node_end": 2,
        }
        element = create_custom(nodes=nodes, edges=edges, sources=[source])

        assert len(element.sources) == 1
        assert element.sources[0].type == "voltage"
        assert element.sources[0].node_start == 1
        assert element.sources[0].node_end == 2

    def test_source_amplitude_complex(self):
        """Source amplitude is stored as complex."""
        geo = _two_node_geometry()
        source = {
            "type": "voltage",
            "amplitude": {"real": 1.0, "imag": -0.5},
            "node_start": 1,
            "node_end": 2,
        }
        element = create_custom(**geo, sources=[source])

        assert element.sources[0].amplitude == complex(1.0, -0.5)

    def test_source_nodes_reindexed(self):
        """When node IDs are re-indexed, source nodes are also re-indexed."""
        nodes = [
            {"id": 5, "x": 0, "y": 0, "z": 0},
            {"id": 10, "x": 0, "y": 0, "z": 0.5},
        ]
        edges = [{"node_start": 5, "node_end": 10}]
        source = {
            "type": "voltage",
            "amplitude": {"real": 1.0, "imag": 0.0},
            "node_start": 5,
            "node_end": 10,
        }
        element = create_custom(nodes=nodes, edges=edges, sources=[source])
        mesh = custom_to_mesh(element)

        # After re-indexing: node 5→1, node 10→2
        assert element.sources[0].node_start == 1
        assert element.sources[0].node_end == 2

    def test_source_edges_populated(self):
        """source_edges has the index of the edge hosting the source."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 2, "x": 0, "y": 0, "z": 0.5},
            {"id": 3, "x": 0, "y": 0, "z": 1.0},
        ]
        edges = [
            {"node_start": 1, "node_end": 2},
            {"node_start": 2, "node_end": 3},
        ]
        source = {
            "type": "voltage",
            "amplitude": {"real": 1.0, "imag": 0.0},
            "node_start": 2,
            "node_end": 3,
        }
        element = create_custom(nodes=nodes, edges=edges, sources=[source])
        mesh = custom_to_mesh(element)

        # Source is on edge index 1 (0-based: second edge is [2,3])
        assert 1 in mesh.source_edges

    def test_source_edges_first_edge(self):
        """Source on the first edge produces source_edges = [0]."""
        geo = _two_node_geometry()
        source = {
            "type": "voltage",
            "amplitude": {"real": 1.0, "imag": 0.0},
            "node_start": 1,
            "node_end": 2,
        }
        element = create_custom(**geo, sources=[source])
        mesh = custom_to_mesh(element)

        assert 0 in mesh.source_edges

    def test_multiple_sources(self):
        """Multiple sources on different edges are all tracked."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 2, "x": 0, "y": 0, "z": 0.5},
            {"id": 3, "x": 0, "y": 0, "z": 1.0},
        ]
        edges = [
            {"node_start": 1, "node_end": 2},
            {"node_start": 2, "node_end": 3},
        ]
        sources = [
            {
                "type": "voltage",
                "amplitude": {"real": 1.0, "imag": 0.0},
                "node_start": 1,
                "node_end": 2,
            },
            {
                "type": "voltage",
                "amplitude": {"real": 0.5, "imag": 0.0},
                "node_start": 2,
                "node_end": 3,
            },
        ]
        element = create_custom(nodes=nodes, edges=edges, sources=sources)
        mesh = custom_to_mesh(element)

        assert len(element.sources) == 2
        assert 0 in mesh.source_edges
        assert 1 in mesh.source_edges

    def test_source_series_impedance(self):
        """Source series R/L/C_inv are preserved."""
        geo = _two_node_geometry()
        source = {
            "type": "voltage",
            "amplitude": {"real": 1.0, "imag": 0.0},
            "node_start": 1,
            "node_end": 2,
            "series_R": 50.0,
            "series_L": 1e-9,
            "series_C_inv": 1e12,
        }
        element = create_custom(**geo, sources=[source])

        assert element.sources[0].series_R == 50.0
        assert element.sources[0].series_L == 1e-9
        assert element.sources[0].series_C_inv == 1e12

    def test_lumped_element_passthrough(self):
        """Lumped elements with explicit node indices are preserved."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 2, "x": 0, "y": 0, "z": 0.5},
        ]
        edges = [{"node_start": 1, "node_end": 2}]
        lumped = [
            {
                "type": "rlc",
                "R": 50.0,
                "L": 0,
                "C_inv": 0,
                "node_start": 1,
                "node_end": 2,
            }
        ]
        element = create_custom(nodes=nodes, edges=edges, lumped_elements=lumped)

        assert len(element.lumped_elements) == 1
        assert element.lumped_elements[0].R == 50.0
        assert element.lumped_elements[0].type == "rlc"

    def test_lumped_element_invalid_node_raises(self):
        """Lumped element referencing non-existent node raises error."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 2, "x": 0, "y": 0, "z": 0.5},
        ]
        edges = [{"node_start": 1, "node_end": 2}]
        lumped = [
            {
                "type": "rlc",
                "R": 50.0,
                "L": 0,
                "C_inv": 0,
                "node_start": 1,
                "node_end": 99,
            }
        ]
        # Validation may happen at create_custom or custom_to_mesh time
        with pytest.raises(ValueError, match="node"):
            element = create_custom(nodes=nodes, edges=edges, lumped_elements=lumped)
            custom_to_mesh(element)

    def test_lumped_element_nodes_reindexed(self):
        """Lumped element node references are re-indexed with the nodes."""
        nodes = [
            {"id": 5, "x": 0, "y": 0, "z": 0},
            {"id": 10, "x": 0, "y": 0, "z": 0.5},
        ]
        edges = [{"node_start": 5, "node_end": 10}]
        lumped = [
            {
                "type": "resistor",
                "R": 75.0,
                "L": 0,
                "C_inv": 0,
                "node_start": 5,
                "node_end": 10,
            }
        ]
        element = create_custom(nodes=nodes, edges=edges, lumped_elements=lumped)

        # After re-indexing: node 5→1, node 10→2
        assert element.lumped_elements[0].node_start == 1
        assert element.lumped_elements[0].node_end == 2

    def test_source_ground_node(self):
        """Source referencing node 0 (ground) is valid."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 2, "x": 0, "y": 0, "z": 0.5},
        ]
        edges = [{"node_start": 1, "node_end": 2}]
        source = {
            "type": "voltage",
            "amplitude": {"real": 1.0, "imag": 0.0},
            "node_start": 0,
            "node_end": 1,
        }
        element = create_custom(nodes=nodes, edges=edges, sources=[source])
        mesh = custom_to_mesh(element)

        assert element.sources[0].node_start == 0
        assert element.sources[0].node_end == 1

    def test_lumped_element_ground_node(self):
        """Lumped element referencing node 0 (ground) is valid."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 2, "x": 0, "y": 0, "z": 0.5},
        ]
        edges = [{"node_start": 1, "node_end": 2}]
        lumped = [
            {
                "type": "resistor",
                "R": 50.0,
                "L": 0,
                "C_inv": 0,
                "node_start": 0,
                "node_end": 1,
            }
        ]
        element = create_custom(nodes=nodes, edges=edges, lumped_elements=lumped)

        assert element.lumped_elements[0].node_start == 0

    def test_no_sources_defaults_empty(self):
        """Omitting sources results in an empty list."""
        geo = _two_node_geometry()
        element = create_custom(**geo)

        assert element.sources == []

    def test_no_lumped_elements_defaults_empty(self):
        """Omitting lumped_elements results in an empty list."""
        geo = _two_node_geometry()
        element = create_custom(**geo)

        assert element.lumped_elements == []


# =========================================================================
# Connectivity checking
# =========================================================================


class TestCustomConnectivity:
    """Test connectivity checking for custom geometry."""

    def test_connected_graph_no_warning(self, caplog):
        """Connected graph produces no disconnect warnings."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 2, "x": 1, "y": 0, "z": 0},
            {"id": 3, "x": 2, "y": 0, "z": 0},
        ]
        edges = [
            {"node_start": 1, "node_end": 2},
            {"node_start": 2, "node_end": 3},
        ]
        with caplog.at_level(logging.WARNING):
            element = create_custom(nodes=nodes, edges=edges)
            custom_to_mesh(element)

        assert "disconnect" not in caplog.text.lower()

    def test_disconnected_graph_warns(self, caplog):
        """Disconnected graph logs a warning but does not raise."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 2, "x": 1, "y": 0, "z": 0},
            {"id": 3, "x": 10, "y": 0, "z": 0},
            {"id": 4, "x": 11, "y": 0, "z": 0},
        ]
        edges = [
            {"node_start": 1, "node_end": 2},
            {"node_start": 3, "node_end": 4},  # separate component
        ]
        with caplog.at_level(logging.WARNING):
            element = create_custom(nodes=nodes, edges=edges)
            mesh = custom_to_mesh(element)

        # Should warn about disconnected components
        assert "disconnect" in caplog.text.lower() or "component" in caplog.text.lower()
        # But mesh is still generated
        assert mesh.num_nodes == 4
        assert mesh.num_edges == 2

    def test_single_edge_is_connected(self, caplog):
        """Trivial case: one edge is always connected."""
        geo = _two_node_geometry()
        with caplog.at_level(logging.WARNING):
            element = create_custom(**geo)
            custom_to_mesh(element)

        assert "disconnect" not in caplog.text.lower()


# =========================================================================
# Larger / performance geometries
# =========================================================================


class TestCustomLargerGeometries:
    """Test with more complex geometries."""

    def test_yagi_like_structure(self):
        """Yagi-like: 3 parallel rods (reflector, driven, director)."""
        nodes = [
            # Reflector (slightly longer)
            {"id": 1, "x": -0.05, "y": 0, "z": -0.25, "radius": 0.001},
            {"id": 2, "x": -0.05, "y": 0, "z": 0.25, "radius": 0.001},
            # Driven element (half-wave)
            {"id": 3, "x": 0, "y": 0, "z": -0.24, "radius": 0.001},
            {"id": 4, "x": 0, "y": 0, "z": 0.24, "radius": 0.001},
            # Director (shorter)
            {"id": 5, "x": 0.05, "y": 0, "z": -0.2, "radius": 0.001},
            {"id": 6, "x": 0.05, "y": 0, "z": 0.2, "radius": 0.001},
        ]
        edges = [
            {"node_start": 1, "node_end": 2},  # Reflector
            {"node_start": 3, "node_end": 4},  # Driven
            {"node_start": 5, "node_end": 6},  # Director
        ]
        source = {
            "type": "voltage",
            "amplitude": {"real": 1.0, "imag": 0.0},
            "node_start": 3,
            "node_end": 4,
        }
        element = create_custom(nodes=nodes, edges=edges, sources=[source])
        mesh = custom_to_mesh(element)

        assert mesh.num_nodes == 6
        assert mesh.num_edges == 3
        assert len(element.sources) == 1

    def test_many_nodes_performance(self):
        """100 nodes, 99 edges (chain) completes without error."""
        nodes = [{"id": i, "x": i * 0.01, "y": 0, "z": 0} for i in range(1, 101)]
        edges = [{"node_start": i, "node_end": i + 1} for i in range(1, 100)]
        element = create_custom(nodes=nodes, edges=edges)
        mesh = custom_to_mesh(element)

        assert mesh.num_nodes == 100
        assert mesh.num_edges == 99

    def test_star_topology(self):
        """Central node connected to 5 outer nodes (star graph)."""
        nodes = [{"id": 1, "x": 0, "y": 0, "z": 0}]
        for i in range(2, 7):
            angle = (i - 2) * 2 * math.pi / 5
            nodes.append({"id": i, "x": math.cos(angle) * 0.5, "y": math.sin(angle) * 0.5, "z": 0})
        edges = [{"node_start": 1, "node_end": i} for i in range(2, 7)]

        element = create_custom(nodes=nodes, edges=edges)
        mesh = custom_to_mesh(element)

        assert mesh.num_nodes == 6
        assert mesh.num_edges == 5

    def test_3d_coordinates_preserved(self):
        """Nodes at arbitrary 3D positions have coordinates preserved in mesh."""
        nodes = [
            {"id": 1, "x": 1.5, "y": -2.3, "z": 4.7},
            {"id": 2, "x": -0.1, "y": 3.14, "z": -1.0},
        ]
        edges = [{"node_start": 1, "node_end": 2}]
        element = create_custom(nodes=nodes, edges=edges)
        mesh = custom_to_mesh(element)

        assert mesh.nodes[0] == pytest.approx([1.5, -2.3, 4.7])
        assert mesh.nodes[1] == pytest.approx([-0.1, 3.14, -1.0])

    def test_grid_topology(self):
        """2x2 grid (4 nodes, 4 edges) — a simple planar mesh."""
        nodes = [
            {"id": 1, "x": 0, "y": 0, "z": 0},
            {"id": 2, "x": 1, "y": 0, "z": 0},
            {"id": 3, "x": 0, "y": 1, "z": 0},
            {"id": 4, "x": 1, "y": 1, "z": 0},
        ]
        edges = [
            {"node_start": 1, "node_end": 2},
            {"node_start": 1, "node_end": 3},
            {"node_start": 2, "node_end": 4},
            {"node_start": 3, "node_end": 4},
        ]
        element = create_custom(nodes=nodes, edges=edges)
        mesh = custom_to_mesh(element)

        assert mesh.num_nodes == 4
        assert mesh.num_edges == 4


# =========================================================================
# Integration tests — POST /api/antenna/custom endpoint
# =========================================================================


class TestCustomEndpoint:
    """Integration tests for POST /api/antenna/custom endpoint."""

    @pytest.fixture
    def client(self):
        """Create test client with mocked auth."""
        from fastapi.testclient import TestClient

        from backend.common.auth.dependencies import get_current_user
        from backend.common.auth.identity import UserIdentity, UserRole
        from backend.preprocessor.main import app

        def mock_user():
            return UserIdentity(
                id="test-user",
                email="t@t.com",
                username="tester",
                role=UserRole.USER,
                simulation_tokens=9999,
                flatrate_until=datetime.now(timezone.utc) + timedelta(days=365),
            )

        app.dependency_overrides[get_current_user] = mock_user
        c = TestClient(app)
        yield c
        app.dependency_overrides.clear()

    def test_create_custom_basic(self, client):
        """Basic custom geometry creates successfully."""
        request = {
            "nodes": [
                {"id": 1, "x": 0, "y": 0, "z": 0},
                {"id": 2, "x": 0, "y": 0, "z": 0.5},
            ],
            "edges": [{"node_start": 1, "node_end": 2}],
        }
        resp = client.post("/api/antenna/custom", json=request)
        assert resp.status_code == 200

        data = resp.json()
        assert "element" in data
        assert "mesh" in data
        assert "message" in data
        assert data["element"]["type"] == "custom"
        assert len(data["mesh"]["nodes"]) == 2
        assert len(data["mesh"]["edges"]) == 1

    def test_create_custom_with_name(self, client):
        """Custom name appears in response."""
        request = {
            "name": "My Wire",
            "nodes": [
                {"id": 1, "x": 0, "y": 0, "z": 0},
                {"id": 2, "x": 0, "y": 0, "z": 0.5},
            ],
            "edges": [{"node_start": 1, "node_end": 2}],
        }
        resp = client.post("/api/antenna/custom", json=request)
        assert resp.status_code == 200
        assert resp.json()["element"]["name"] == "My Wire"

    def test_create_custom_with_source(self, client):
        """Custom geometry with source excitation."""
        request = {
            "name": "Fed Wire",
            "nodes": [
                {"id": 1, "x": 0, "y": 0, "z": 0},
                {"id": 2, "x": 0, "y": 0, "z": 0.5},
            ],
            "edges": [{"node_start": 1, "node_end": 2}],
            "sources": [
                {
                    "type": "voltage",
                    "amplitude": {"real": 1.0, "imag": 0.0},
                    "node_start": 1,
                    "node_end": 2,
                }
            ],
        }
        resp = client.post("/api/antenna/custom", json=request)
        assert resp.status_code == 200

        data = resp.json()
        assert len(data["element"]["sources"]) == 1
        assert data["element"]["sources"][0]["type"] == "voltage"

    def test_create_custom_with_lumped_element(self, client):
        """Custom geometry with a lumped load."""
        request = {
            "nodes": [
                {"id": 1, "x": 0, "y": 0, "z": 0},
                {"id": 2, "x": 0, "y": 0, "z": 0.5},
            ],
            "edges": [{"node_start": 1, "node_end": 2}],
            "lumped_elements": [
                {
                    "type": "resistor",
                    "R": 50.0,
                    "L": 0,
                    "C_inv": 0,
                    "node_start": 1,
                    "node_end": 2,
                }
            ],
        }
        resp = client.post("/api/antenna/custom", json=request)
        assert resp.status_code == 200

        data = resp.json()
        assert len(data["element"]["lumped_elements"]) == 1
        assert data["element"]["lumped_elements"][0]["R"] == 50.0

    def test_create_custom_invalid_returns_422_or_400(self, client):
        """Invalid request (no edges) returns 4xx error."""
        request = {
            "nodes": [{"id": 1, "x": 0, "y": 0, "z": 0}],
            "edges": [],
        }
        resp = client.post("/api/antenna/custom", json=request)
        assert resp.status_code in (400, 422)

    def test_create_custom_missing_nodes_returns_422(self, client):
        """Request without required 'nodes' field returns 422."""
        request = {
            "edges": [{"node_start": 1, "node_end": 2}],
        }
        resp = client.post("/api/antenna/custom", json=request)
        assert resp.status_code == 422

    def test_create_custom_with_variable_context(self, client):
        """Custom geometry with variable expressions in context."""
        request = {
            "nodes": [
                {"id": 1, "x": 0, "y": 0, "z": 0},
                {"id": 2, "x": 0, "y": 0, "z": 0.5},
            ],
            "edges": [{"node_start": 1, "node_end": 2}],
            "variable_context": [
                {"name": "freq", "expression": "300e6"},
            ],
        }
        resp = client.post("/api/antenna/custom", json=request)
        assert resp.status_code == 200

    def test_create_custom_response_mesh_structure(self, client):
        """Validate the full mesh structure in the response."""
        request = {
            "nodes": [
                {"id": 1, "x": 0, "y": 0, "z": 0},
                {"id": 2, "x": 1, "y": 0, "z": 0},
                {"id": 3, "x": 2, "y": 0, "z": 0},
            ],
            "edges": [
                {"node_start": 1, "node_end": 2},
                {"node_start": 2, "node_end": 3},
            ],
        }
        resp = client.post("/api/antenna/custom", json=request)
        assert resp.status_code == 200

        mesh = resp.json()["mesh"]
        assert "nodes" in mesh
        assert "edges" in mesh
        assert "radii" in mesh
        assert "edge_to_element" in mesh
        assert "source_edges" in mesh
        assert len(mesh["nodes"]) == 3
        assert len(mesh["edges"]) == 2
        assert len(mesh["radii"]) == 2

    def test_create_custom_per_edge_radius_in_response(self, client):
        """Per-edge radius override appears in response mesh."""
        request = {
            "nodes": [
                {"id": 1, "x": 0, "y": 0, "z": 0},
                {"id": 2, "x": 1, "y": 0, "z": 0},
            ],
            "edges": [{"node_start": 1, "node_end": 2, "radius": 0.005}],
        }
        resp = client.post("/api/antenna/custom", json=request)
        assert resp.status_code == 200
        assert resp.json()["mesh"]["radii"][0] == pytest.approx(0.005)

    def test_create_custom_duplicate_node_returns_400(self, client):
        """Duplicate node IDs return a 400 error."""
        request = {
            "nodes": [
                {"id": 1, "x": 0, "y": 0, "z": 0},
                {"id": 1, "x": 1, "y": 0, "z": 0},
            ],
            "edges": [{"node_start": 1, "node_end": 1}],
        }
        resp = client.post("/api/antenna/custom", json=request)
        assert resp.status_code == 400
