"""Quick test script to verify the preprocessor → solver pipeline locally."""
import requests
import json

# Auth header (local JWT with default secret)
from jose import jwt
from datetime import datetime, timedelta, timezone
TOKEN = jwt.encode(
    {'sub': 'test-user-123', 'email': 'test@test.com', 'exp': datetime.now(timezone.utc) + timedelta(hours=1)},
    'your-secret-key-change-in-production',
    algorithm='HS256'
)
HEADERS = {"Authorization": f"Bearer {TOKEN}"}

# Step 1: Generate a dipole mesh
dipole_req = {
    "length": 0.5,
    "segments": 21,
    "wire_radius": 0.001,
    "gap": 0.001,
    "center_position": [0, 0, 0],
    "orientation": [0, 0, 1],
    "source": {"type": "voltage", "amplitude": {"real": 1, "imag": 0}},
    "balanced_feed": True,
}
resp = requests.post("http://localhost:8001/api/antenna/dipole", json=dipole_req, headers=HEADERS)
print(f"Preprocessor: {resp.status_code}")
data = resp.json()
mesh = data["mesh"]
element = data.get("element", {})
sources = element.get("sources", [])
print(f"Nodes: {len(mesh['nodes'])}, Edges: {len(mesh['edges'])}, Sources: {json.dumps(sources, indent=2)}")

# Step 2: Build solver request using the same logic as frontend multiAntennaBuilder
voltage_sources = []
center_tap = [
    s
    for s in sources
    if s["type"] == "voltage" and s.get("node_start") == 0 and s.get("node_end", 0) != 0
]
print(f"Center tap sources: {len(center_tap)}")

if len(center_tap) == 2:
    s1, s2 = center_tap
    voltage_sources.append(
        {
            "node_start": s1["node_end"],
            "node_end": s2["node_end"],
            "value": 1.0,
        }
    )
elif sources:
    for s in sources:
        if s["type"] == "voltage":
            voltage_sources.append(
                {
                    "node_start": s.get("node_start", 0),
                    "node_end": s.get("node_end", 0),
                    "value": 1.0,
                }
            )

solve_req = {
    "frequency": 300e6,
    "antennas": [
        {
            "antenna_id": "dipole_1",
            "nodes": mesh["nodes"],
            "edges": mesh["edges"],
            "radii": mesh["radii"],
            "voltage_sources": voltage_sources,
            "current_sources": [],
            "loads": [],
        }
    ],
}
print(f"VS count: {len(voltage_sources)}, first VS: {voltage_sources[0] if voltage_sources else 'NONE'}")

resp2 = requests.post("http://localhost:8002/api/solve/multi", json=solve_req, headers=HEADERS)
print(f"Solver: {resp2.status_code}")
if resp2.status_code != 200:
    print(f"Error: {resp2.text}")
else:
    sol = resp2.json()
    print(f"Converged: {sol['converged']}, Solutions: {len(sol['antenna_solutions'])}")
