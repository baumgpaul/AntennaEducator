"""
Example: Creating antennas with lumped elements

This script demonstrates the new lumped element functionality,
showing how to create antennas with matching networks following PEEC conventions.
"""

import io
import sys

# Set UTF-8 encoding for stdout to handle Unicode characters
if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

from backend.common.models import AntennaElement, LumpedElement, Source


def example_1_dipole_with_load():
    """Example 1: Simple dipole with a load resistor."""
    print("=" * 70)
    print("Example 1: Dipole with 50Ω Load Resistor")
    print("=" * 70)

    dipole = AntennaElement(
        name="Loaded Dipole",
        type="dipole",
        parameters={"length": 1.0, "gap": 0.01, "wire_radius": 0.001, "segments": 21},
        source=Source(
            type="voltage",
            amplitude=complex(1.0, 0.0),
            node_start=0,  # Ground
            node_end=1,  # First node of dipole
            tag="1V source",
        ),
        lumped_elements=[
            LumpedElement(
                type="resistor",
                R=50.0,
                L=0.0,
                C_inv=0.0,
                node_start=10,  # Mid-point of dipole
                node_end=11,
                tag="50Ω load",
            )
        ],
    )

    print(f"Antenna: {dipole.name}")
    print(f"Type: {dipole.type}")
    print(
        f"Source: {dipole.source.type} at nodes {dipole.source.node_start}->{dipole.source.node_end}"
    )
    print(f"Lumped elements: {len(dipole.lumped_elements)}")
    for i, elem in enumerate(dipole.lumped_elements):
        print(f"  [{i}] {elem.tag}: {elem.impedance} @ nodes {elem.node_start}->{elem.node_end}")
    print()


def example_2_antenna_with_matching_network():
    """Example 2: Antenna with L-C matching network."""
    print("=" * 70)
    print("Example 2: Loop Antenna with L-C Matching Network")
    print("=" * 70)

    loop = AntennaElement(
        name="Loop with Matching",
        type="loop",
        parameters={"radius": 0.1, "wire_radius": 0.001, "segments": 36},
        source=Source(
            type="voltage", amplitude=complex(1.0, 0.0), node_start=0, node_end=1, tag="Feed"
        ),
        lumped_elements=[
            # Series inductor for matching
            LumpedElement(
                type="inductor",
                R=0.0,
                L=10e-9,  # 10 nH
                C_inv=0.0,
                node_start=1,
                node_end=-1,  # Appended node
                tag="Matching inductor",
            ),
            # Parallel capacitor
            LumpedElement(
                type="capacitor",
                R=0.0,
                L=0.0,
                C_inv=1.0 / 1e-12,  # 1 pF
                node_start=-1,
                node_end=0,  # Back to ground
                tag="Matching capacitor",
            ),
        ],
    )

    print(f"Antenna: {loop.name}")
    print(f"Type: {loop.type}")
    print(f"Source: {loop.source.tag}")
    print(f"Matching network ({len(loop.lumped_elements)} elements):")
    for i, elem in enumerate(loop.lumped_elements):
        print(f"  [{i}] {elem.tag}: {elem.impedance}")
        print(f"      Nodes: {elem.node_start} -> {elem.node_end}")
    print()


