"""Tests for lumped element node reference validation with 1-based indexing."""

import pytest

from backend.common.models.geometry import LumpedElement
from backend.common.utils.validation import validate_lumped_element_nodes


def test_valid_nodes_within_bounds():
    """Test that valid nodes within mesh bounds pass validation (1-based: 1 to N)."""
    lumped = [
        LumpedElement(type="resistor", R=50.0, L=0, C_inv=0, node_start=0, node_end=1, tag="R1"),
        LumpedElement(type="resistor", R=100.0, L=0, C_inv=0, node_start=5, node_end=6, tag="R2"),
    ]
    num_nodes = 10  # Valid node indices: 1-10

    # Should not raise
    validate_lumped_element_nodes(lumped, num_nodes, "test_antenna")


def test_ground_node_allowed():
    """Test that node 0 (ground) is always valid."""
    lumped = [
        LumpedElement(
            type="resistor", R=50.0, L=0, C_inv=0, node_start=0, node_end=1, tag="R_to_gnd"
        ),
        LumpedElement(
            type="resistor", R=100.0, L=0, C_inv=0, node_start=5, node_end=0, tag="R_from_gnd"
        ),
    ]
    num_nodes = 10

    # Should not raise
    validate_lumped_element_nodes(lumped, num_nodes, "test_antenna")


def test_negative_nodes_allowed():
    """Test that negative node indices (appended nodes) are valid."""
    lumped = [
        LumpedElement(
            type="resistor", R=50.0, L=0, C_inv=0, node_start=-1, node_end=1, tag="R_appended1"
        ),
        LumpedElement(
            type="resistor", R=100.0, L=0, C_inv=0, node_start=5, node_end=-2, tag="R_appended2"
        ),
        LumpedElement(
            type="resistor",
            R=75.0,
            L=0,
            C_inv=0,
            node_start=-3,
            node_end=-1,
            tag="R_between_appended",
        ),
    ]
    num_nodes = 10

    # Should not raise
    validate_lumped_element_nodes(lumped, num_nodes, "test_antenna")


def test_node_at_upper_boundary():
    """Test that nodes at the upper boundary (N) are valid with 1-based indexing."""
    lumped = [
        LumpedElement(
            type="resistor", R=50.0, L=0, C_inv=0, node_start=9, node_end=10, tag="R_at_end"
        ),
    ]
    num_nodes = 10  # Valid nodes: 1-10 (1-based indexing)

    # Should not raise
    validate_lumped_element_nodes(lumped, num_nodes, "test_antenna")


def test_invalid_node_start_too_large():
    """Test that node_start > num_nodes raises ValueError (1-based indexing)."""
    lumped = [
        LumpedElement(
            type="resistor", R=50.0, L=0, C_inv=0, node_start=11, node_end=5, tag="R_invalid"
        ),
    ]
    num_nodes = 10  # Valid nodes: 1-10

    with pytest.raises(ValueError) as exc_info:
        validate_lumped_element_nodes(lumped, num_nodes, "test_antenna")

    error_msg = str(exc_info.value)
    assert "node_start=11" in error_msg
    assert "out of range" in error_msg.lower()
    assert "R_invalid" in error_msg
    assert "1 to 10" in error_msg


def test_invalid_node_end_too_large():
    """Test that node_end > num_nodes raises ValueError (1-based indexing)."""
    lumped = [
        LumpedElement(
            type="resistor", R=50.0, L=0, C_inv=0, node_start=5, node_end=15, tag="R_invalid"
        ),
    ]
    num_nodes = 10  # Valid nodes: 1-10

    with pytest.raises(ValueError) as exc_info:
        validate_lumped_element_nodes(lumped, num_nodes, "test_antenna")

    error_msg = str(exc_info.value)
    assert "node_end=15" in error_msg
    assert "out of range" in error_msg.lower()
    assert "R_invalid" in error_msg


def test_invalid_both_nodes_too_large():
    """Test that both nodes out of range raises ValueError for first invalid node."""
    lumped = [
        LumpedElement(
            type="resistor", R=50.0, L=0, C_inv=0, node_start=20, node_end=25, tag="R_both_invalid"
        ),
    ]
    num_nodes = 10

    with pytest.raises(ValueError) as exc_info:
        validate_lumped_element_nodes(lumped, num_nodes, "test_antenna")

    # Should catch the first invalid node (node_start)
    error_msg = str(exc_info.value)
    assert "node_start=20" in error_msg
    assert "R_both_invalid" in error_msg


def test_multiple_elements_first_invalid():
    """Test that validation stops at first invalid element."""
    lumped = [
        LumpedElement(
            type="resistor", R=50.0, L=0, C_inv=0, node_start=0, node_end=1, tag="R_valid"
        ),
        LumpedElement(
            type="resistor", R=100.0, L=0, C_inv=0, node_start=15, node_end=5, tag="R_invalid"
        ),
        LumpedElement(
            type="resistor", R=75.0, L=0, C_inv=0, node_start=20, node_end=25, tag="R_also_invalid"
        ),
    ]
    num_nodes = 10

    with pytest.raises(ValueError) as exc_info:
        validate_lumped_element_nodes(lumped, num_nodes, "test_antenna")

    # Should catch element at index 1
    error_msg = str(exc_info.value)
    assert "element 1" in error_msg
    assert "R_invalid" in error_msg


def test_empty_lumped_elements():
    """Test that empty list passes validation."""
    lumped = []
    num_nodes = 10

    # Should not raise
    validate_lumped_element_nodes(lumped, num_nodes, "test_antenna")


