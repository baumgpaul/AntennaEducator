"""
Simple visualization - saves plot to PNG file.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.preprocessor.builders import create_dipole, dipole_to_mesh
from dev_tools.visualization import visualize_mesh

# Create dipole with gap and voltage source
element = create_dipole(
    length=1.0,
    gap=0.01,
    segments=10,
    source={"type": "voltage", "amplitude": {"real": 1.0, "imag": 0.0}},
    name="Dipole Antenna 1m"
)

mesh = dipole_to_mesh(element)

# Visualize with console output and save to file
output_file = "dipole_visualization.png"
print("Generating visualization...\n")
visualize_mesh(mesh, element, console=True, plot=False, save_path=output_file)

print(f"\n{'='*60}")
print(f"✓ Visualization saved to: {output_file}")
print(f"{'='*60}")
print(f"Open '{output_file}' to see:")
print(f"  • Blue wireframe showing antenna geometry")
print(f"  • Red dots at node positions")
print(f"  • Gap clearly visible at z=0")
print(f"  • 22 nodes (11 per half)")
print(f"  • 20 wire segments (10 per half)")
