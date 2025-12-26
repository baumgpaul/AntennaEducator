"""
Direct test of compute_far_field function to see actual error
"""
import numpy as np
from backend.postprocessor.field import compute_far_field, compute_directivity_from_pattern

# Simple test case
frequencies = np.array([299.792458e6])
nodes = np.array([
    [0, 0, 0.025],
    [0, 0, 0.075]
])
edges = np.array([[1, 2]])  # 1-based indexing

# Branch currents - should match number of edges!
branch_currents = np.array([[0.008+0.001j]], dtype=complex)  # Only 1 current for 1 edge

# Angular grid
theta_angles = np.linspace(0, np.pi, 5)
phi_angles = np.linspace(0, 2*np.pi, 5)

print("Testing compute_far_field...")
print(f"  frequencies shape: {frequencies.shape}")
print(f"  nodes shape: {nodes.shape}")
print(f"  edges shape: {edges.shape}")
print(f"  branch_currents shape: {branch_currents.shape}")
print(f"  theta_angles shape: {theta_angles.shape}")
print(f"  phi_angles shape: {phi_angles.shape}")

try:
    E_field, H_field = compute_far_field(
        frequencies=frequencies,
        branch_currents=branch_currents,
        nodes=nodes,
        edges=edges,
        theta_angles=theta_angles,
        phi_angles=phi_angles
    )
    
    print(f"\n✓ Success!")
    print(f"  E_field shape: {E_field.shape}")
    print(f"  H_field shape: {H_field.shape}")
    
    # Try directivity
    E_theta = E_field[0, :, :, 0]
    E_phi = E_field[0, :, :, 1]
    
    directivity_linear, directivity_dBi, U_pattern, max_indices = compute_directivity_from_pattern(
        E_theta, E_phi, theta_angles, phi_angles
    )
    
    print(f"\n✓ Directivity computed!")
    print(f"  Directivity: {directivity_dBi:.2f} dBi")
    
except Exception as e:
    print(f"\n✗ Error: {e}")
    import traceback
    traceback.print_exc()
