"""Direct HTTP test of solver API."""
import requests
import json

# Start with preprocessor to get real geometry
preprocessor_url = "http://localhost:8001/api/antenna/dipole"
dipole_request = {
    "length": 1.5,
    "wire_radius": 0.001,
    "gap": 0.001,
    "segments": 10
}

print("1. Calling preprocessor...")
response = requests.post(preprocessor_url, json=dipole_request)
if response.status_code != 200:
    print(f"  ✗ Preprocessor failed: {response.text}")
    exit(1)

geometry = response.json()["mesh"]
print(f"  ✓ Got geometry: {len(geometry['nodes'])} nodes, {len(geometry['edges'])} edges")

# Now call solver
solver_url = "http://localhost:8002/api/solve/single"
solver_request = {
    "nodes": geometry["nodes"],
    "edges": geometry["edges"],
    "radii": geometry["radii"],
    "frequency": 100e6,
    "voltage_sources": [{
        "node_start": 1,
        "node_end": 12,
        "value": 1.0,
        "impedance": 50.0
    }]
}

print("\n2. Calling solver...")
print(f"   Request nodes: {len(solver_request['nodes'])}")
print(f"   Request edges: {len(solver_request['edges'])}")
print(f"   Source: nodes {solver_request['voltage_sources'][0]['node_start']} - {solver_request['voltage_sources'][0]['node_end']}")

try:
    response = requests.post(solver_url, json=solver_request)
    print(f"   Response status: {response.status_code}")
    print(f"   Response body: {response.text[:500]}")  # First 500 chars
    if response.status_code == 200:
        result = response.json()
        print(f"   Result keys: {list(result.keys())}")
        Z_in = complex(result["input_impedance"]["real"], result["input_impedance"]["imag"])
        print(f"  ✓ Solver success!")
        print(f"    Input impedance: {Z_in:.2f} Ω")
    else:
        print(f"  ✗ Solver failed: {response.status_code}")
        print(f"    {response.text}")
except Exception as e:
    print(f"  ✗ Exception: {e}")
    import traceback
    traceback.print_exc()
