"""Minimal test to debug solver issue."""
import sys
import numpy as np

# Test if we can import and call the solver directly
from backend.solver.solver import solve_single_frequency, SolverConfiguration
from backend.solver.system import VoltageSource

# Simple 2-node dipole
nodes = np.array([[0, 0, 0], [0, 0, 0.5]])
edges = [[0, 1]]  # 0-based for internal representation
radii = np.array([0.001])
frequency = 100e6

# Voltage source (1-based indexing as per solver API)
voltage_sources = [VoltageSource(
    node_start=1,  # 1-based
    node_end=0,    # 0 = ground
    value=1.0,
    impedance=50.0
)]

config = SolverConfiguration()

print("Calling solve_single_frequency...")
try:
    result = solve_single_frequency(
        nodes,
        edges,
        radii,
        frequency,
        voltage_sources,
        None,  # current_sources
        None,  # loads
        config
    )
    print(f"✓ Success!")
    print(f"  Input impedance: {result.input_impedance}")
except Exception as e:
    print(f"✗ Error: {e}")
    import traceback
    traceback.print_exc()
