"""
Tests for AppendedNode model and integration with AntennaElement.

Phase 3: Lumped Element & Port System
"""

import pytest
from pydantic import ValidationError

from backend.common.models.geometry import (
    AntennaElement,
    AppendedNode,
    LumpedElement,
    Source,
)


class TestAppendedNodeModel:
    """Test the AppendedNode Pydantic model."""

    def test_create_appended_node_minimal(self):
        node = AppendedNode(index=-1)
        assert node.index == -1
        assert node.label == ""

    def test_create_appended_node_with_label(self):
        node = AppendedNode(index=-2, label="Matching network node")
        assert node.index == -2
        assert node.label == "Matching network node"

    def test_appended_node_must_have_negative_index(self):
        with pytest.raises(ValidationError, match="negative"):
            AppendedNode(index=1)

    def test_appended_node_zero_index_rejected(self):
        """Index 0 is reserved for GND."""
        with pytest.raises(ValidationError, match="negative"):
            AppendedNode(index=0)

    def test_appended_node_large_negative_index(self):
        node = AppendedNode(index=-100, label="Deep auxiliary")
        assert node.index == -100

    def test_appended_node_serialization(self):
        node = AppendedNode(index=-1, label="Test")
        data = node.model_dump()
        assert data == {"index": -1, "label": "Test"}

    def test_appended_node_deserialization(self):
        node = AppendedNode.model_validate({"index": -3, "label": "From JSON"})
        assert node.index == -3
        assert node.label == "From JSON"


class TestAntennaElementWithAppendedNodes:
    """Test that AntennaElement correctly handles appended_nodes field."""

    def test_element_default_no_appended_nodes(self):
        element = AntennaElement(
            name="Test Dipole",
            type="dipole",
            parameters={"length": 0.5},
        )
        assert element.appended_nodes == []

    def test_element_with_appended_nodes(self):
        element = AntennaElement(
            name="Matched Dipole",
            type="dipole",
            parameters={"length": 0.5},
            appended_nodes=[
                AppendedNode(index=-1, label="Matching node A"),
                AppendedNode(index=-2, label="Matching node B"),
            ],
        )
        assert len(element.appended_nodes) == 2
        assert element.appended_nodes[0].index == -1
        assert element.appended_nodes[1].index == -2

    def test_element_appended_nodes_persist_in_serialization(self):
        element = AntennaElement(
            name="Test",
            type="rod",
            parameters={},
            appended_nodes=[AppendedNode(index=-1, label="Aux")],
        )
        data = element.model_dump()
        assert "appended_nodes" in data
        assert len(data["appended_nodes"]) == 1
        assert data["appended_nodes"][0]["index"] == -1

    def test_element_with_lumped_on_appended_node(self):
        """Lumped elements can reference appended nodes with negative indices."""
        element = AntennaElement(
            name="With load",
            type="dipole",
            parameters={"length": 0.5},
            appended_nodes=[AppendedNode(index=-1, label="Load node")],
            lumped_elements=[
                LumpedElement(
                    type="resistor",
                    R=50.0,
                    node_start=1,
                    node_end=-1,
                    tag="Load resistor",
                )
            ],
        )
        assert element.lumped_elements[0].node_end == -1

    def test_element_with_source_on_appended_node(self):
        """Sources can reference appended nodes."""
        element = AntennaElement(
            name="With source",
            type="custom",
            parameters={},
            appended_nodes=[AppendedNode(index=-1)],
            sources=[
                Source(
                    type="voltage",
                    amplitude=1.0 + 0j,
                    node_start=0,
                    node_end=-1,
                )
            ],
        )
        assert element.sources[0].node_end == -1

    def test_element_appended_nodes_roundtrip(self):
        """Serialize and deserialize preserves appended nodes."""
        original = AntennaElement(
            name="Roundtrip",
            type="loop",
            parameters={"radius": 0.1},
            appended_nodes=[
                AppendedNode(index=-1, label="A"),
                AppendedNode(index=-2, label="B"),
            ],
            lumped_elements=[
                LumpedElement(
                    type="capacitor",
                    C_inv=1e12,
                    node_start=-1,
                    node_end=-2,
                )
            ],
        )
        data = original.model_dump()
        restored = AntennaElement.model_validate(data)
        assert len(restored.appended_nodes) == 2
        assert restored.appended_nodes[0].label == "A"
        assert restored.lumped_elements[0].node_start == -1


class TestAppendedNodeValidation:
    """Test validation rules for appended nodes."""

    def test_duplicate_appended_indices_rejected(self):
        """Two appended nodes with the same index should raise."""
        with pytest.raises(ValidationError, match="[Dd]uplicate"):
            AntennaElement(
                name="Bad",
                type="dipole",
                parameters={},
                appended_nodes=[
                    AppendedNode(index=-1, label="A"),
                    AppendedNode(index=-1, label="B"),
                ],
            )

    def test_appended_nodes_must_be_sequential(self):
        """Indices should be sequential: -1, -2, -3, ... (gaps OK for flexibility)."""
        # Non-sequential but still negative — should work
        element = AntennaElement(
            name="OK",
            type="dipole",
            parameters={},
            appended_nodes=[
                AppendedNode(index=-1),
                AppendedNode(index=-3),  # gap at -2 is OK
            ],
        )
        assert len(element.appended_nodes) == 2
