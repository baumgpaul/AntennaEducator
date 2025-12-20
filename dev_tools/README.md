# Development Tools

This directory contains debugging, testing, and development utilities that are **not part of the production code**.

## Structure

```
dev_tools/
├── visualization/          # Visualization and geometry debugging tools
│   ├── visualization.py    # Core visualization utilities
│   ├── save_dipole_plot.py # Quick script to generate visualization PNG
│   ├── view_dipole.py      # Interactive visualization example
│   ├── visualize_example.py # Multiple visualization examples
│   ├── run_visualization_demo.py # Visualization demo
│   └── test_3d_viz.py      # 3D visualization test
├── test_api_debug.py       # API testing with debug mode
└── README.md               # This file
```

## Visualization Tools

### Quick Start - Generate Visualization

```bash
cd dev_tools/visualization
python save_dipole_plot.py
```

This creates `dipole_visualization.png` showing the antenna geometry.

### Visualization Functions

Located in `visualization/visualization.py`:

- **`print_mesh_info(mesh, element)`** - Print detailed node/edge information
- **`plot_mesh_3d(mesh, element)`** - Create 3D matplotlib plot
- **`visualize_mesh(mesh, element, console=True, plot=False, save_path=None)`** - All-in-one visualization

### Example Usage

```python
from backend.preprocessor.builders import create_dipole, dipole_to_mesh
from dev_tools.visualization import visualize_mesh

# Create antenna
element = create_dipole(length=1.0, gap=0.01, segments=10)
mesh = dipole_to_mesh(element)

# Visualize (console output + save to file)
visualize_mesh(mesh, element, console=True, save_path="my_antenna.png")
```

## API Testing

### Debug Mode Testing

```bash
cd dev_tools
python test_api_debug.py
```

This starts the preprocessor service with debug visualization enabled (automatically prints mesh info for each request).

## Important Notes

⚠️ **These tools are for development only:**
- Not imported by production code
- Can use heavyweight dependencies (matplotlib, etc.)
- May have blocking operations (plt.show())
- Outputs are for human inspection, not production use

The production preprocessor service (`backend/preprocessor/`) only generates JSON geometry data and does **not** include any visualization dependencies.
