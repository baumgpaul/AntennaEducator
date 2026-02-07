"""
Unit tests for lumped element models.

Tests the new LumpedElement model and enhanced Source/AntennaElement models
to ensure they correctly support standard PEEC circuit definitions.
"""

import pytest
from backend.common.models import LumpedElement, Source, AntennaElement


class TestLumpedElement:
    """Test LumpedElement model."""
    
    def test_create_resistor(self):
        """Test creating a simple resistor."""
        resistor = LumpedElement(
            type="resistor",
            R=50.0,
            L=0.0,
            C_inv=0.0,
            node_start=1,
            node_end=2,
            tag="Load resistor"
        )
        
        assert resistor.type == "resistor"
        assert resistor.R == 50.0
        assert resistor.L == 0.0
        assert resistor.C_inv == 0.0
        assert resistor.node_start == 1
        assert resistor.node_end == 2
        assert resistor.tag == "Load resistor"
    
    def test_create_capacitor(self):
        """Test creating a capacitor using inverse capacitance."""
        C = 1e-12  # 1 pF
        C_inv = 1.0 / C
        
        capacitor = LumpedElement(
            type="capacitor",
            R=0.0,
            L=0.0,
            C_inv=C_inv,
            node_start=1,
            node_end=0,  # Connected to ground
            tag="Matching capacitor"
        )
        
        assert capacitor.type == "capacitor"
        assert capacitor.C_inv == C_inv
        assert capacitor.node_end == 0  # Ground connection
    
    def test_create_inductor(self):
        """Test creating an inductor."""
        inductor = LumpedElement(
            type="inductor",
            R=0.0,
            L=1e-9,  # 1 nH
            C_inv=0.0,
            node_start=5,
            node_end=6,
            tag="Series inductor"
        )
        
        assert inductor.type == "inductor"
        assert inductor.L == 1e-9
    
    def test_create_rlc_combination(self):
        """Test creating an RLC combination element."""
        rlc = LumpedElement(
            type="rlc",
            R=50.0,
            L=1e-9,
            C_inv=1.0 / 1e-12,
            node_start=1,
            node_end=-1,  # Negative for appended node
            tag="RLC network"
        )
        
        assert rlc.type == "rlc"
        assert rlc.R > 0
        assert rlc.L > 0
        assert rlc.C_inv > 0
        assert rlc.node_end == -1  # Appended node
    
    def test_impedance_property(self):
        """Test the impedance string representation."""
        rlc = LumpedElement(
            type="rlc",
            R=50.0,
            L=1e-9,
            C_inv=1e12,
            node_start=1,
            node_end=2
        )
        
        impedance_str = rlc.impedance
        assert "R=" in impedance_str
        assert "L=" in impedance_str
        assert "C=" in impedance_str
    
    def test_validation_non_negative(self):
        """Test that R, L, C_inv must be non-negative."""
        with pytest.raises(ValueError):
            LumpedElement(
                type="resistor",
                R=-10.0,  # Invalid negative resistance
                L=0.0,
                C_inv=0.0,
                node_start=1,
                node_end=2
            )


class TestEnhancedSource:
    """Test enhanced Source model with series impedance."""
    
    def test_voltage_source_basic(self):
        """Test basic voltage source (backward compatible)."""
        source = Source(
            type="voltage",
            amplitude=complex(1.0, 0.0),
            node_start=0,
            node_end=1
        )
        
        assert source.type == "voltage"
        assert source.amplitude == complex(1.0, 0.0)
        assert source.series_R == 0.0  # Default values
        assert source.series_L == 0.0
        assert source.series_C_inv == 0.0
    
    def test_voltage_source_with_series_impedance(self):
        """Test voltage source with series impedance (matches PEEC convention)."""
        source = Source(
            type="voltage",
            amplitude=complex(1.0, 0.0),
            node_start=0,
            node_end=1,
            series_R=50.0,
            series_L=1e-9,
            series_C_inv=0.0,
            tag="50Ω source"
        )
        
        assert source.series_R == 50.0
        assert source.series_L == 1e-9
        assert source.tag == "50Ω source"
    
    def test_current_source(self):
        """Test current source (no series impedance needed)."""
        source = Source(
            type="current",
            amplitude=complex(0.01, 0.0),
            node_start=None,
            node_end=1,
            tag="1A current source"
        )
        
        assert source.type == "current"
        assert source.amplitude == complex(0.01, 0.0)


