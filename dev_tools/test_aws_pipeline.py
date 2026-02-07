"""Quick end-to-end smoke test against AWS Lambda services."""

import json
import sys

import requests

PREPROCESSOR = "https://xfwks3en2lvlj5iepkgh7x2ioy0gpbpz.lambda-url.eu-west-1.on.aws"
SOLVER = "https://znawgmfq7tzgavilfvrxw2mqqe0rgpnx.lambda-url.eu-west-1.on.aws"
POSTPROCESSOR = "https://3jkkorrflkuoquakxmphsy26u40horni.lambda-url.eu-west-1.on.aws"
PROJECTS = "https://lizbey4kcxsjtqdidcwebk6fte0hgwja.lambda-url.eu-west-1.on.aws"


def main():
    errors = []

    # 0. Health checks
    print("=== Health Checks ===")
    for name, url in [
        ("preprocessor", PREPROCESSOR),
        ("solver", SOLVER),
        ("postprocessor", POSTPROCESSOR),
        ("projects", PROJECTS),
    ]:
        try:
            r = requests.get(f"{url}/health", timeout=30)
            r.raise_for_status()
            data = r.json()
            print(f"  {name}: {data['status']} (service={data['service']})")
        except Exception as e:
            print(f"  {name}: FAILED - {e}")
            errors.append(f"{name} health")

    # 1. Preprocessor
    print("\n=== Preprocessor: /api/antenna/dipole ===")
    try:
        r = requests.post(
            f"{PREPROCESSOR}/api/antenna/dipole",
            json={
                "length": 0.5,
                "radius": 0.001,
                "segments": 10,
                "center": [0, 0, 0],
                "orientation": [0, 0, 1],
            },
            timeout=30,
        )
        r.raise_for_status()
        mesh_resp = r.json()
        mesh = mesh_resp["mesh"]
        print(f"  OK: {len(mesh['nodes'])} nodes, {len(mesh['edges'])} edges")
    except Exception as e:
        print(f"  FAILED: {e}")
        errors.append("preprocessor")
        print("Cannot continue without mesh. Exiting.")
        sys.exit(1)

    # 2. Solver
    print("\n=== Solver: /api/solve/multi ===")
    try:
        solve_req = {
            "frequency": 300e6,
            "antennas": [
                {
                    "antenna_id": "dipole1",
                    "nodes": mesh["nodes"],
                    "edges": mesh["edges"],
                    "radii": mesh["radii"],
                    "voltage_sources": [{"value": 1.0, "node_start": 5, "node_end": 6}],
                }
            ],
        }
        r = requests.post(f"{SOLVER}/api/solve/multi", json=solve_req, timeout=60)
        if r.status_code != 200:
            print(f"  Response: {r.text[:200]}")
        r.raise_for_status()
        sol = r.json()
        z = sol["antenna_solutions"][0].get("input_impedance", "N/A")
        print(f"  OK: freq={sol['frequency']} Hz, converged={sol['converged']}")
        print(f"  Z_in = {z}")
    except Exception as e:
        print(f"  FAILED: {e}")
        errors.append("solver")
        print("Cannot continue without solution. Exiting.")
        sys.exit(1)

    # 3. Postprocessor
    print("\n=== Postprocessor: /api/fields/far ===")
    try:
        ff_req = {
            "frequencies": [300e6],
            "nodes": mesh["nodes"],
            "edges": mesh["edges"],
            "radii": mesh["radii"],
            "branch_currents": [sol["antenna_solutions"][0]["branch_currents"]],
            "theta_points": 19,
            "phi_points": 37,
        }
        r = requests.post(f"{POSTPROCESSOR}/api/fields/far", json=ff_req, timeout=60)
        if r.status_code != 200:
            print(f"  Response: {r.text[:300]}")
        r.raise_for_status()
        ff = r.json()
        # Response is a RadiationPatternResponse
        print(f"  OK: directivity={ff.get('directivity', '?')} dBi")
        print(f"  gain={ff.get('gain', '?')} dBi, efficiency={ff.get('efficiency', '?')}")
    except Exception as e:
        print(f"  FAILED: {e}")
        errors.append("postprocessor")

    # Summary
    print("\n" + "=" * 50)
    if errors:
        print(f"FAILURES: {', '.join(errors)}")
        sys.exit(1)
    else:
        print("ALL AWS SERVICES OK - Full pipeline verified!")


if __name__ == "__main__":
    main()
