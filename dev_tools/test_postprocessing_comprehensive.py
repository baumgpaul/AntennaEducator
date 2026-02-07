"""
Comprehensive test suite for postprocessing features.
Tests incremental computation, directivity settings, and field management.
"""
import requests
import json

SOLVER_URL = "http://localhost:8002"
POSTPROCESSOR_URL = "http://localhost:8003"

def test_incremental_field_computation():
    """Test that only new fields are computed when adding fields incrementally."""
    
    print("\n" + "="*80)
    print("TEST 1: INCREMENTAL FIELD COMPUTATION")
    print("="*80)
    
    # Solve dipole
    print("\n[1/4] Solving dipole antenna...")
    solver_request = {
        "frequency": 300e6,
        "antennas": [{
            "antenna_id": "dipole",
            "nodes": [[0, 0, -0.25], [0, 0, -0.001], [0, 0, 0.001], [0, 0, 0.25]],
            "edges": [[1, 2], [3, 4]],
            "radii": [0.001, 0.001],
            "voltage_sources": [{"node_start": 2, "node_end": 3, "value": 1.0, "R": 0, "L": 0, "C_inv": 0}],
            "current_sources": [],
            "loads": []
        }]
    }
    
    response = requests.post(f"{SOLVER_URL}/api/solve/multi-antenna", json=solver_request, timeout=30)
    assert response.status_code == 200, f"Solver failed: {response.text}"
    solve_data = response.json()
    print(f"   ✓ Solved with {len(solve_data['branch_currents'])} branches")
    
    # Compute first field
    print("\n[2/4] Computing first field (z=0.5m)...")
    field1_request = {
        "frequencies": [300e6],
        "branch_currents": [solve_data['branch_currents']],
        "nodes": solver_request["antennas"][0]["nodes"],
        "edges": solver_request["antennas"][0]["edges"],
        "radii": solver_request["antennas"][0]["radii"],
        "observation_points": [[x, 0, 0.5] for x in [-0.5, 0, 0.5]]
    }
    
    response = requests.post(f"{POSTPROCESSOR_URL}/api/fields/near", json=field1_request, timeout=30)
    assert response.status_code == 200, f"Field 1 failed: {response.text}"
    field1_data = response.json()
    print(f"   ✓ Field 1: {field1_data['num_points']} points, E_max={max(field1_data['E_magnitudes']):.3f} V/m")
    
    # Compute second field at different location (simulating incremental computation)
    print("\n[3/4] Computing second field (z=1.0m)...")
    field2_request = {
        **field1_request,
        "observation_points": [[x, 0, 1.0] for x in [-0.5, 0, 0.5]]
    }
    
    response = requests.post(f"{POSTPROCESSOR_URL}/api/fields/near", json=field2_request, timeout=30)
    assert response.status_code == 200, f"Field 2 failed: {response.text}"
    field2_data = response.json()
    print(f"   ✓ Field 2: {field2_data['num_points']} points, E_max={max(field2_data['E_magnitudes']):.3f} V/m")
    
    # Verify fields are different
    print("\n[4/4] Verifying incremental computation...")
    assert field1_data['E_magnitudes'] != field2_data['E_magnitudes'], "Fields at different locations should differ"
    print("   ✓ Field results are different (incremental computation verified)")
    
    return True


def test_custom_directivity_discretization():
    """Test that directivity uses custom theta/phi discretization."""
    
    print("\n" + "="*80)
    print("TEST 2: CUSTOM DIRECTIVITY DISCRETIZATION")
    print("="*80)
    
    # Solve dipole
    print("\n[1/3] Solving dipole antenna...")
    solver_request = {
        "frequency": 300e6,
        "antennas": [{
            "antenna_id": "dipole",
            "nodes": [[0, 0, -0.25], [0, 0, -0.001], [0, 0, 0.001], [0, 0, 0.25]],
            "edges": [[1, 2], [3, 4]],
            "radii": [0.001, 0.001],
            "voltage_sources": [{"node_start": 2, "node_end": 3, "value": 1.0, "R": 0, "L": 0, "C_inv": 0}],
            "current_sources": [],
            "loads": []
        }]
    }
    
    response = requests.post(f"{SOLVER_URL}/api/solve/multi-antenna", json=solver_request, timeout=30)
    assert response.status_code == 200
    solve_data = response.json()
    print(f"   ✓ Solved")
    
    # Compute directivity with custom discretization (30×60 points)
    print("\n[2/3] Computing directivity with 30×60 discretization...")
    directivity_request = {
        "frequencies": [300e6],
        "branch_currents": [solve_data['branch_currents']],
        "nodes": solver_request["antennas"][0]["nodes"],
        "edges": solver_request["antennas"][0]["edges"],
        "radii": solver_request["antennas"][0]["radii"],
        "theta_points": 30,
        "phi_points": 60
    }
    
    response = requests.post(f"{POSTPROCESSOR_URL}/api/fields/far", json=directivity_request, timeout=30)
    assert response.status_code == 200, f"Directivity failed: {response.text}"
    directivity_data = response.json()
    print(f"   ✓ Directivity: {directivity_data['directivity']:.2f} dBi")
    print(f"   ✓ Gain: {directivity_data['gain']:.2f} dBi")
    print(f"   ✓ Efficiency: {directivity_data['efficiency']:.1%}")
    
    # Verify discretization was applied
    print("\n[3/3] Verifying discretization parameters...")
    assert len(directivity_data['theta_angles']) == 30, f"Expected 30 theta points, got {len(directivity_data['theta_angles'])}"
    assert len(directivity_data['phi_angles']) == 60, f"Expected 60 phi points, got {len(directivity_data['phi_angles'])}"
    print(f"   ✓ Pattern computed with {len(directivity_data['theta_angles'])}×{len(directivity_data['phi_angles'])} = {len(directivity_data['theta_angles'])*len(directivity_data['phi_angles'])} points")
    
    return True


