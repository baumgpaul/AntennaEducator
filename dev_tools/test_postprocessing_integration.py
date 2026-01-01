"""
Integration test for incremental field computation workflow.
Tests against actual running backend services on ports 8002 and 8003.
"""
import requests
import sys
from pathlib import Path

SOLVER_URL = "http://localhost:8002"
POSTPROCESSOR_URL = "http://localhost:8003"


def test_incremental_field_computation():
    """Test that incremental field computation works correctly."""
    
    print("\n" + "="*60)
    print("INCREMENTAL FIELD COMPUTATION TEST")
    print("="*60)
    
    # Step 1: Solve dipole at 300 MHz
    print("\n1. Solving dipole at 300 MHz...")
    solve_request = {
        "frequency": 300e6,
        "nodes": [[0, 0, 0], [0, 0, 0.5]],
        "edges": [[0, 1]],
        "radii": [0.001],
        "voltage_sources": [{"node_start": 0, "node_end": 1, "voltage": {"real": 1.0, "imag": 0.0}}],
        "loads": []
    }
    
    try:
        response = requests.post(f"{SOLVER_URL}/api/v1/solve/single", json=solve_request, timeout=30)
        if response.status_code != 200:
            print(f"   ✗ Solve failed ({response.status_code}): {response.text}")
            return False
        solve_data = response.json()
        print(f"   ✓ Solved with {len(solve_data['branch_currents'])} branches")
    except requests.exceptions.RequestException as e:
        print(f"   ✗ Solve failed: {e}")
        return False
    
    # Step 2: Compute first field
    print("\n2. Computing field 1 at z=25, 50, 75...")
    field1_request = {
        "frequencies": [300e6],
        "branch_currents": solve_data["branch_currents"],
        "nodes": solve_request["nodes"],
        "edges": solve_request["edges"],
        "radii": solve_request["radii"],
        "observation_points": [[0, 0, 25], [0, 0, 50], [0, 0, 75]]
    }
    
    try:
        response = requests.post(f"{POSTPROCESSOR_URL}/api/v1/fields/near", json=field1_request, timeout=30)
        response.raise_for_status()
        field1_data = response.json()
        print(f"   ✓ Computed {field1_data['num_points']} points")
        print(f"   E-field magnitudes: {[f'{m:.4f}' for m in field1_data['E_magnitudes'][:3]]}")
    except requests.exceptions.RequestException as e:
        print(f"   ✗ Field 1 failed: {e}")
        return False
    
    # Step 3: Compute second field (different observation points)
    print("\n3. Computing field 2 at x=10...")
    field2_request = {
        **field1_request,
        "observation_points": [[10, 0, 25], [10, 0, 50], [10, 0, 75]]
    }
    
    try:
        response = requests.post(f"{POSTPROCESSOR_URL}/api/v1/fields/near", json=field2_request, timeout=30)
        response.raise_for_status()
        field2_data = response.json()
        print(f"   ✓ Computed {field2_data['num_points']} points")
        print(f"   E-field magnitudes: {[f'{m:.4f}' for m in field2_data['E_magnitudes'][:3]]}")
    except requests.exceptions.RequestException as e:
        print(f"   ✗ Field 2 failed: {e}")
        return False
    
    # Step 4: Verify fields are different
    print("\n4. Verifying incremental computation...")
    if field1_data['E_magnitudes'] == field2_data['E_magnitudes']:
        print("   ✗ Fields should be different at different observation points")
        return False
    print("   ✓ Field results are different (incremental computation working)")
    
    # Step 5: Compute directivity with custom discretization
    print("\n5. Computing directivity (25×50 points)...")
    directivity_request = {
        "frequencies": [300e6],
        "branch_currents": solve_data["branch_currents"],
        "nodes": solve_request["nodes"],
        "edges": solve_request["edges"],
        "radii": solve_request["radii"],
        "theta_points": 25,
        "phi_points": 50
    }
    
    try:
        response = requests.post(f"{POSTPROCESSOR_URL}/api/v1/fields/far", json=directivity_request, timeout=30)
        response.raise_for_status()
        directivity_data = response.json()
        print(f"   ✓ Directivity: {directivity_data['directivity']:.2f} dBi")
        print(f"   ✓ Gain: {directivity_data['gain']:.2f} dBi")
        print(f"   ✓ Efficiency: {directivity_data['efficiency']:.1%}")
        print(f"   ✓ Pattern points: {len(directivity_data['theta_angles'])} × {len(directivity_data['phi_angles'])}")
    except requests.exceptions.RequestException as e:
        print(f"   ✗ Directivity failed: {e}")
        return False
    
    # Step 6: Verify discretization
    print("\n6. Verifying discretization parameters...")
    if len(directivity_data['theta_angles']) != 25:
        print(f"   ✗ Expected 25 theta points, got {len(directivity_data['theta_angles'])}")
        return False
    if len(directivity_data['phi_angles']) != 50:
        print(f"   ✗ Expected 50 phi points, got {len(directivity_data['phi_angles'])}")
        return False
    print("   ✓ Custom discretization applied correctly")
    
    return True


