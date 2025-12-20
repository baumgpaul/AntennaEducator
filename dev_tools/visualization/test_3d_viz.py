"""Test script for 3D visualization with matplotlib."""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.preprocessor.builders import create_dipole, dipole_to_mesh
from dev_tools.visualization import visualize_mesh


def test_3d_plot():
    """Test 3D matplotlib visualization."""
    
    # Create a dipole with gap
    element = create_dipole(
        length=1.0,
        gap=0.01,
        segments=10,
        source={
            "type": "voltage",
            "amplitude": {"real": 1.0, "imag": 0.0}
        },
        name="Test Dipole for 3D Plot"
    )
    mesh = dipole_to_mesh(element)
    
    # Show console info
    print("\nGenerating 3D visualization...")
    print("Close the plot window to continue.\n")
    
    # Try to show 3D plot
    try:
        visualize_mesh(mesh, element, console=True, plot=True)
        print("\n✓ 3D visualization successful!")
    except Exception as e:
        print(f"\n✗ 3D visualization failed: {e}")
        print("Install matplotlib with: pip install matplotlib")


if __name__ == "__main__":
    test_3d_plot()
