"""
Quick test for far-field postprocessor endpoint
"""
import requests
import json

url = "http://localhost:8004/api/fields/far"

# Simple test data
data = {
    "frequencies": [299792458.0],
    "branch_currents": [
        ["0.008+0.001j"]  # Only 1 current for 1 edge
    ],
    "nodes": [
        [0, 0, 0.025],
        [0, 0, 0.075]
    ],
    "edges": [
        [1, 2]  # 1-based indexing!
    ],
    "radii": [0.001],
    "theta_points": 5,
    "phi_points": 5
}

print("Sending request to:", url)
print("Data:", json.dumps(data, indent=2))

try:
    response = requests.post(url, json=data, timeout=10)
    print(f"\nStatus: {response.status_code}")
    if response.status_code == 200:
        result = response.json()
        print("Success!")
        print(f"Directivity: {result['directivity']:.2f} dBi")
    else:
        print("Error response:")
        print(response.text)
except Exception as e:
    print(f"Exception: {e}")
