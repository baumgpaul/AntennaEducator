"""Quick E2E test for the refactored auth + projects API."""

import httpx
import json
import sys

BASE = "http://127.0.0.1:8010"


def main():
    client = httpx.Client(base_url=BASE, timeout=10)

    # 0. Health
    print("=== Health ===")
    r = client.get("/health")
    print(r.status_code, r.json())
    assert r.status_code == 200

    # 0b. Check routes
    print("\n=== Routes ===")
    r = client.get("/openapi.json")
    info = r.json()["info"]
    print(f"  {info['title']} v{info['version']}")
    for path in r.json()["paths"]:
        print(f"  {path}")

    # 1. Register
    print("\n=== Register ===")
    r = client.post("/api/auth/register", json={
        "email": "e2e@test.com",
        "username": "e2euser",
        "password": "SecurePass123!",
    })
    print(r.status_code, r.json())
    if r.status_code == 400 and ("exists" in r.text.lower() or "already registered" in r.text.lower()):
        print("  (user already exists, continuing)")
    else:
        assert r.status_code == 201, f"Expected 201, got {r.status_code}: {r.text}"

    # 2. Login
    print("\n=== Login ===")
    r = client.post("/api/auth/login", json={
        "email": "e2e@test.com",
        "password": "SecurePass123!",
    })
    print(r.status_code, r.json())
    assert r.status_code == 200
    token = r.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print(f"  Token: {token[:20]}...")

    # 3. /me
    print("\n=== Me ===")
    r = client.get("/api/auth/me", headers=headers)
    print(r.status_code, r.json())
    assert r.status_code == 200

    # 4. Create project
    print("\n=== Create Project ===")
    r = client.post("/api/projects", headers=headers, json={
        "name": "E2E Test Project",
        "description": "Testing the new data model",
    })
    print(r.status_code, json.dumps(r.json(), indent=2))
    assert r.status_code == 201
    project = r.json()
    project_id = project["id"]
    print(f"  Project ID: {project_id}")

    # 5. Get project
    print("\n=== Get Project ===")
    r = client.get(f"/api/projects/{project_id}", headers=headers)
    print(r.status_code, json.dumps(r.json(), indent=2))
    assert r.status_code == 200

    # 6. Update with JSON blobs
    print("\n=== Update with JSON blobs ===")
    design_state = {
        "elements": [
            {
                "type": "dipole",
                "length": 0.5,
                "radius": 0.001,
                "position": [0, 0, 0],
                "orientation": [0, 0, 1],
            }
        ],
        "version": 2,
    }
    simulation_config = {
        "method": "peec",
        "requested_fields": ["impedance", "far_field", "current_distribution"],
        "frequency_range": {"start": 250e6, "stop": 350e6, "points": 51},
    }
    simulation_results = {
        "frequency_sweep": {
            "frequencies": [300e6],
            "impedance": [{"real": 73.1, "imag": 42.5}],
        },
        "result_keys": {"far_field": "s3://bucket/results/ff.json"},
    }
    ui_state = {
        "view_configurations": [
            {"type": "impedance_chart", "title": "Impedance vs Freq"},
            {"type": "3d_pattern", "title": "Radiation Pattern"},
        ],
        "camera": {"position": [5, 5, 5], "target": [0, 0, 0]},
    }

    r = client.put(f"/api/projects/{project_id}", headers=headers, json={
        "name": "E2E Test Project (Updated)",
        "description": "Updated with full JSON blobs",
        "design_state": design_state,
        "simulation_config": simulation_config,
        "simulation_results": simulation_results,
        "ui_state": ui_state,
    })
    print(r.status_code, json.dumps(r.json(), indent=2))
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    updated = r.json()

    # 7. Verify save/load round-trip
    print("\n=== Verify Round-Trip ===")
    r = client.get(f"/api/projects/{project_id}", headers=headers)
    loaded = r.json()

    assert loaded["name"] == "E2E Test Project (Updated)"
    assert loaded["description"] == "Updated with full JSON blobs"
    assert loaded["design_state"]["elements"][0]["type"] == "dipole"
    assert loaded["design_state"]["version"] == 2
    assert loaded["simulation_config"]["method"] == "peec"
    assert loaded["simulation_config"]["requested_fields"] == [
        "impedance", "far_field", "current_distribution"
    ]
    assert loaded["simulation_results"]["frequency_sweep"]["frequencies"] == [300e6]
    assert loaded["ui_state"]["view_configurations"][0]["type"] == "impedance_chart"
    print("  ✓ All JSON blob fields round-tripped correctly!")

    # 8. List projects
    print("\n=== List Projects ===")
    r = client.get("/api/projects", headers=headers)
    projects = r.json()
    print(f"  Found {len(projects)} project(s)")
    assert any(p["id"] == project_id for p in projects)
    print("  ✓ Project appears in list")

    # 9. Duplicate project
    print("\n=== Duplicate Project ===")
    r = client.post(f"/api/projects/{project_id}/duplicate", headers=headers)
    print(r.status_code)
    assert r.status_code == 201
    dup = r.json()
    print(f"  Duplicate ID: {dup['id']}")
    assert dup["name"] == "E2E Test Project (Updated) (Copy)"
    assert dup["design_state"]["elements"][0]["type"] == "dipole"
    print("  ✓ Duplicate has correct data")

    # 10. Delete both
    print("\n=== Cleanup ===")
    for pid in [project_id, dup["id"]]:
        r = client.delete(f"/api/projects/{pid}", headers=headers)
        assert r.status_code == 204
        print(f"  ✓ Deleted {pid}")

    print("\n" + "=" * 50)
    print("✅ ALL E2E TESTS PASSED!")
    print("=" * 50)


if __name__ == "__main__":
    main()
