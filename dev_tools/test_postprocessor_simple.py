"""
Simple test to verify postprocessor integration works
"""
import numpy as np
from backend.postprocessor.field import compute_far_field, compute_directivity_from_pattern

print("="*80)
print("POSTPROCESSOR DIRECT TEST")
print("="*80)

# Test dipole (2 segments, 3 nodes)
frequencies = np.array([300e6])  # 300 MHz
nodes = np.array([
    [0, 0, -0.25],
    [0, 0, 0.0],
    [0, 0, 0.25]
])
edges = np.array([[1, 2], [2, 3]])  # 1-based indexing
branch_currents = np.array([[0.01+0.001j, 0.01+0.001j]], dtype=complex)  # 2 currents

# Angular grid
theta_angles = np.linspace(0, np.pi, 19)
phi_angles = np.linspace(0, 2*np.pi, 37)

print("\n[1/2] Computing far-field pattern...")
print(f"  Nodes: {nodes.shape[0]}, Edges: {edges.shape[0]}")
print(f"  Currents: {branch_currents.shape[1]}")
print(f"  Grid: {len(theta_angles)}x{len(phi_angles)}")

try:
    E_field, H_field = compute_far_field(
        frequencies=frequencies,
        branch_currents=branch_currents,
        nodes=nodes,
        edges=edges,
        theta_angles=theta_angles,
        phi_angles=phi_angles
    )
    
    print("[PASS] Far-field computation succeeded")
    print(f"  E_field shape: {E_field.shape}")
    print(f"  H_field shape: {H_field.shape}")
    
except Exception as e:
    print(f"[FAIL] Far-field computation failed: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

print("\n[2/2] Computing directivity...")

try:
    E_theta = E_field[0, :, :, 0]
    E_phi = E_field[0, :, :, 1]
    
    directivity_linear, directivity_dBi, U_pattern, max_indices = compute_directivity_from_pattern(
        E_theta, E_phi, theta_angles, phi_angles
    )
    
    print("[PASS] Directivity computation succeeded")
    print(f"  Directivity: {directivity_dBi:.2f} dBi")
    print(f"  Expected for dipole: ~2.15 dBi")
    
    error = abs(directivity_dBi - 2.15)
    if error < 1.0:
        print(f"  [OK] Within reasonable range (error: {error:.2f} dB)")
    else:
        print(f"  [WARN] Higher than expected error: {error:.2f} dB")
    
except Exception as e:
    print(f"[FAIL] Directivity computation failed: {e}")
    import traceback
    traceback.print_exc()
    exit(1)

print("\n" + "="*80)
print("[SUCCESS] POSTPROCESSOR TESTS PASSED")
print("="*80)
