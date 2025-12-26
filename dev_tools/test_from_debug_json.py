"""Send the exact request from the failing integration test"""
import requests
import json

url = "http://localhost:8004/api/v1/fields/far"

with open('farfield_request_debug.json', 'r') as f:
    data = json.load(f)

print(f"Loading request from farfield_request_debug.json...")
print(f"Nodes: {len(data['nodes'])}, Edges: {len(data['edges'])}, Currents: {len(data['branch_currents'][0])}")

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