def test_single_node_mesh():
    """Test validation with mesh having only one node."""
    lumped = [
        LumpedElement(
            type="resistor", R=50.0, L=0, C_inv=0, node_start=0, node_end=1, tag="R_to_first"
        ),
    ]
    num_nodes = 1  # Valid node: 1 (plus 0=ground)

    # Should not raise
    validate_lumped_element_nodes(lumped, num_nodes, "test_antenna")


def test_complex_valid_configuration():
    """Test a complex but valid configuration with all node types."""
    lumped = [
        LumpedElement(type="resistor", R=50.0, L=0, C_inv=0, node_start=0, node_end=1, tag="R1"),
        LumpedElement(type="inductor", R=0, L=1e-9, C_inv=0, node_start=2, node_end=3, tag="L1"),
        LumpedElement(type="capacitor", R=0, L=0, C_inv=1e9, node_start=4, node_end=0, tag="C1"),
        LumpedElement(type="resistor", R=75.0, L=0, C_inv=0, node_start=-1, node_end=5, tag="R2"),
        LumpedElement(type="resistor", R=100.0, L=0, C_inv=0, node_start=6, node_end=-2, tag="R3"),
    ]
    num_nodes = 10

    # Should not raise
    validate_lumped_element_nodes(lumped, num_nodes, "test_antenna")


def test_error_message_includes_element_index():
    """Test that error message includes the element index for debugging."""
    lumped = [
        LumpedElement(type="resistor", R=50.0, L=0, C_inv=0, node_start=0, node_end=1, tag="R1"),
        LumpedElement(type="resistor", R=100.0, L=0, C_inv=0, node_start=2, node_end=3, tag="R2"),
        LumpedElement(
            type="resistor", R=75.0, L=0, C_inv=0, node_start=99, node_end=5, tag="R3_bad"
        ),
    ]
    num_nodes = 10

    with pytest.raises(ValueError) as exc_info:
        validate_lumped_element_nodes(lumped, num_nodes, "my_dipole")

    error_msg = str(exc_info.value)
    assert "my_dipole" in error_msg
    assert "element 2" in error_msg  # Third element (0-indexed)
    assert "R3_bad" in error_msg
    assert "node_start=99" in error_msg


def test_valid_range_message():
    """Test that error message includes the valid range."""
    lumped = [
        LumpedElement(
            type="resistor", R=50.0, L=0, C_inv=0, node_start=100, node_end=5, tag="R_bad"
        ),
    ]
    num_nodes = 42

    with pytest.raises(ValueError) as exc_info:
        validate_lumped_element_nodes(lumped, num_nodes, "test_antenna")

    error_msg = str(exc_info.value)
    # Should show valid range "1 to 42" (1-based indexing)
    assert "1 to 42" in error_msg


def test_integration_with_dipole_mesh():
    """Integration test: Create dipole and validate invalid lumped element nodes."""
    from backend.preprocessor.builders import create_dipole, dipole_to_mesh

    # Create dipole with lumped element having invalid nodes
    element = create_dipole(
        length=1.0,
        segments=10,
        lumped_elements=[
            {"R": 50.0, "L": 0, "C_inv": 0, "node_start": 100, "node_end": 5, "tag": "R_invalid"}
        ],
    )

    # Should raise during mesh generation
    with pytest.raises(ValueError) as exc_info:
        dipole_to_mesh(element)

    error_msg = str(exc_info.value)
    assert "node_start=100" in error_msg
    assert "R_invalid" in error_msg


def test_integration_with_loop_mesh():
    """Integration test: Create loop and validate valid lumped element nodes."""
    from backend.preprocessor.builders import create_loop, loop_to_mesh

    # Create loop with valid lumped elements
    element = create_loop(
        radius=0.1,
        segments=36,
        lumped_elements=[
            {"R": 50.0, "L": 0, "C_inv": 0, "node_start": 0, "node_end": 1, "tag": "R1"},
            {"R": 0, "L": 1e-9, "C_inv": 0, "node_start": -1, "node_end": 10, "tag": "L1"},
        ],
    )

    # Should not raise
    mesh = loop_to_mesh(element)
    assert len(mesh.nodes) > 0


def test_integration_with_rod_mesh():
    """Integration test: Create rod and validate invalid lumped element nodes."""
    from backend.preprocessor.builders import create_rod, rod_to_mesh

    # Create rod with invalid lumped element
    element = create_rod(
        length=0.5,
        segments=20,
        lumped_elements=[
            {"R": 50.0, "L": 0, "C_inv": 0, "node_start": 5, "node_end": 50, "tag": "R_bad"}
        ],
    )

    # Should raise during mesh generation
    with pytest.raises(ValueError) as exc_info:
        rod_to_mesh(element)

    error_msg = str(exc_info.value)
    assert "node_end=50" in error_msg


def test_integration_with_helix_mesh():
    """Integration test: Create helix and validate valid lumped element nodes."""
    from backend.preprocessor.builders import create_helix, helix_to_mesh

    # Create helix with valid lumped elements
    element = create_helix(
        radius=0.05,
        pitch=0.1,
        turns=3,
        segments_per_turn=24,
        lumped_elements=[
            {"R": 50.0, "L": 0, "C_inv": 0, "node_start": 0, "node_end": 10, "tag": "R1"},
            {"R": 0, "L": 0, "C_inv": 1e10, "node_start": 20, "node_end": 0, "tag": "C1"},
        ],
    )

    # Should not raise
    mesh = helix_to_mesh(element)
    assert len(mesh.nodes) > 0
