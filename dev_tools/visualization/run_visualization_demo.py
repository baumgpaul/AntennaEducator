"""
Visualization example with matplotlib 3D plot enabled.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.preprocessor.builders import create_dipole, dipole_to_mesh
from dev_tools.visualization import visualize_mesh


def main():
    """Run visualization with 3D plot."""

    print("Creating dipole with gap...")
    element = create_dipole(
        length=1.0,
        gap=0.01,
        segments=10,
        source={"type": "voltage", "amplitude": {"real": 1.0, "imag": 0.0}},
        name="Dipole 1m with 10mm gap",
    )

    mesh = dipole_to_mesh(element)

    # Show console output and 3D plot
    print("\nGenerating visualization...")
    visualize_mesh(mesh, element, console=True, plot=True)

    print("\n✓ A matplotlib window should have opened with the 3D visualization.")
    print("  - Blue lines: wire segments")
    print("  - Red marker: source location")
    print("  - You can rotate the view by clicking and dragging")
    print("  - Close the window to continue")


if __name__ == "__main__":
    main()
