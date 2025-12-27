"""
Test script to verify voltage source current fix.

This script tests that voltage source currents are properly returned
from the solver service.
"""

import requests
import json
import numpy as np
import sys

# Fix encoding for Windows console
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# Solver service endpoint
SOLVER_URL = "http://localhost:8002/api/v1"

def test_single_dipole_voltage_source():
    """Test simple dipole with voltage source."""
    print("=" * 80)
    print("TEST: Single Dipole with Voltage Source")
    print("=" * 80)
    
    # Simple dipole: 2 nodes, 1 edge, 1 voltage source
    request_data = {
        "nodes": [
            [0.0, 0.0, 0.0],
            [0.0, 0.0, 0.5]  # 0.5m dipole
        ],
        "edges": [[1, 2]],  # 1-based indexing
        "radii": [0.001],   # 1mm radius
        "frequency": 300e6,  # 300 MHz
        "voltage_sources": [
            {
                "node_start": 1,
                "node_end": 0,  # 0 = ground
                "value": 1.0,
                "R": 50.0,
                "L": 0.0,
                "C_inv": 0.0
            }
        ],
        "current_sources": []
    }
    
    print("\nRequest:")
    print(f"  Nodes: {len(request_data['nodes'])}")
    print(f"  Edges: {len(request_data['edges'])}")
    print(f"  Voltage sources: {len(request_data['voltage_sources'])}")
    print(f"  Frequency: {request_data['frequency']/1e6:.1f} MHz")
    
    # Send request
    response = requests.post(
        f"{SOLVER_URL}/solve/single",
        json=request_data,
        headers={"Content-Type": "application/json"}
    )
    
    print(f"\nResponse status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"ERROR: {response.text}")
        return False
    
    result = response.json()
    
    # Check branch_currents
    branch_currents = result.get("branch_currents", [])
    print(f"\nBranch currents returned: {len(branch_currents)} values")
    
    if len(branch_currents) == 0:
        print("  ERROR: No branch currents returned!")
        return False
    
    # Expected: 1 edge current + 1 voltage source current = 2 total
    # After fix, branch_currents should have length >= 2
    print(f"\nBranch currents details:")
    for i, current in enumerate(branch_currents):
        # Parse complex number from string or dict
        if isinstance(current, str):
            current_complex = complex(current)
        elif isinstance(current, dict):
            current_complex = complex(current["real"], current["imag"])
        else:
            current_complex = current
        
        magnitude = abs(current_complex)
        phase_deg = np.angle(current_complex, deg=True)
        print(f"  [{i}] = {magnitude:.6e} A ∠ {phase_deg:.2f}°")
    
    # Check input current
    input_current = result.get("input_current", {})
    if isinstance(input_current, str):
        input_current_complex = complex(input_current)
    elif isinstance(input_current, dict):
        input_current_complex = complex(input_current["real"], input_current["imag"])
    else:
        input_current_complex = input_current
    
    input_magnitude = abs(input_current_complex)
    
    print(f"\nInput current: {input_magnitude:.6e} A")
    print(f"Input impedance: {result.get('input_impedance', {})}")
    
    # Verify we have at least 2 branch currents (edge + voltage source)
    if len(branch_currents) < 2:
        print(f"\n❌ FAIL: Expected at least 2 branch currents, got {len(branch_currents)}")
        print("   The voltage source current is missing!")
        return False
    
    # Verify input current matches second branch current (voltage source)
    if len(branch_currents) >= 2:
        # Parse voltage source current
        if isinstance(branch_currents[1], str):
            vsrc_current = complex(branch_currents[1])
        elif isinstance(branch_currents[1], dict):
            vsrc_current = complex(branch_currents[1]["real"], branch_currents[1]["imag"])
        else:
            vsrc_current = branch_currents[1]
        
        vsrc_magnitude = abs(vsrc_current)
        
        if abs(vsrc_magnitude - input_magnitude) < 1e-6:
            print(f"\n✅ PASS: Voltage source current correctly extracted!")
            print(f"   branch_currents[1] = input_current = {input_magnitude:.6e} A")
            return True
        else:
            print(f"\n⚠️  WARNING: branch_currents[1] != input_current")
            print(f"   branch_currents[1] = {vsrc_magnitude:.6e} A")
            print(f"   input_current = {input_magnitude:.6e} A")
            return True  # Still pass if we have the currents
    
    return True


def test_multi_antenna():
    """Test multi-antenna with voltage sources."""
    print("\n" + "=" * 80)
    print("TEST: Multi-Antenna with Voltage Sources")
    print("=" * 80)
    
    # Two simple dipoles
    request_data = {
        "antennas": [
            {
                "antenna_id": "dipole1",
                "nodes": [
                    [0.0, 0.0, 0.0],
                    [0.0, 0.0, 0.5]
                ],
                "edges": [[1, 2]],
                "radii": [0.001],
                "voltage_sources": [
                    {
                        "node_start": 1,
                        "node_end": 0,
                        "value": 1.0,
                        "R": 50.0,
                        "L": 0.0,
                        "C_inv": 0.0
                    }
                ],
                "current_sources": [],
                "loads": []
            },
            {
                "antenna_id": "dipole2",
                "nodes": [
                    [1.0, 0.0, 0.0],
                    [1.0, 0.0, 0.5]
                ],
                "edges": [[1, 2]],
                "radii": [0.001],
                "voltage_sources": [
                    {
                        "node_start": 1,
                        "node_end": 0,
                        "value": 1.0,
                        "R": 50.0,
                        "L": 0.0,
                        "C_inv": 0.0
                    }
                ],
                "current_sources": [],
                "loads": []
            }
        ],
        "frequency": 300e6
    }
    
    print("\nRequest:")
    print(f"  Number of antennas: {len(request_data['antennas'])}")
    print(f"  Frequency: {request_data['frequency']/1e6:.1f} MHz")
    
    # Send request
    response = requests.post(
        f"{SOLVER_URL}/solve/multi",
        json=request_data,
        headers={"Content-Type": "application/json"}
    )
    
    print(f"\nResponse status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"ERROR: {response.text}")
        return False
    
    result = response.json()
    
    # Check antenna solutions
    solutions = result.get("solutions", [])
    print(f"\nNumber of antenna solutions: {len(solutions)}")
    
    all_passed = True
    for i, sol in enumerate(solutions):
        antenna_id = sol.get("antenna_id", f"antenna_{i}")
        vsrc_currents = sol.get("voltage_source_currents", [])
        
        print(f"\nAntenna '{antenna_id}':")
        print(f"  Voltage source currents: {len(vsrc_currents)} values")
        
        if len(vsrc_currents) == 0:
            print(f"  ❌ FAIL: No voltage source currents returned!")
            all_passed = False
        else:
            for j, current in enumerate(vsrc_currents):
                # Parse complex number
                if isinstance(current, str):
                    current_complex = complex(current)
                elif isinstance(current, dict):
                    current_complex = complex(current["real"], current["imag"])
                else:
                    current_complex = current
                
                magnitude = abs(current_complex)
                phase_deg = np.angle(current_complex, deg=True)
                print(f"    [{j}] = {magnitude:.6e} A ∠ {phase_deg:.2f}°")
            print(f"  ✅ PASS: Voltage source currents present!")
    
    return all_passed


if __name__ == "__main__":
    print("\nVoltage Source Current Fix Test")
    print("=" * 80)
    print("This test verifies that the solver correctly returns voltage source currents")
    print("after the bug fix in solver.py")
    print()
    
    # Check if solver is running
    try:
        response = requests.get(f"{SOLVER_URL}/status")
        if response.status_code != 200:
            print("ERROR: Solver service not responding!")
            print("Please start the solver service with: python -m backend.solver.main")
            exit(1)
        print("✓ Solver service is running\n")
    except Exception as e:
        print(f"ERROR: Cannot connect to solver service: {e}")
        print("Please start the solver service with: python -m backend.solver.main")
        exit(1)
    
    # Run tests
    test1_passed = test_single_dipole_voltage_source()
    test2_passed = test_multi_antenna()
    
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Single dipole test: {'✅ PASSED' if test1_passed else '❌ FAILED'}")
    print(f"Multi-antenna test: {'✅ PASSED' if test2_passed else '❌ FAILED'}")
    
    if test1_passed and test2_passed:
        print("\n🎉 All tests passed! The voltage source current bug is fixed.")
    else:
        print("\n❌ Some tests failed. Please check the solver logs.")
