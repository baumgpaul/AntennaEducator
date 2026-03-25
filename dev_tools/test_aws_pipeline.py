"""Quick end-to-end smoke test against AWS Lambda services.

Reads service URLs from environment variables or falls back to
frontend/.env.production when run locally.

When COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID env vars are set
together with SMOKE_TEST_USERNAME / SMOKE_TEST_PASSWORD, the script
authenticates via Cognito and tests the full API pipeline.  Otherwise
it runs health-check-only mode (sufficient to verify Lambdas are live).
"""

import os
import sys
from pathlib import Path

import requests

# ── Helpers ───────────────────────────────────────────────────────────────────


def _load_env_production() -> dict[str, str]:
    """Parse frontend/.env.production for VITE_* URLs."""
    env_file = Path(__file__).resolve().parent.parent / "frontend" / ".env.production"
    vals: dict[str, str] = {}
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                vals[k.strip()] = v.strip().strip('"')
    return vals


def _get_cognito_token() -> str | None:
    """Try to obtain a Cognito access token via admin auth flow (boto3).

    Returns the access token string, or None when credentials / env vars
    are not available.
    """
    pool_id = os.getenv("COGNITO_USER_POOL_ID", "")
    client_id = os.getenv("COGNITO_CLIENT_ID", "")
    username = os.getenv("SMOKE_TEST_USERNAME", "")
    password = os.getenv("SMOKE_TEST_PASSWORD", "")

    if not all([pool_id, client_id, username, password]):
        return None

    try:
        import boto3

        client = boto3.client(
            "cognito-idp",
            region_name=os.getenv("COGNITO_REGION", "eu-west-1"),
        )
        resp = client.admin_initiate_auth(
            UserPoolId=pool_id,
            ClientId=client_id,
            AuthFlow="ADMIN_NO_SRP_AUTH",
            AuthParameters={
                "USERNAME": username,
                "PASSWORD": password,
            },
        )
        return resp["AuthenticationResult"]["AccessToken"]
    except Exception as exc:
        print(f"  [auth] Could not obtain Cognito token: {exc}")
        return None


# ── Config ────────────────────────────────────────────────────────────────────

_env = _load_env_production()

PREPROCESSOR = os.getenv("PREPROCESSOR_URL", _env.get("VITE_PREPROCESSOR_URL", ""))
SOLVER = os.getenv("SOLVER_URL", _env.get("VITE_SOLVER_URL", ""))
POSTPROCESSOR = os.getenv("POSTPROCESSOR_URL", _env.get("VITE_POSTPROCESSOR_URL", ""))
PROJECTS = os.getenv("PROJECTS_URL", _env.get("VITE_PROJECTS_URL", ""))


# ── Main ──────────────────────────────────────────────────────────────────────


def main():
    errors = []

    # 0. Health checks (unauthenticated — always run)
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

    # Try to get an auth token for the API tests
    print("\n=== Authentication ===")
    token = _get_cognito_token()
    if token:
        print("  Authenticated via Cognito — running full API tests.")
        headers = {"Authorization": f"Bearer {token}"}
    else:
        print("  No credentials available — skipping authenticated API tests.")
        print("  Set COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID,")
        print("  SMOKE_TEST_USERNAME, SMOKE_TEST_PASSWORD to enable.")
        headers = None

    # 1. Preprocessor
    if headers:
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
                headers=headers,
                timeout=30,
            )
            r.raise_for_status()
            mesh_resp = r.json()
            mesh = mesh_resp["mesh"]
            print(f"  OK: {len(mesh['nodes'])} nodes, {len(mesh['edges'])} edges")
        except Exception as e:
            print(f"  FAILED: {e}")
            errors.append("preprocessor")

    # 2. Solver
    if headers and "preprocessor" not in errors:
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
            r = requests.post(
                f"{SOLVER}/api/solve/multi",
                json=solve_req,
                headers=headers,
                timeout=60,
            )
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

    # 3. Postprocessor
    if headers and "solver" not in errors and "preprocessor" not in errors:
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
            r = requests.post(
                f"{POSTPROCESSOR}/api/fields/far",
                json=ff_req,
                headers=headers,
                timeout=60,
            )
            if r.status_code != 200:
                print(f"  Response: {r.text[:300]}")
            r.raise_for_status()
            ff = r.json()
            print(f"  OK: directivity={ff.get('directivity', '?')} dBi")
            print(f"  gain={ff.get('gain', '?')} dBi, " f"efficiency={ff.get('efficiency', '?')}")
        except Exception as e:
            print(f"  FAILED: {e}")
            errors.append("postprocessor")

    # Summary
    print("\n" + "=" * 50)
    if errors:
        print(f"FAILURES: {', '.join(errors)}")
        sys.exit(1)
    elif not headers:
        print("HEALTH CHECKS OK — API tests skipped (no auth credentials).")
    else:
        print("ALL AWS SERVICES OK — Full pipeline verified!")


if __name__ == "__main__":
    main()