class TestAntennaElementWithLumpedElements:
    """Test AntennaElement with lumped elements."""
    
    def test_antenna_element_without_lumped(self):
        """Test that AntennaElement works without lumped elements (backward compatible)."""
        element = AntennaElement(
            name="Simple dipole",
            type="dipole",
            parameters={"length": 1.0, "gap": 0.01},
            sources=[Source(
                type="voltage",
                amplitude=complex(1.0, 0.0),
                node_start=0,
                node_end=1
            )]
        )
        
        assert len(element.lumped_elements) == 0
        assert element.sources[0] is not None
    
    def test_antenna_element_with_single_lumped(self):
        """Test antenna element with a single lumped element."""
        element = AntennaElement(
            name="Loaded dipole",
            type="dipole",
            parameters={"length": 1.0, "gap": 0.01},
            sources=[Source(
                type="voltage",
                amplitude=complex(1.0, 0.0),
                node_start=0,
                node_end=1
            )],
            lumped_elements=[
                LumpedElement(
                    type="resistor",
                    R=50.0,
                    L=0.0,
                    C_inv=0.0,
                    node_start=5,
                    node_end=6,
                    tag="Load"
                )
            ]
        )
        
        assert len(element.lumped_elements) == 1
        assert element.lumped_elements[0].R == 50.0
    
    def test_antenna_element_with_matching_network(self):
        """Test antenna element with multiple lumped elements (matching network)."""
        # Example: Calibration coil with matching network (reference createCalCoil)
        element = AntennaElement(
            name="Cal coil with matching",
            type="custom",
            parameters={"custom_geometry": "coil"},
            sources=[Source(
                type="voltage",
                amplitude=complex(1.0, 0.0),
                node_start=0,
                node_end=1
            )],
            lumped_elements=[
                LumpedElement(
                    type="resistor",
                    R=10.0,
                    L=0.0,
                    C_inv=0.0,
                    node_start=2,
                    node_end=-3,  # Appended node
                    tag="R_series"
                ),
                LumpedElement(
                    type="resistor",
                    R=100.0,
                    L=0.0,
                    C_inv=0.0,
                    node_start=-3,
                    node_end=-2,  # Another appended node
                    tag="R_parallel"
                ),
                LumpedElement(
                    type="capacitor",
                    R=0.0,
                    L=0.0,
                    C_inv=1.0 / 1e-12,  # 1 pF
                    node_start=1,
                    node_end=-2,
                    tag="C_matching"
                )
            ]
        )
        
        assert len(element.lumped_elements) == 3
        assert element.lumped_elements[0].tag == "R_series"
        assert element.lumped_elements[1].tag == "R_parallel"
        assert element.lumped_elements[2].tag == "C_matching"
        
        # Verify node numbering includes negative (appended) nodes
        assert element.lumped_elements[0].node_end == -3
        assert element.lumped_elements[1].node_start == -3
        assert element.lumped_elements[1].node_end == -2
    
    def test_multiple_elements_separate_circuits(self):
        """Test that multiple antenna elements can have independent circuits."""
        # Dipole 1 with load
        dipole1 = AntennaElement(
            name="Dipole 1",
            type="dipole",
            parameters={"length": 1.0},
            sources=[Source(
                type="voltage",
                amplitude=complex(1.0, 0.0),
                node_start=0,
                node_end=1
            )],
            lumped_elements=[
                LumpedElement(
                    type="resistor",
                    R=50.0,
                    L=0.0,
                    C_inv=0.0,
                    node_start=10,
                    node_end=11,
                    tag="Load 50Ω"
                )
            ]
        )
        
        # Dipole 2 with different load
        dipole2 = AntennaElement(
            name="Dipole 2",
            type="dipole",
            parameters={"length": 1.5},
            sources=[Source(
                type="voltage",
                amplitude=complex(1.0, 0.0),
                node_start=0,
                node_end=1
            )],
            lumped_elements=[
                LumpedElement(
                    type="capacitor",
                    R=0.0,
                    L=0.0,
                    C_inv=1e12,
                    node_start=10,
                    node_end=0,
                    tag="Matching cap"
                )
            ]
        )
        
        # Verify they are independent
        assert dipole1.name != dipole2.name
        assert len(dipole1.lumped_elements) == 1
        assert len(dipole2.lumped_elements) == 1
        assert dipole1.lumped_elements[0].type == "resistor"
        assert dipole2.lumped_elements[0].type == "capacitor"


class TestPEECCompatibility:
    """Test that models match reference PEEC structure examples."""
    
    def test_peec_dipole_example(self):
        """Test equivalent to reference createDipole voltage source."""
        # Reference: Antenna.Circuit.Voltage_Source(1).node_start=0;
        #         Antenna.Circuit.Voltage_Source(1).node_end=1;
        #         Antenna.Circuit.Voltage_Source(1).value=voltage_excitation;
        #         Antenna.Circuit.Voltage_Source(1).L=0;
        #         Antenna.Circuit.Voltage_Source(1).R=0;
        #         Antenna.Circuit.Voltage_Source(1).C_inv=0;
        
        dipole = AntennaElement(
            name="standard dipole",
            type="dipole",
            parameters={"length": 1.0, "gap": 0.01},
            sources=[Source(
                type="voltage",
                amplitude=complex(1.0, 0.0),
                node_start=0,
                node_end=1,
                series_R=0.0,
                series_L=0.0,
                series_C_inv=0.0,
                tag="excitation"
            )]
        )
        
        assert dipole.sources[0].node_start == 0
        assert dipole.sources[0].node_end == 1
        assert dipole.sources[0].series_R == 0.0
    
    def test_peec_calcoil_load_example(self):
        """Test equivalent to reference createCalCoil Load structure."""
        # Reference: Antenna.Circuit.Load(1).R=R_s;
        #         Antenna.Circuit.Load(1).L=0;
        #         Antenna.Circuit.Load(1).C_inv=0;
        #         Antenna.Circuit.Load(1).node_start=feedpoint2;
        #         Antenna.Circuit.Load(1).node_end=-3;
        #         Antenna.Circuit.Load(1).tag='R5-8';
        
        R_s = 10.0
        feedpoint2 = 5
        
        cal_coil = AntennaElement(
            name="standard cal coil",
            type="custom",
            parameters={"custom": "cal_coil"},
            lumped_elements=[
                LumpedElement(
                    type="resistor",
                    R=R_s,
                    L=0.0,
                    C_inv=0.0,
                    node_start=feedpoint2,
                    node_end=-3,
                    tag="R5-8"
                )
            ]
        )
        
        load = cal_coil.lumped_elements[0]
        assert load.R == R_s
        assert load.node_start == feedpoint2
        assert load.node_end == -3
        assert load.tag == "R5-8"
