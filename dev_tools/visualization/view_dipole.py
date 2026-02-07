"""
Quick visualization test - shows console output and saves plot to file.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import matplotlib.pyplot as plt

from backend.preprocessor.builders import create_dipole, dipole_to_mesh
from dev_tools.visualization import plot_mesh_3d, print_mesh_info


def main():
    """Create and visualize a dipole antenna."""

    # Create dipole
    element = create_dipole(
        length=1.0,
        gap=0.01,
        segments=10,
        source={"type": "voltage", "amplitude": {"real": 1.0, "imag": 0.0}},
        name="Example Dipole",
    )

    mesh = dipole_to_mesh(element)

    # Console output
    print("=" * 60)
    print("DIPOLE ANTENNA VISUALIZATION")
    print("=" * 60)
    print_mesh_info(mesh, element)

    # Create 3D plot
    print("\n" + "=" * 60)
    print("Creating 3D plot...")
    print("=" * 60)

    try:
        fig = plot_mesh_3d(mesh, element)

        # Save to file
        output_file = "dipole_visualization.png"
        fig.savefig(output_file, dpi=150, bbox_inches="tight")
        print(f"\n✓ Plot saved to: {output_file}")
        print("  You can open this file to see the 3D visualization")

        # Also try to show interactively (may not work in all environments)
        plt.show(block=False)
        print("\n✓ If matplotlib is properly configured, an interactive window should appear")
        print("  (You can rotate the view by clicking and dragging)")

        input("\nPress Enter to close...")
        plt.close("all")

    except Exception as e:
        print(f"\nNote: Interactive plot not available: {e}")
        print("But the PNG file should have been saved successfully.")


if __name__ == "__main__":
    main()
