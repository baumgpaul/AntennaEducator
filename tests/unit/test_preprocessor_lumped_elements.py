"""
Tests for preprocessor API with lumped elements.

Verifies that lumped elements can be specified via API requests
and are properly stored in AntennaElement objects.
"""

import pytest

from backend.common.models import LumpedElement
from backend.preprocessor.builders import create_dipole, create_loop, create_rod


class TestDipoleWithLumpedElements:
    """Test creating dipoles with lumped elements via builder."""

    def test_dipole_with_single_lumped_element(self):
        """Test creating a dipole with one lumped element."""
        lumped_elements = [
            {
                "type": "resistor",
                "R": 50.0,
                "L": 0.0,
                "C_inv": 0.0,
                "node_start": 11,
                "node_end": 12,
                "tag": "Load resistor",
            }
        ]

        element = create_dipole(length=1.0, segments=21, lumped_elements=lumped_elements)

        assert len(element.lumped_elements) == 1
        assert element.lumped_elements[0].R == 50.0
        assert element.lumped_elements[0].type == "resistor"
        assert element.lumped_elements[0].tag == "Load resistor"

    def test_dipole_with_multiple_lumped_elements(self):
        """Test creating a dipole with multiple lumped elements (matching network)."""
        lumped_elements = [
            {
                "type": "resistor",
                "R": 10.0,
                "L": 0.0,
                "C_inv": 0.0,
                "node_start": 6,
                "node_end": 7,
                "tag": "Series R",
            },
            {
                "type": "capacitor",
                "R": 0.0,
                "L": 0.0,
                "C_inv": 1e12,
                "node_start": 7,
                "node_end": 0,
                "tag": "Matching cap",
            },
        ]

        element = create_dipole(length=1.0, segments=21, lumped_elements=lumped_elements)

        assert len(element.lumped_elements) == 2
        assert element.lumped_elements[0].R == 10.0
        assert element.lumped_elements[1].C_inv == 1e12

    def test_dipole_with_source_and_lumped_elements(self):
        """Test dipole with both source and lumped elements."""
        source = {
            "type": "voltage",
            "amplitude": {"real": 1.0, "imag": 0.0},
            "series_R": 50.0,
            "tag": "50Ω source",
        }

        lumped_elements = [
            {
                "type": "capacitor",
                "R": 0.0,
                "L": 0.0,
                "C_inv": 1e12,
                "node_start": 11,
                "node_end": 0,
                "tag": "Load cap",
            }
        ]

        element = create_dipole(
            length=1.0, segments=21, source=source, lumped_elements=lumped_elements
        )

        assert element.sources[0] is not None
        assert element.sources[0].series_R == 50.0
        assert element.sources[0].tag == "50Ω source"
        assert len(element.lumped_elements) == 1
        assert element.lumped_elements[0].C_inv == 1e12

    def test_dipole_without_lumped_elements(self):
        """Test that dipole without lumped elements still works (backward compatible)."""
        element = create_dipole(length=1.0, segments=21)

        assert len(element.lumped_elements) == 0
        assert isinstance(element.lumped_elements, list)


class TestLoopWithLumpedElements:
    """Test creating loops with lumped elements via builder."""

    def test_loop_with_lumped_element(self):
        """Test creating a loop with a lumped element."""
        lumped_elements = [
            {
                "type": "resistor",
                "R": 100.0,
                "L": 0.0,
                "C_inv": 0.0,
                "node_start": 19,
                "node_end": 0,
                "tag": "Load",
            }
        ]

        element = create_loop(radius=0.1, segments=36, lumped_elements=lumped_elements)

        assert len(element.lumped_elements) == 1
        assert element.lumped_elements[0].R == 100.0
        assert element.lumped_elements[0].node_end == 0  # Ground

    def test_loop_with_source_and_lumped_elements(self):
        """Test loop with both source and lumped elements."""
        source = {
            "type": "voltage",
            "amplitude": {"real": 1.0, "imag": 0.0},
            "series_L": 1e-9,
            "tag": "Inductive source",
        }

        lumped_elements = [
            {
                "type": "capacitor",
                "R": 0.0,
                "L": 0.0,
                "C_inv": 1e12,
                "node_start": 21,
                "node_end": 22,
                "tag": "Tuning cap",
            }
        ]

        element = create_loop(
            radius=0.1, segments=36, source=source, lumped_elements=lumped_elements
        )

        assert element.sources[0].series_L == 1e-9
        assert len(element.lumped_elements) == 1


