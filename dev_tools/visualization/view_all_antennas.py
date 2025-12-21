"""Visualize all antenna types: dipole, loop, rod, and helix."""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from backend.preprocessor.builders import (
    create_dipole, dipole_to_mesh,
    create_loop, loop_to_mesh,
    create_rod, rod_to_mesh,
    create_helix, helix_to_mesh,
)
from dev_tools.visualization.visualization import visualize_mesh


def visualize_dipole():
    """Create and visualize a dipole antenna."""
    print("\n" + "="*70)
    print("DIPOLE ANTENNA - Half-wave dipole with center feed")
    print("="*70)
    
    element = create_dipole(
        length=1.0,
        center_position=(0.0, 0.0, 0.0),
        orientation=(0.0, 0.0, 1.0),
        wire_radius=0.001,
        gap=0.01,
        segments=11,
        source={"type": "voltage", "amplitude": {"real": 1.0, "imag": 0.0}},
        name="Dipole 1m"
    )
    
    mesh = dipole_to_mesh(element)
    
    visualize_mesh(mesh, element, console=True, plot=True)


def visualize_loop():
    """Create and visualize a loop antenna with gap."""
    print("\n" + "="*70)
    print("LOOP ANTENNA - Circular loop with feed gap")
    print("="*70)
    
    element = create_loop(
        radius=0.15,
        center_position=(0.0, 0.0, 0.0),
        normal_vector=(0.0, 0.0, 1.0),
        wire_radius=0.002,
        gap=0.01,  # 1cm gap at feed point
        segments=36,
        source={"type": "voltage", "amplitude": {"real": 1.0, "imag": 0.0}},
        name="Loop 0.15m radius with gap"
    )
    
    mesh = loop_to_mesh(element)
    
    visualize_mesh(mesh, element, console=True, plot=True)


def visualize_rod():
    """Create and visualize a rod (monopole) antenna."""
    print("\n" + "="*70)
    print("ROD ANTENNA - Monopole extending from ground plane (no source)")
    print("="*70)
    
    element = create_rod(
        length=0.5,
        base_position=(0.0, 0.0, 0.0),
        orientation=(0.0, 0.0, 1.0),
        wire_radius=0.0015,
        segments=15,
        source=None,  # No source
        name="Rod 0.5m"
    )
    
    mesh = rod_to_mesh(element)
    
    visualize_mesh(mesh, element, console=True, plot=True)


def visualize_helix():
    """Create and visualize a bifilar helix antenna (two helices 180° apart)."""
    print("\n" + "="*70)
    print("BIFILAR HELIX ANTENNA - Two spirals 180° apart for circular polarization")
    print("="*70)
    
    # Create first helix starting at origin with angle 0° (no source on individual helix)
    element1 = create_helix(
        radius=0.05,
        pitch=0.1,
        turns=5.0,
        start_position=(0.0, 0.0, 0.0),  # Both helices start at origin
        axis=(0.0, 0.0, 1.0),
        wire_radius=0.001,
        segments_per_turn=24,
        source=None,  # No individual source
        name="Helix 1"
    )
    
    # Create second helix at same origin, will be rotated 180° around Z-axis
    element2 = create_helix(
        radius=0.05,
        pitch=0.1,
        turns=5.0,
        start_position=(0.0, 0.0, 0.0),  # Same origin position
        axis=(0.0, 0.0, 1.0),
        wire_radius=0.001,
        segments_per_turn=24,
        source=None,  # No individual source
        name="Helix 2"
    )
    
    # Generate meshes
    import numpy as np
    from backend.common.models.geometry import Mesh
    
    mesh1 = helix_to_mesh(element1)
    mesh2_unrotated = helix_to_mesh(element2)
    
    # Apply 180° rotation around Z-axis to second helix
    rotation_angle = np.pi  # 180 degrees
    cos_a = np.cos(rotation_angle)
    sin_a = np.sin(rotation_angle)
    
    rotated_nodes = []
    for node in mesh2_unrotated.nodes:
        x, y, z = node
        # Rotation matrix around Z-axis: [cos -sin; sin cos]
        x_rot = cos_a * x - sin_a * y
        y_rot = sin_a * x + cos_a * y
        rotated_nodes.append([x_rot, y_rot, z])
    
    mesh2 = Mesh(
        nodes=rotated_nodes,
        edges=mesh2_unrotated.edges,
        radii=mesh2_unrotated.radii
    )
    
    # Combine meshes for visualization
    
    # Offset node indices for second mesh
    offset = len(mesh1.nodes)
    combined_nodes = mesh1.nodes + mesh2.nodes
    combined_edges = mesh1.edges + [[e[0] + offset, e[1] + offset] for e in mesh2.edges]
    combined_radii = mesh1.radii + mesh2.radii
    
    # Create a single source between first node of helix 1 and first node of helix 2
    from backend.common.models.geometry import Source
    bifilar_source = Source(
        type="voltage",
        amplitude=complex(1.0, 0.0),
        node_start=1,  # First node of helix 1 (1-based indexing)
        node_end=offset + 1  # First node of helix 2 (1-based indexing)
    )
    
    combined_mesh = Mesh(
        nodes=combined_nodes,
        edges=combined_edges,
        radii=combined_radii
    )
    
    # Create a dummy element to hold the source for visualization
    from backend.common.models.geometry import AntennaElement
    from uuid import uuid4
    combined_element = AntennaElement(
        id=uuid4(),
        name="Bifilar Helix",
        type="helix",
        parameters={},
        source=bifilar_source
    )
    
    # Print info about both helices
    print(f"\nHelix 1: {len(mesh1.nodes)} nodes, {len(mesh1.edges)} edges")
    print(f"Helix 2: {len(mesh2.nodes)} nodes, {len(mesh2.edges)} edges (rotated 180° around Z)")
    print(f"Combined: {len(combined_mesh.nodes)} nodes, {len(combined_mesh.edges)} edges")
    print(f"\nSingle source between node 1 (Helix 1 first node) and node {offset + 1} (Helix 2 first node)")
    
    # Visualize combined structure with source
    visualize_mesh(combined_mesh, combined_element, console=False, plot=True)


def visualize_all():
    """Visualize all antenna types sequentially."""
    print("\n" + "="*70)
    print("ANTENNA VISUALIZATION DEMO - All Types")
    print("="*70)
    print("\nThis script will show each antenna type one by one.")
    print("Close each plot window to see the next antenna.\n")
    
    input("Press Enter to view DIPOLE antenna...")
    visualize_dipole()
    
    input("\nPress Enter to view LOOP antenna...")
    visualize_loop()
    
    input("\nPress Enter to view ROD antenna...")
    visualize_rod()
    
    input("\nPress Enter to view HELIX antenna...")
    visualize_helix()
    
    print("\n" + "="*70)
    print("Visualization complete!")
    print("="*70 + "\n")


if __name__ == "__main__":
    try:
        visualize_all()
    except KeyboardInterrupt:
        print("\n\nVisualization interrupted by user.")
    except Exception as e:
        print(f"\n\nError during visualization: {e}")
        import traceback
        traceback.print_exc()