def example_3_calibration_coil():
    """Example 3: Calibration coil matching the reference createCalCoil structure."""
    print("=" * 70)
    print("Example 3: Calibration Coil (PEEC-style)")
    print("=" * 70)

    # Parameters matching the reference example
    R_s = 10.0
    R_p = 100.0
    C_p = 0.1852e-9  # 0.1852 nF
    feedpoint1 = 1
    feedpoint2 = 5

    cal_coil = AntennaElement(
        name="Calibration Coil",
        type="custom",
        parameters={"description": "Complex coil structure with matching network"},
        source=Source(
            type="voltage",
            amplitude=complex(1.0, 0.0),
            node_start=0,
            node_end=feedpoint1,
            tag="Excitation",
        ),
        lumped_elements=[
            # R_series (reference: Load(1))
            LumpedElement(
                type="resistor",
                R=R_s,
                L=0.0,
                C_inv=0.0,
                node_start=feedpoint2,
                node_end=-3,
                tag="R5-8",
            ),
            # R_parallel (reference: Load(2))
            LumpedElement(
                type="resistor", R=R_p, L=0.0, C_inv=0.0, node_start=-3, node_end=-2, tag="R1-4"
            ),
            # C_parallel (reference: Load(3))
            LumpedElement(
                type="capacitor",
                R=0.0,
                L=0.0,
                C_inv=1.0 / C_p,
                node_start=feedpoint1,
                node_end=-2,
                tag="C12 VC1AB",
            ),
        ],
    )

    print(f"Antenna: {cal_coil.name}")
    print(f"Type: {cal_coil.type}")
    print(f"Parameters: {cal_coil.parameters['description']}")
    print(f"\nCircuit Network:")
    print(f"  Source: {cal_coil.source.tag} @ nodes 0 -> {feedpoint1}")
    print(f"\n  Lumped Elements ({len(cal_coil.lumped_elements)}):")
    for i, elem in enumerate(cal_coil.lumped_elements):
        print(f"    [{i+1}] {elem.tag}:")
        print(f"        Type: {elem.type}")
        print(f"        Impedance: {elem.impedance}")
        print(f"        Nodes: {elem.node_start} -> {elem.node_end}")
    print()


def example_4_multiple_antennas():
    """Example 4: Multiple antennas with different circuit elements."""
    print("=" * 70)
    print("Example 4: Array with Multiple Antennas")
    print("=" * 70)

    # Driven element with source
    driven = AntennaElement(
        name="Driven Element",
        type="dipole",
        parameters={"length": 1.0, "gap": 0.01},
        source=Source(
            type="voltage",
            amplitude=complex(1.0, 0.0),
            node_start=0,
            node_end=1,
            series_R=50.0,  # Source with internal impedance
            tag="50Ω source",
        ),
    )

    # Director with capacitive loading
    director = AntennaElement(
        name="Director",
        type="dipole",
        parameters={"length": 0.95},
        lumped_elements=[
            LumpedElement(
                type="capacitor",
                R=0.0,
                L=0.0,
                C_inv=1e12,  # 1 pF
                node_start=10,
                node_end=11,
                tag="Capacitive loading",
            )
        ],
    )

    # Reflector with inductive loading
    reflector = AntennaElement(
        name="Reflector",
        type="dipole",
        parameters={"length": 1.05},
        lumped_elements=[
            LumpedElement(
                type="inductor",
                R=0.0,
                L=10e-9,  # 10 nH
                C_inv=0.0,
                node_start=10,
                node_end=11,
                tag="Inductive loading",
            )
        ],
    )

    antennas = [driven, director, reflector]

    print("Antenna Array Configuration:")
    for i, ant in enumerate(antennas):
        print(f"\n  [{i+1}] {ant.name} ({ant.type})")
        if ant.source:
            print(f"      Source: {ant.source.tag}")
            if ant.source.series_R > 0:
                print(f"      Series R: {ant.source.series_R}Ω")
        if ant.lumped_elements:
            print(f"      Loads: {ant.lumped_elements[0].tag} ({ant.lumped_elements[0].impedance})")
        else:
            print(f"      Loads: None (passive)")

    print("\n  Note: Each antenna maintains its own circuit definition.")
    print("  The solver will merge them following the standard PEEC multi-antenna pattern.")
    print()


if __name__ == "__main__":
    print("\n" + "=" * 70)
    print("LUMPED ELEMENT EXAMPLES - PEEC-Compatible Circuit Definitions")
    print("=" * 70 + "\n")

    example_1_dipole_with_load()
    example_2_antenna_with_matching_network()
    example_3_calibration_coil()
    example_4_multiple_antennas()

    print("=" * 70)
    print("All examples completed successfully!")
    print("=" * 70)
