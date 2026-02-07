"""
Additional edge case tests for lumped elements.

Covers validation, edge cases, and serialization that weren't in the original test suite.
"""

import json

import pytest

from backend.common.models import AntennaElement, LumpedElement, Source


class TestLumpedElementEdgeCases:
    """Edge case tests for LumpedElement validation."""

    def test_negative_inductance_raises_error(self):
        """Test that negative inductance is rejected."""
        with pytest.raises(ValueError):
            LumpedElement(
                type="inductor",
                R=0.0,
                L=-1e-9,  # Invalid negative
                C_inv=0.0,
                node_start=1,
                node_end=2,
            )

    def test_negative_c_inv_raises_error(self):
        """Test that negative inverse capacitance is rejected."""
        with pytest.raises(ValueError):
            LumpedElement(
                type="capacitor",
                R=0.0,
                L=0.0,
                C_inv=-1e12,  # Invalid negative
                node_start=1,
                node_end=2,
            )

    def test_short_circuit_nodes(self):
        """Test that lumped element can connect node to itself (valid, creates self-impedance)."""
        # This is actually valid in circuit theory (node impedance to ground)
        element = LumpedElement(
            type="resistor",
            R=50.0,
            L=0.0,
            C_inv=0.0,
            node_start=1,
            node_end=1,  # Same node - valid for self-impedance
            tag="Node impedance",
        )
        assert element.node_start == element.node_end

    def test_ground_connection(self):
        """Test lumped element connected to ground (node 0)."""
        element = LumpedElement(
            type="capacitor",
            R=0.0,
            L=0.0,
            C_inv=1e12,
            node_start=5,
            node_end=0,  # Ground
            tag="Cap to ground",
        )
        assert element.node_end == 0

    def test_negative_node_indices(self):
        """Test appended/auxiliary nodes with negative indices."""
        element = LumpedElement(
            type="rlc",
            R=10.0,
            L=1e-9,
            C_inv=1e12,
            node_start=-1,  # Appended node
            node_end=-2,  # Another appended node
            tag="Between auxiliary nodes",
        )
        assert element.node_start < 0
        assert element.node_end < 0

    def test_impedance_all_zeros(self):
        """Test impedance property with all zeros (short circuit)."""
        element = LumpedElement(
            type="resistor", R=0.0, L=0.0, C_inv=0.0, node_start=1, node_end=2, tag="Short"
        )
        assert element.impedance == "short"

    def test_impedance_very_small_values(self):
        """Test impedance formatting with very small values."""
        element = LumpedElement(
            type="inductor", R=0.0, L=1e-15, C_inv=0.0, node_start=1, node_end=2  # Very small
        )
        impedance = element.impedance
        assert "L=" in impedance
        # Should use scientific notation
        assert "e" in impedance.lower() or "1e-15" in impedance

    def test_impedance_very_large_values(self):
        """Test impedance formatting with very large values."""
        element = LumpedElement(
            type="resistor", R=1e9, L=0.0, C_inv=0.0, node_start=1, node_end=2  # 1 GΩ
        )
        impedance = element.impedance
        assert "R=" in impedance


class TestLumpedElementSerialization:
    """Test JSON serialization and deserialization."""

    def test_lumped_element_to_json(self):
        """Test serializing LumpedElement to JSON."""
        element = LumpedElement(
            type="rlc", R=50.0, L=1e-9, C_inv=1e12, node_start=1, node_end=2, tag="Test RLC"
        )

        # Serialize
        json_str = element.model_dump_json()
        data = json.loads(json_str)

        assert data["type"] == "rlc"
        assert data["R"] == 50.0
        assert data["L"] == 1e-9
        assert data["C_inv"] == 1e12
        assert data["node_start"] == 1
        assert data["node_end"] == 2
        assert data["tag"] == "Test RLC"

    def test_lumped_element_from_json(self):
        """Test deserializing LumpedElement from JSON."""
        json_data = {
            "type": "capacitor",
            "R": 0.0,
            "L": 0.0,
            "C_inv": 1e12,
            "node_start": 3,
            "node_end": 0,
            "tag": "Matching cap",
        }

        element = LumpedElement(**json_data)

        assert element.type == "capacitor"
        assert element.C_inv == 1e12
        assert element.node_start == 3
        assert element.node_end == 0

    def test_round_trip_serialization(self):
        """Test round-trip: model → JSON → model."""
        original = LumpedElement(
            type="inductor",
            R=1.5,
            L=2.3e-9,
            C_inv=4.7e12,
            node_start=-1,
            node_end=5,
            tag="Complex element",
        )

        # Serialize and deserialize
        json_str = original.model_dump_json()
        reconstructed = LumpedElement.model_validate_json(json_str)

        # Compare
        assert reconstructed.type == original.type
        assert reconstructed.R == original.R
        assert reconstructed.L == original.L
        assert reconstructed.C_inv == original.C_inv
        assert reconstructed.node_start == original.node_start
        assert reconstructed.node_end == original.node_end
        assert reconstructed.tag == original.tag

    def test_antenna_element_with_lumped_serialization(self):
        """Test serializing AntennaElement with lumped elements."""
        element = AntennaElement(
            name="Test antenna",
            type="dipole",
            parameters={"length": 1.0},
            lumped_elements=[
                LumpedElement(type="resistor", R=50.0, L=0.0, C_inv=0.0, node_start=1, node_end=2)
            ],
        )

        # Serialize
        json_str = element.model_dump_json()
        data = json.loads(json_str)

        assert "lumped_elements" in data
        assert len(data["lumped_elements"]) == 1
        assert data["lumped_elements"][0]["R"] == 50.0


