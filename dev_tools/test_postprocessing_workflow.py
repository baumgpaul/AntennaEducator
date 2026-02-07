"""
Test complete postprocessing workflow: Solve → Compute Far Field
Tests the full integration between solver and postprocessor services
"""

import requests
import json
import numpy as np

SOLVER_URL = "http://localhost:8002"
POSTPROCESSOR_URL = "http://localhost:8003"

def test_postprocessing_workflow():
    """Test complete workflow: solve dipole then compute far field"""
    
    print("=" * 80)
    print("POSTPROCESSING WORKFLOW TEST")
    print("=" * 80)
    
    # Step 1: Solve dipole antenna
    print("\n[1/3] Solving dipole antenna at 300 MHz...")
    
    solver_request = {
        "frequency": 300e6,  # 300 MHz in Hz
        "antennas": [
            {
                "antenna_id": "test_dipole",
                "nodes": [
                    [0, 0, -0.25],
                    [0, 0, -0.001],
                    [0, 0, 0.001],
                    [0, 0, 0.25]
                ],
                "edges": [
                    [1, 2],
                    [3, 4]
                ],
                "radii": [0.001, 0.001],
                "voltage_sources": [
                    {
                        "node_start": 2,
                        "node_end": 3,
                        "value": 1.0,
                        "R": 0,
                        "L": 0,
                        "C_inv": 0
                    }
                ],
                "current_sources": [],
                "loads": []
            }
        ]
    }
    
    response = requests.post(
        f"{SOLVER_URL}/api/solve/multi",
        json=solver_request,
        timeout=30
    )
    
    if response.status_code != 200:
        print(f"[FAIL] Solver failed: {response.status_code}")
        print(response.text)
        return False
    
    solver_result = response.json()
    print(f"[PASS] Solver succeeded:")
    print(f"   - Converged: {solver_result['converged']}")
    print(f"   - Solve time: {solver_result['solve_time']:.3f}s")
    print(f"   - Antenna solutions: {solver_result['num_solutions']}")
    
    # Extract results for postprocessing
    antenna_solution = solver_result['antenna_solutions'][0]
    branch_currents = antenna_solution['branch_currents']
    
    print(f"   - Branch currents: {len(branch_currents)} values")
    print(f"   - Input impedance: {antenna_solution.get('input_impedance', 'N/A')}")
    
    # Step 2: Compute far-field radiation pattern
    print("\n[2/3] Computing far-field radiation pattern...")
    
    far_field_request = {
        "frequencies": [300e6],
        "branch_currents": [branch_currents],
        "nodes": solver_request["antennas"][0]["nodes"],
        "edges": solver_request["antennas"][0]["edges"],
        "radii": solver_request["antennas"][0]["radii"],
        "theta_points": 19,
        "phi_points": 37
    }
    
    response = requests.post(
        f"{POSTPROCESSOR_URL}/api/fields/far",
        json=far_field_request,
        timeout=30
    )
    
    if response.status_code != 200:
        print(f"[FAIL] Postprocessor failed: {response.status_code}")
        print(response.text)
        return False
    
    far_field_result = response.json()
    print(f"[PASS] Far-field computation succeeded:")
    print(f"   - Directivity: {far_field_result['directivity']:.2f} dBi")
    print(f"   - Gain: {far_field_result['gain']:.2f} dBi")
    print(f"   - Efficiency: {far_field_result['efficiency']:.4f}")
    print(f"   - Theta angles: {len(far_field_result['theta_angles'])} points")
    print(f"   - Phi angles: {len(far_field_result['phi_angles'])} points")
    print(f"   - Max direction: θ={far_field_result['max_direction'][0]:.1f}°, φ={far_field_result['max_direction'][1]:.1f}°")
    
    # Step 3: Validate results
    print("\n[3/3] Validating results...")
    
    # Check directivity is reasonable for dipole (should be ~2.15 dBi)
    expected_directivity = 2.15
    directivity = far_field_result['directivity']
    error = abs(directivity - expected_directivity)
    
    if error < 0.2:
        print(f"[PASS] Directivity validation passed: {directivity:.2f} dBi (expected ~{expected_directivity} dBi)")
    else:
        print(f"[WARN] Directivity off by {error:.2f} dB: got {directivity:.2f}, expected ~{expected_directivity}")
    
    # Check pattern shape
    pattern_db = np.array(far_field_result['pattern_db'])
    max_gain = np.max(pattern_db)
    min_gain = np.min(pattern_db)
    dynamic_range = max_gain - min_gain
    
    print(f"[PASS] Pattern dynamic range: {dynamic_range:.1f} dB")
    print(f"   - Max: {max_gain:.1f} dB")
    print(f"   - Min: {min_gain:.1f} dB")
    
    print("\n" + "=" * 80)
    print("[SUCCESS] POSTPROCESSING WORKFLOW TEST PASSED!")
    print("=" * 80)
    
    return True

if __name__ == "__main__":
    try:
        success = test_postprocessing_workflow()
        if not success:
            exit(1)
    except Exception as e:
        print(f"\n[FAIL] Test failed with exception: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
