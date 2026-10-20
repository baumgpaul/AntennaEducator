"""FEM service (backend/fem): endpoints, preview gate, limits, errors."""

import pytest
from fastapi.testclient import TestClient

from backend.common.auth.dependencies import get_current_user
from backend.common.auth.identity import UserIdentity, UserRole
from backend.fem.main import app

W, D = 0.1, 0.01
GEOMETRY = {
    "shapes": [{"kind": "rectangle", "name": "diel", "x": 0, "y": 0, "width": W, "height": D}],
    "selections": [
        {"name": "top", "xmin": 0, "ymin": D, "xmax": W, "ymax": D},
        {"name": "bottom", "xmin": 0, "ymin": 0, "xmax": W, "ymax": 0},
    ],
    "mesh": {"size": 0.005},
}
PROBLEM = {
    "materials": {"diel": {"name": "FR4", "relative_permittivity": 4}},
    "boundary_conditions": [
        {"type": "potential", "boundary": "top", "value": 1},
        {"type": "ground", "boundary": "bottom"},
    ],
}


def user(role):
    return UserIdentity(id="u1", email="u@x.example", username="u", role=role)


@pytest.fixture
def client():
    app.dependency_overrides[get_current_user] = lambda: user(UserRole.MAINTAINER)
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_students_cannot_use_the_preview(client):
    app.dependency_overrides[get_current_user] = lambda: user(UserRole.USER)
    assert client.post("/api/fem/mesh", json={"geometry": GEOMETRY}).status_code == 403


def test_mesh_returns_flat_arrays_and_named_regions(client):
    r = client.post("/api/fem/mesh", json={"geometry": GEOMETRY})
    assert r.status_code == 200
    m = r.json()["mesh"]
    n, t = len(m["nodes"]) // 2, len(m["triangles"]) // 3
    assert len(m["triangle_domain"]) == t == m["stats"]["triangles"] and n == m["stats"]["nodes"]
    assert m["domain_names"] == ["diel"]
    assert {"top", "bottom", "outer"} <= set(m["boundaries"])
    assert len(m["quality"]) == t


def test_solve_plate_capacitor(client):
    r = client.post("/api/fem/solve", json={"geometry": GEOMETRY, "problem": PROBLEM})
    assert r.status_code == 200, r.text
    body = r.json()
    c = 4 * 8.8541878128e-12 * W / D
    assert body["capacitance"]["from_charge"] == pytest.approx(c, rel=1e-10)
    assert len(body["potential"]) == len(body["mesh"]["nodes"]) // 2
    assert len(body["electric_field"]) == len(body["mesh"]["triangles"]) // 3 * 2
    assert body["info"]["n_free"] + body["info"]["n_prescribed"] == body["info"]["n_nodes"]
    assert body["sparsity"]["n"] == body["info"]["n_nodes"]
    assert body["permittivity"]["diel"] == pytest.approx(4 * 8.8541878128e-12)


def test_incomplete_model_returns_the_checklist(client):
    problem = {"materials": {"diel": {"name": "FR4", "relative_permittivity": 4}}}
    r = client.post("/api/fem/solve", json={"geometry": GEOMETRY, "problem": problem})
    assert r.status_code == 422
    issues = r.json()["detail"]["issues"]
    assert any("No ground" in i["message"] and i["step"] == "physics" for i in issues)
    r = client.post("/api/fem/check", json={"geometry": GEOMETRY, "problem": problem})
    assert r.status_code == 200 and r.json()["domains"] == ["diel"]
    assert any(i["severity"] == "error" for i in r.json()["issues"])


def test_too_fine_meshes_are_refused_before_meshing(client):
    geometry = {**GEOMETRY, "mesh": {"size": 1e-5}}
    r = client.post("/api/fem/mesh", json={"geometry": geometry})
    assert r.status_code == 422 and "increase the element size" in r.json()["detail"]


def test_invalid_geometry_is_a_client_error(client):
    bad = {**GEOMETRY, "parameters": {"w": "unknown*2"}}
    assert client.post("/api/fem/mesh", json={"geometry": bad}).status_code == 422
    neg = {**GEOMETRY, "shapes": [{**GEOMETRY["shapes"][0], "width": -1}]}
    assert client.post("/api/fem/mesh", json={"geometry": neg}).status_code == 422


def test_opencfs_export_contains_the_three_files(client):
    r = client.post("/api/fem/export/opencfs", json={"geometry": GEOMETRY, "problem": PROBLEM})
    assert r.status_code == 200
    files = r.json()["files"]
    assert set(files) == {"simulation.xml", "mat.xml", "model.msh"}
    assert files["model.msh"].startswith("$MeshFormat\n2.2")
    assert '"top"' in files["model.msh"] and 'fileName="model.msh"' in files["simulation.xml"]


def test_refused_requests_are_logged_with_their_reason(client, caplog):
    import logging

    caplog.set_level(logging.INFO, logger="fem")
    bad = {**GEOMETRY, "mesh": {"size": "1,5"}}
    client.post("/api/fem/mesh", json={"geometry": bad})
    shape = {**GEOMETRY, "shapes": [{**GEOMETRY["shapes"][0], "width": [1]}]}
    client.post("/api/fem/mesh", json={"geometry": shape})
    text = caplog.text
    assert "422 /api/fem/mesh" in text and "1,5" in text  # expression error message
    assert "geometry.shapes.0.rectangle.width" in text  # schema error location
