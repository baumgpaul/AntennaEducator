"""
Simple example script to visualize antenna geometries.

Run this to test and debug antenna builders.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.preprocessor.builders import create_dipole, dipole_to_mesh
from dev_tools.visualization import visualize_mesh


def main():
    """Run visualization examples."""
    
    # Example 1: Basic dipole without gap
    print("\n### Example 1: Dipole without gap ###")
    element1 = create_dipole(
        length=1.0,
        segments=11,
        name="Basic Dipole 1m"
    )
    mesh1 = dipole_to_mesh(element1)
    visualize_mesh(mesh1, element1, console=True, plot=False)
    
    # Example 2: Dipole with gap and voltage source
    print("\n### Example 2: Dipole with gap and source ###")
    element2 = create_dipole(
        length=1.0,
        gap=0.01,
        segments=10,
        source={
            "type": "voltage",
            "amplitude": {"real": 1.0, "imag": 0.0}
        },
        name="Dipole with 10mm gap"
    )
    mesh2 = dipole_to_mesh(element2)
    visualize_mesh(mesh2, element2, console=True, plot=False)
    
    # Example 3: Dipole with custom orientation
    print("\n### Example 3: Horizontal dipole (X-axis) ###")
    element3 = create_dipole(
        length=0.5,
        orientation=(1.0, 0.0, 0.0),
        segments=5,
        name="Horizontal Dipole 0.5m"
    )
    mesh3 = dipole_to_mesh(element3)
    visualize_mesh(mesh3, element3, console=True, plot=False)
    
    # Uncomment to show 3D plots (requires matplotlib)
    # print("\n### Showing 3D visualization (close window to continue) ###")
    # visualize_mesh(mesh2, element2, console=False, plot=True)


if __name__ == "__main__":
    main()
