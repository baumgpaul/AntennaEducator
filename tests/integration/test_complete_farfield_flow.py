"""
Test the complete flow: solve with multi-antenna, then compute far-field.

Requires solver (port 8002) and postprocessor (port 8003) services running.
"""

import numpy as np
import pytest
import requests

SOLVER_URL = "http://localhost:8002"
POSTPROCESSOR_URL = "http://localhost:8003"


def _solver_available() -> bool:
    try:
        requests.get(f"{SOLVER_URL}/health", timeout=2)
        return True
    except Exception:
        return False


@pytest.mark.skipif(not _solver_available(), reason="Solver service not running on port 8002")
def test_complete_dipole_farfield_flow():
    """Test complete flow from solve to far-field computation"""

    # Step 1: Solve dipole with multi-antenna solver
    print("\nStep 1: Solving dipole...")

    solve_request = {
        "frequency": 299.792458e6,
        "antennas": [
            {
                "antenna_id": "upper",
                "nodes": [[0, 0, z] for z in np.linspace(0.025, 0.225, 5).tolist()],
                "edges": [[i, i + 1] for i in range(1, 5)],
                "radii": [0.001] * 4,
                "voltage_sources": [{"node_start": 0, "node_end": 1, "value": 1.0, "R": 0.0}],
                "current_sources": [],
                "loads": [],
            },
            {
                "antenna_id": "lower",
                "nodes": [[0, 0, z] for z in np.linspace(-0.025, -0.225, 5).tolist()],
                "edges": [[i, i + 1] for i in range(1, 5)],
                "radii": [0.001] * 4,
                "voltage_sources": [{"node_start": 0, "node_end": 1, "value": -1.0, "R": 0.0}],
                "current_sources": [],
                "loads": [],
            },
        ],
        "config": {"gauss_order": 6},
    }

    response = requests.post(f"{SOLVER_URL}/api/solve/multi", json=solve_request, timeout=30)
    assert response.status_code == 200, f"Solver failed: {response.text}"

    solve_result = response.json()
    print(f"  [OK] Solved: Z = {solve_result['antenna_solutions'][0]['input_impedance']}")

    # Step 2: Prepare geometry for far-field (combine both antennas, 1-based edges)
    print("\nStep 2: Preparing far-field request...")

    all_nodes = []
    for ant in solve_request["antennas"]:
        all_nodes.extend(ant["nodes"])

    all_edges = []
    # Upper edges: 1-5
    for i in range(1, 5):
        all_edges.append([i, i + 1])
    # Lower edges: 6-10
    for i in range(6, 10):
        all_edges.append([i, i + 1])

    all_radii = [0.001] * 8

    all_currents = []
    all_currents.extend(solve_result["antenna_solutions"][0]["branch_currents"])
    all_currents.extend(solve_result["antenna_solutions"][1]["branch_currents"])

    print(f"  Total nodes: {len(all_nodes)}")
    print(f"  Total edges: {len(all_edges)}")
    print(f"  Total currents: {len(all_currents)}")
    print(f"  Current types: {[type(c) for c in all_currents[:3]]}")
    print(f"  First few currents: {all_currents[:3]}")

    # Step 3: Compute far-field
    print("\nStep 3: Computing far-field...")

    farfield_request = {
        "frequencies": [299.792458e6],
        "branch_currents": [all_currents],
        "nodes": all_nodes,
        "edges": all_edges,
        "radii": all_radii,
        "theta_points": 19,
        "phi_points": 37,
    }

    # Debug: save request to file
    import json

    with open("farfield_request_debug.json", "w") as f:
        json.dump(farfield_request, f, indent=2)
    print("  Saved request to farfield_request_debug.json")

    response = requests.post(
        f"{POSTPROCESSOR_URL}/api/fields/far", json=farfield_request, timeout=30
    )

    if response.status_code != 200:
        print(f"  [ERROR] Far-field failed: {response.status_code}")
        print(f"  Response: {response.text}")
        pytest.fail(f"Far-field computation failed: {response.text}")

    farfield_result = response.json()
    print(f"  [OK] Directivity: {farfield_result['directivity']:.2f} dBi")
    print(
        f"  [OK] Max direction: θ={farfield_result['max_direction'][0]:.1f}°, φ={farfield_result['max_direction'][1]:.1f}°"
    )

    # Step 4: Validate
    print("\nStep 4: Validating...")
    expected_directivity = 2.15
    error = abs(farfield_result["directivity"] - expected_directivity)
    print(f"  Expected: {expected_directivity} dBi")
    print(f"  Computed: {farfield_result['directivity']:.2f} dBi")
    print(f"  Error: {error:.2f} dB")

    assert error < 1.0, f"Directivity error {error:.2f} dB exceeds 1 dB"
    print("  [OK] Within tolerance!")

    print("\n[SUCCESS] Complete flow test PASSED")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