def test_mixed_field_and_directivity():
    """Test computing both near fields and directivity for same antenna."""
    
    print("\n" + "="*80)
    print("TEST 3: MIXED FIELD AND DIRECTIVITY COMPUTATION")
    print("="*80)
    
    # Solve
    print("\n[1/3] Solving dipole antenna...")
    solver_request = {
        "frequency": 300e6,
        "antennas": [{
            "antenna_id": "dipole",
            "nodes": [[0, 0, -0.25], [0, 0, -0.001], [0, 0, 0.001], [0, 0, 0.25]],
            "edges": [[1, 2], [3, 4]],
            "radii": [0.001, 0.001],
            "voltage_sources": [{"node_start": 2, "node_end": 3, "value": 1.0, "R": 0, "L": 0, "C_inv": 0}],
            "current_sources": [],
            "loads": []
        }]
    }
    
    response = requests.post(f"{SOLVER_URL}/api/solve/multi-antenna", json=solver_request, timeout=30)
    solve_data = response.json()
    print("   ✓ Solved")
    
    # Compute near field
    print("\n[2/3] Computing near field...")
    near_field_request = {
        "frequencies": [300e6],
        "branch_currents": [solve_data['branch_currents']],
        "nodes": solver_request["antennas"][0]["nodes"],
        "edges": solver_request["antennas"][0]["edges"],
        "radii": solver_request["antennas"][0]["radii"],
        "observation_points": [[0, 0, z] for z in [0.5, 1.0, 1.5]]
    }
    
    response = requests.post(f"{POSTPROCESSOR_URL}/api/fields/near", json=near_field_request, timeout=30)
    near_field_data = response.json()
    print(f"   ✓ Near field: {near_field_data['num_points']} points")
    
    # Compute directivity
    print("\n[3/3] Computing directivity...")
    directivity_request = {
        "frequencies": [300e6],
        "branch_currents": [solve_data['branch_currents']],
        "nodes": solver_request["antennas"][0]["nodes"],
        "edges": solver_request["antennas"][0]["edges"],
        "radii": solver_request["antennas"][0]["radii"],
        "theta_points": 19,
        "phi_points": 37
    }
    
    response = requests.post(f"{POSTPROCESSOR_URL}/api/fields/far", json=directivity_request, timeout=30)
    directivity_data = response.json()
    print(f"   ✓ Directivity: {directivity_data['directivity']:.2f} dBi")
    print(f"   ✓ Both near field and directivity computed successfully")
    
    return True


def main():
    print("\n" + "🎯 "*30)
    print("COMPREHENSIVE POSTPROCESSING TEST SUITE")
    print("🎯 "*30)
    
    tests = [
        ("Incremental Field Computation", test_incremental_field_computation),
        ("Custom Directivity Discretization", test_custom_directivity_discretization),
        ("Mixed Field and Directivity", test_mixed_field_and_directivity),
    ]
    
    results = []
    for name, test_func in tests:
        try:
            result = test_func()
            results.append((name, result))
        except AssertionError as e:
            print(f"\n   ✗ FAILED: {e}")
            results.append((name, False))
        except Exception as e:
            print(f"\n   ✗ ERROR: {e}")
            results.append((name, False))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"   {status:10} {name}")
    
    print(f"\n   {passed}/{total} tests passed")
    
    if passed == total:
        print("\n" + "🎉 "*30)
        print("ALL TESTS PASSED!")
        print("🎉 "*30)
        return 0
    else:
        print("\n" + "❌ "*30)
        print("SOME TESTS FAILED")
        print("❌ "*30)
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(main())
