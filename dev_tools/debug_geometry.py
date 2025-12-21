"""Quick debug script to understand geometry structure."""
import requests

PREPROCESSOR_URL = "http://localhost:8001"
API_PREFIX = "/api/v1"

# Test dipole
dipole_request = {
    "length": 1.5,
    "wire_radius": 0.001,
    "segments": 10
}

response = requests.post(
    f"{PREPROCESSOR_URL}{API_PREFIX}/antenna/dipole",
    json=dipole_request
)

if response.status_code == 200:
    data = response.json()
    mesh = data["mesh"]
    print("Dipole geometry:")
    print(f"  Nodes: {len(mesh['nodes'])}")
    print(f"  Edges: {len(mesh['edges'])}")
    print(f"  Edges: {mesh['edges']}")
    print(f"  Radii: {len(mesh['radii'])}")
    print(f"\nFirst few nodes:")
    for i, node in enumerate(mesh['nodes'][:6]):
        print(f"    Node {i}: {node}")
    print(f"  ...")
    for i, node in enumerate(mesh['nodes'][-5:], start=len(mesh['nodes'])-5):
        print(f"    Node {i}: {node}")
else:
    print(f"Error: {response.status_code}")
    print(response.text)
