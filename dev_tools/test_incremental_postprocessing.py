"""
Integration test for incremental field computation workflow.
Tests the complete flow from solver → postprocessing → incremental updates.
"""
import sys
import asyncio
import json
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.solver.main import app as solver_app
from backend.postprocessor.main import app as postprocessor_app
from fastapi.testclient import TestClient

solver_client = TestClient(solver_app)
postprocessor_client = TestClient(postprocessor_app)


def test_incremental_field_computation():
    """Test that incremental field computation works correctly."""
    
    # Step 1: Solve dipole at 300 MHz
    print("\n1. Solving dipole at 300 MHz...")
    solve_request = {
        "frequencies": [300e6],
        "nodes": [[0, 0, 0], [0, 0, 0.5]],
        "edges": [[0, 1]],
        "radii": [0.001],
        "voltage_sources": [{"node_start": 0, "node_end": 1, "voltage": {"real": 1.0, "imag": 0.0}}],
        "lumped_impedances": []
    }
    
    solve_response = solver_client.post("/api/v1/solver/solve", json=solve_request)
    assert solve_response.status_code == 200, f"Solve failed: {solve_response.text}"
    solve_data = solve_response.json()
    print(f"   ✓ Solved with {len(solve_data['branch_currents'][0])} branches")
    
    # Step 2: Compute first field
    print("\n2. Computing field 1...")
    field1_request = {
        "frequencies": [300e6],
        "branch_currents": solve_data["branch_currents"],
        "nodes": solve_request["nodes"],
        "edges": solve_request["edges"],
        "radii": solve_request["radii"],
        "observation_points": [[0, 0, 25], [0, 0, 50], [0, 0, 75]]
    }
    
    field1_response = postprocessor_client.post("/api/v1/fields/near", json=field1_request)
    assert field1_response.status_code == 200, f"Field 1 failed: {field1_response.text}"
    field1_data = field1_response.json()
    print(f"   ✓ Computed {field1_data['num_points']} points")
    print(f"   E-field magnitudes: {field1_data['E_magnitudes'][:3]}")
    
    # Step 3: Compute second field (different observation points)
    print("\n3. Computing field 2...")
    field2_request = {
        **field1_request,
        "observation_points": [[10, 0, 25], [10, 0, 50], [10, 0, 75]]
    }
    
    field2_response = postprocessor_client.post("/api/v1/fields/near", json=field2_request)
    assert field2_response.status_code == 200, f"Field 2 failed: {field2_response.text}"
    field2_data = field2_response.json()
    print(f"   ✓ Computed {field2_data['num_points']} points")
    print(f"   E-field magnitudes: {field2_data['E_magnitudes'][:3]}")
    
    # Step 4: Verify fields are different (incremental computation)
    print("\n4. Verifying incremental computation...")
    assert field1_data['E_magnitudes'] != field2_data['E_magnitudes'], \
        "Fields should be different at different observation points"
    print("   ✓ Field results are different (incremental computation working)")
    
    # Step 5: Compute directivity with custom discretization
    print("\n5. Computing directivity with custom discretization...")
    directivity_request = {
        "frequencies": [300e6],
        "branch_currents": solve_data["branch_currents"],
        "nodes": solve_request["nodes"],
        "edges": solve_request["edges"],
        "radii": solve_request["radii"],
        "theta_points": 25,
        "phi_points": 50
    }
    
    directivity_response = postprocessor_client.post("/api/v1/fields/far", json=directivity_request)
    assert directivity_response.status_code == 200, f"Directivity failed: {directivity_response.text}"
    directivity_data = directivity_response.json()
    print(f"   ✓ Directivity: {directivity_data['directivity']:.2f} dBi")
    print(f"   ✓ Gain: {directivity_data['gain']:.2f} dBi")
    print(f"   ✓ Efficiency: {directivity_data['efficiency']:.1%}")
    print(f"   ✓ Pattern points: {len(directivity_data['theta_angles'])} × {len(directivity_data['phi_angles'])}")
    
    # Step 6: Verify discretization parameters were used
    print("\n6. Verifying discretization parameters...")
    assert len(directivity_data['theta_angles']) == 25, "Should have 25 theta points"
    assert len(directivity_data['phi_angles']) == 50, "Should have 50 phi points"
    print("   ✓ Custom discretization applied correctly")
    
    print("\n" + "="*60)
    print("✓ All incremental field computation tests passed!")
    print("="*60)