def test_validation():
    """Test input validation."""
    
    print("\n" + "="*60)
    print("VALIDATION TESTS")
    print("="*60)
    
    # Test 1: Accept {real, imag} format
    print("\n1. Testing {real, imag} format acceptance...")
    request = {
        "frequencies": [300e6],
        "branch_currents": [[{"real": 0.5, "imag": 0.2}]],
        "nodes": [[0, 0, 0], [0, 0, 1]],
        "edges": [[0, 1]],
        "radii": [0.001],
        "observation_points": [[0, 0, 25]]
    }
    
    try:
        response = requests.post(f"{POSTPROCESSOR_URL}/api/v1/fields/near", json=request, timeout=10)
        if response.status_code == 200:
            print("   ✓ Accepts {real, imag} dict format")
            return True
        else:
            print(f"   ✗ Rejected with status {response.status_code}: {response.text}")
            return False
    except requests.exceptions.RequestException as e:
        print(f"   ✗ Request failed: {e}")
        return False


def test_service_health():
    """Test that services are running and responsive."""
    
    print("\n" + "="*60)
    print("SERVICE HEALTH CHECK")
    print("="*60)
    
    services = [
        ("Solver", f"{SOLVER_URL}/docs"),
        ("Postprocessor", f"{POSTPROCESSOR_URL}/docs")
    ]
    
    all_healthy = True
    for name, url in services:
        try:
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                print(f"   ✓ {name} service: OK")
            else:
                print(f"   ⚠ {name} service returned {response.status_code}")
                all_healthy = False
        except requests.exceptions.RequestException as e:
            print(f"   ✗ {name} service: NOT RESPONDING ({e})")
            all_healthy = False
    
    return all_healthy


def main():
    print("\n" + "🚀 "*20)
    print("BACKEND INTEGRATION TESTS")
    print("🚀 "*20)
    
    # Note: Services should be running on ports 8002 and 8003
    print("\nAssuming services are running on:")
    print(f"   Solver: {SOLVER_URL}")
    print(f"   Postprocessor: {POSTPROCESSOR_URL}")
    
    # Run tests
    results = []
    results.append(("Incremental Field Computation", test_incremental_field_computation()))
    results.append(("Validation", test_validation()))
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        color = "green" if result else "red"
        print(f"   {status:10} {name}")
    
    print(f"\n   {passed}/{total} tests passed")
    
    if passed == total:
        print("\n" + "🎉 "*20)
        print("ALL TESTS PASSED!")
        print("🎉 "*20)
        return 0
    else:
        print("\n" + "❌ "*20)
        print("SOME TESTS FAILED")
        print("❌ "*20)
        return 1


if __name__ == "__main__":
    sys.exit(main())
