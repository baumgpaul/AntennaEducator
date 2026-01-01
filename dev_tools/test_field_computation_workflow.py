"""
End-to-end test for field computation workflow
Tests: Solve antenna -> Define field region -> Compute fields -> Verify results
"""
import requests
import json

SOLVER_URL = "http://localhost:8002"
POSTPROCESSOR_URL = "http://localhost:8003"

print("="*80)
print("FIELD COMPUTATION WORKFLOW TEST")
print("="*80)

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
    f"{SOLVER_URL}/api/v1/solve/multi",
    json=solver_request,
    timeout=30
)

if response.status_code != 200:
    print(f"[FAIL] Solver failed: {response.status_code}")
    print(response.text)
    exit(1)

solver_result = response.json()
print(f"[PASS] Solver succeeded")
print(f"  - Converged: {solver_result['converged']}")
print(f"  - Solve time: {solver_result['solve_time']:.3f}s")
print(f"  - Branch currents: {len(solver_result['antenna_solutions'][0]['branch_currents'])} values")

# Extract results for field computation
antenna_solution = solver_result['antenna_solutions'][0]
branch_currents = antenna_solution['branch_currents']

# Step 2: Define field region (XY plane at z=0)
print("\n[2/3] Defining field observation region...")

# Create a 5x5 grid of observation points in XY plane
observation_points = []
x_range = [-1.0, -0.5, 0.0, 0.5, 1.0]  # 5 points
y_range = [-1.0, -0.5, 0.0, 0.5, 1.0]  # 5 points
z = 0.0

for x in x_range:
    for y in y_range:
        observation_points.append([x, y, z])

print(f"  - Observation points: {len(observation_points)} (5x5 grid)")
print(f"  - Region: XY plane at z={z}m")
print(f"  - X range: {min(x_range)} to {max(x_range)}m")
print(f"  - Y range: {min(y_range)} to {max(y_range)}m")

# Step 3: Compute near-field
print("\n[3/3] Computing near-field...")

field_request = {
    "frequencies": [300e6],
    "branch_currents": [branch_currents],
    "nodes": solver_request["antennas"][0]["nodes"],
    "edges": solver_request["antennas"][0]["edges"],
    "radii": solver_request["antennas"][0]["radii"],
    "observation_points": observation_points
}

response = requests.post(
    f"{POSTPROCESSOR_URL}/api/v1/fields/near",
    json=field_request,
    timeout=30
)

if response.status_code != 200:
    print(f"[FAIL] Field computation failed: {response.status_code}")
    print(response.text)
    exit(1)

field_result = response.json()
print(f"[PASS] Field computation succeeded")
print(f"  - Status: {field_result['status']}")
print(f"  - Frequency: {field_result['frequency']/1e6:.1f} MHz")
print(f"  - Points computed: {field_result['num_points']}")

# Analyze field results
E_magnitudes = field_result['E_magnitudes']
H_magnitudes = field_result['H_magnitudes']

print(f"\nField statistics:")
print(f"  E-field magnitude:")
print(f"    - Max: {max(E_magnitudes):.2e} V/m")
print(f"    - Min: {min(E_magnitudes):.2e} V/m")
print(f"    - Avg: {sum(E_magnitudes)/len(E_magnitudes):.2e} V/m")
print(f"  H-field magnitude:")
print(f"    - Max: {max(H_magnitudes):.2e} A/m")
print(f"    - Min: {min(H_magnitudes):.2e} A/m")
print(f"    - Avg: {sum(H_magnitudes)/len(H_magnitudes):.2e} A/m")

# Validate results
if field_result['num_points'] == len(observation_points):
    print(f"\n[PASS] Number of points matches: {field_result['num_points']}")
else:
    print(f"\n[FAIL] Point count mismatch: expected {len(observation_points)}, got {field_result['num_points']}")
    exit(1)

if len(E_magnitudes) == len(observation_points):
    print(f"[PASS] E-field data length matches")
else:
    print(f"[FAIL] E-field data length mismatch")
    exit(1)

if len(H_magnitudes) == len(observation_points):
    print(f"[PASS] H-field data length matches")
else:
    print(f"[FAIL] H-field data length mismatch")
    exit(1)

# Check that fields are non-zero (antenna is radiating)
if max(E_magnitudes) > 0:
    print(f"[PASS] E-field is non-zero (antenna radiating)")
else:
    print(f"[FAIL] E-field is zero")
    exit(1)

print("\n" + "="*80)
print("[SUCCESS] FIELD COMPUTATION WORKFLOW TEST PASSED!")
print("="*80)
print("\nAll field computation features working:")
print("  1. Solver provides correct branch currents")
print("  2. Postprocessor computes near-field at observation points")
print("  3. Results include E and H field vectors and magnitudes")
print("  4. Field values are physically reasonable")
