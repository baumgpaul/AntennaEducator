"""Test far-field with full dipole geometry (10 nodes, 8 edges)"""
import requests
import json

# This mimics the integration test data
url = "http://localhost:8004/api/fields/far"

# Geometry from combined dipole (2 monopoles)
nodes = [
    [0.0, 0.0, 0.05],   # Node 1
    [0.0, 0.0, 0.0375], # Node 2
    [0.0, 0.0, 0.025],  # Node 3
    [0.0, 0.0, 0.0125], # Node 4
    [0.0, 0.0, 0.0],    # Node 5 (feed point)
    [0.0, 0.0, -0.0125],# Node 6
    [0.0, 0.0, -0.025], # Node 7
    [0.0, 0.0, -0.0375],# Node 8
    [0.0, 0.0, -0.05],  # Node 9
    [0.0, 0.0, -0.05]   # Node 10 (duplicate of 9)
]

edges = [
    [1, 2],   # Edge 1
    [2, 3],   # Edge 2
    [3, 4],   # Edge 3
    [4, 5],   # Edge 4
    [5, 6],   # Edge 5
    [6, 7],   # Edge 6
    [7, 8],   # Edge 7
    [8, 9]    # Edge 8
]

# Example currents (8 complex values, one per edge)
branch_currents = [[
    "0.008+0.001j",
    "0.008+0.001j",
    "0.008+0.001j",
    "0.008+0.001j",
    "0.008+0.001j",
    "0.008+0.001j",
    "0.008+0.001j",
    "0.008+0.001j"
]]

data = {
    "frequencies": [299792458.0],
    "branch_currents": branch_currents,
    "nodes": nodes,
    "edges": edges,
    "radii": [0.001] * 8,
    "theta_points": 19,
    "phi_points": 37
}

print(f"Sending request to: {url}")
print(f"Nodes: {len(nodes)}, Edges: {len(edges)}, Currents: {len(branch_currents[0])}")

try:
    response = requests.post(url, json=data, timeout=30)
    print(f"\nStatus: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"Success!")
        print(f"Directivity: {result['directivity']:.2f} dBi")
        print(f"Max direction: θ={result['max_direction'][0]:.1f}°, φ={result['max_direction'][1]:.1f}°")
    else:
        print(f"Error response:")
        print(response.text)
except Exception as e:
    print(f"Exception: {e}")