class TestRodWithLumpedElements:
    """Test creating rods with lumped elements via builder."""

    def test_rod_with_lumped_element(self):
        """Test creating a rod with a lumped element."""
        lumped_elements = [
            {
                "type": "inductor",
                "R": 0.0,
                "L": 1e-9,
                "C_inv": 0.0,
                "node_start": 11,
                "node_end": 12,
                "tag": "Loading coil",
            }
        ]

        element = create_rod(length=0.5, segments=21, lumped_elements=lumped_elements)

        assert len(element.lumped_elements) == 1
        assert element.lumped_elements[0].L == 1e-9
        assert element.lumped_elements[0].tag == "Loading coil"


class TestEnhancedSourceInBuilders:
    """Test enhanced Source model with series impedance in builders."""

    def test_dipole_with_enhanced_source(self):
        """Test dipole with source having series impedance."""
        source = {
            "type": "voltage",
            "amplitude": {"real": 1.0, "imag": 0.5},
            "series_R": 50.0,
            "series_L": 1e-9,
            "series_C_inv": 1e12,
            "tag": "Complex source",
        }

        element = create_dipole(length=1.0, segments=21, source=source)

        assert element.sources[0] is not None
        assert element.sources[0].series_R == 50.0
        assert element.sources[0].series_L == 1e-9
        assert element.sources[0].series_C_inv == 1e12
        assert element.sources[0].tag == "Complex source"

    def test_loop_with_basic_source(self):
        """Test that basic source (without series impedance) still works."""
        source = {"type": "voltage", "amplitude": {"real": 1.0, "imag": 0.0}}

        element = create_loop(radius=0.1, segments=36, source=source)

        assert element.sources[0] is not None
        assert element.sources[0].series_R == 0.0
        assert element.sources[0].series_L == 0.0
        assert element.sources[0].series_C_inv == 0.0
        assert element.sources[0].tag == ""


class TestLumpedElementValidation:
    """Test validation of lumped elements in builders."""

    def test_lumped_element_missing_required_fields(self):
        """Test that missing required fields raise appropriate errors."""
        # Missing node_start and node_end should cause KeyError
        lumped_elements = [
            {
                "type": "resistor",
                "R": 50.0,
                "L": 0.0,
                "C_inv": 0.0,
                # Missing node_start, node_end
            }
        ]

        with pytest.raises(KeyError):
            create_dipole(length=1.0, segments=21, lumped_elements=lumped_elements)

    def test_lumped_element_negative_values_caught(self):
        """Test that negative R, L, C_inv values are caught by Pydantic."""
        from pydantic import ValidationError

        # This should raise ValidationError from LumpedElement model
        with pytest.raises(ValidationError):
            LumpedElement(
                type="resistor", R=-50.0, L=0.0, C_inv=0.0, node_start=1, node_end=2  # Invalid
            )


class TestBackwardCompatibility:
    """Test that all changes are backward compatible."""

    def test_dipole_without_new_parameters(self):
        """Test creating dipole without new lumped_elements parameter."""
        element = create_dipole(
            length=1.0,
            center_position=(0, 0, 0),
            orientation=(0, 0, 1),
            wire_radius=0.001,
            gap=0.01,
            segments=21,
            source=None,
            name="Test Dipole",
        )

        assert element.type == "dipole"
        assert len(element.lumped_elements) == 0

    def test_source_without_series_impedance(self):
        """Test creating source without series impedance fields."""
        source = {"type": "voltage", "amplitude": {"real": 1.0, "imag": 0.0}}

        element = create_dipole(length=1.0, segments=21, source=source)

        # Should default to 0.0 for series impedance
        assert element.sources[0].series_R == 0.0
        assert element.sources[0].series_L == 0.0
        assert element.sources[0].series_C_inv == 0.0