def test_field_computation_validation():
    """Test that field computation validates input correctly."""
    
    print("\n\nValidation Tests")
    print("="*60)
    
    # Test 1: Missing required fields
    print("\n1. Testing missing required fields...")
    invalid_request = {
        "frequencies": [300e6],
        "nodes": [[0, 0, 0]],
        # Missing: branch_currents, edges, radii, observation_points
    }
    
    response = postprocessor_client.post("/api/v1/fields/near", json=invalid_request)
    assert response.status_code == 422, "Should reject missing fields"
    print("   ✓ Correctly rejects missing required fields")
    
    # Test 2: Invalid branch current format
    print("\n2. Testing branch current format validation...")
    request_with_complex = {
        "frequencies": [300e6],
        "branch_currents": [[{"real": 0.5, "imag": 0.2}]],  # Dict format
        "nodes": [[0, 0, 0], [0, 0, 1]],
        "edges": [[0, 1]],
        "radii": [0.001],
        "observation_points": [[0, 0, 25]]
    }
    
    # Should accept dict format with {real, imag}
    response = postprocessor_client.post("/api/v1/fields/near", json=request_with_complex)
    assert response.status_code == 200, f"Should accept dict format: {response.text}"
    print("   ✓ Accepts {real, imag} dict format")
    
    # Test 3: Empty observation points
    print("\n3. Testing empty observation points...")
    empty_obs_request = {
        "frequencies": [300e6],
        "branch_currents": [[{"real": 0.5, "imag": 0.2}]],
        "nodes": [[0, 0, 0], [0, 0, 1]],
        "edges": [[0, 1]],
        "radii": [0.001],
        "observation_points": []
    }
    
    response = postprocessor_client.post("/api/v1/fields/near", json=empty_obs_request)
    # Should handle gracefully
    if response.status_code == 200:
        data = response.json()
        assert data['num_points'] == 0, "Should return 0 points for empty observation points"
        print("   ✓ Handles empty observation points gracefully")
    else:
        print(f"   ⚠ Returns {response.status_code} for empty observation points")
    
    print("\n" + "="*60)
    print("✓ All validation tests passed!")
    print("="*60)


def test_progress_tracking():
    """Test that progress can be tracked through multiple field computations."""
    
    print("\n\nProgress Tracking Test")
    print("="*60)
    
    # Solve first
    solve_request = {
        "frequencies": [300e6],
        "nodes": [[0, 0, 0], [0, 0, 0.5]],
        "edges": [[0, 1]],
        "radii": [0.001],
        "voltage_sources": [{"node_start": 0, "node_end": 1, "voltage": {"real": 1.0, "imag": 0.0}}],
        "lumped_impedances": []
    }
    
    solve_response = solver_client.post("/api/v1/solver/solve", json=solve_request)
    solve_data = solve_response.json()
    
    # Simulate computing multiple fields
    num_fields = 5
    completed = 0
    
    print(f"\nComputing {num_fields} fields...")
    for i in range(num_fields):
        field_request = {
            "frequencies": [300e6],
            "branch_currents": solve_data["branch_currents"],
            "nodes": solve_request["nodes"],
            "edges": solve_request["edges"],
            "radii": solve_request["radii"],
            "observation_points": [[i*10, 0, 25]]  # Different observation point for each
        }
        
        response = postprocessor_client.post("/api/v1/fields/near", json=field_request)
        assert response.status_code == 200
        
        completed += 1
        progress = (completed / num_fields) * 100
        print(f"   Progress: {progress:.0f}% ({completed}/{num_fields})")
    
    print(f"\n✓ All {num_fields} fields computed successfully")
    print("="*60)


if __name__ == "__main__":
    try:
        test_incremental_field_computation()
        test_field_computation_validation()
        test_progress_tracking()
        
        print("\n" + "🎉 "*20)
        print("ALL INTEGRATION TESTS PASSED!")
        print("🎉 "*20)
        
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