class TestSourceEnhancedEdgeCases:
    """Edge cases for enhanced Source model."""

    def test_source_with_all_series_impedance_components(self):
        """Test source with full series RLC."""
        source = Source(
            type="voltage",
            amplitude=complex(1.0, 0.0),
            node_start=0,
            node_end=1,
            series_R=50.0,
            series_L=1e-9,
            series_C_inv=1e12,
            tag="Full RLC source",
        )

        assert source.series_R > 0
        assert source.series_L > 0
        assert source.series_C_inv > 0

    def test_source_negative_series_impedance_raises_error(self):
        """Test that negative series impedance components are rejected."""
        with pytest.raises(ValueError):
            Source(
                type="voltage",
                amplitude=complex(1.0, 0.0),
                node_start=0,
                node_end=1,
                series_R=-50.0,  # Invalid
            )

    def test_source_serialization_with_complex_amplitude(self):
        """Test Source serialization with complex amplitude."""
        source = Source(type="voltage", amplitude=complex(1.0, 0.5), node_start=0, node_end=1)

        # Serialize
        json_str = source.model_dump_json()
        data = json.loads(json_str)

        # Pydantic should handle complex number serialization
        assert "amplitude" in data
        # Complex might be serialized as dict or string depending on json_encoders
        assert data["amplitude"]["real"] == 1.0
        assert data["amplitude"]["imag"] == 0.5


class TestIntegrationScenarios:
    """Integration tests combining multiple features."""

    def test_multiple_antennas_with_different_lumped_configs(self):
        """Test creating multiple antennas with different lumped element configurations."""
        # Antenna 1: Resistive load
        antenna1 = AntennaElement(
            name="Loaded dipole",
            type="dipole",
            parameters={"length": 1.0},
            source=Source(type="voltage", amplitude=1.0 + 0j, node_start=0, node_end=1),
            lumped_elements=[
                LumpedElement(type="resistor", R=50.0, L=0.0, C_inv=0.0, node_start=10, node_end=11)
            ],
        )

        # Antenna 2: Capacitive matching
        antenna2 = AntennaElement(
            name="Matched dipole",
            type="dipole",
            parameters={"length": 1.5},
            source=Source(type="voltage", amplitude=1.0 + 0j, node_start=0, node_end=1),
            lumped_elements=[
                LumpedElement(type="capacitor", R=0.0, L=0.0, C_inv=1e12, node_start=10, node_end=0)
            ],
        )

        # Antenna 3: No lumped elements (passive)
        antenna3 = AntennaElement(
            name="Passive reflector",
            type="dipole",
            parameters={"length": 1.2},
            lumped_elements=[],  # Empty
        )

        # Verify independence
        assert len(antenna1.lumped_elements) == 1
        assert len(antenna2.lumped_elements) == 1
        assert len(antenna3.lumped_elements) == 0
        assert antenna1.lumped_elements[0].type != antenna2.lumped_elements[0].type

    def test_empty_lumped_elements_list(self):
        """Test that empty lumped elements list is valid."""
        element = AntennaElement(
            name="Simple antenna",
            type="rod",
            parameters={"length": 0.5},
            lumped_elements=[],  # Explicitly empty
        )

        assert isinstance(element.lumped_elements, list)
        assert len(element.lumped_elements) == 0
