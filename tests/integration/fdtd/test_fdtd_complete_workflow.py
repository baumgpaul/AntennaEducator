"""
FDTD Integration: Complete Workflow
====================================
End-to-end tests covering the full lifecycle:
  Create geometry → Validate → Build mesh → Solve → Extract fields → Compute energy
"""

import pytest
from fastapi.testclient import TestClient

from backend.fdtd_postprocessor.main import app as postprocessor_app
from backend.fdtd_preprocessor.main import app as preprocessor_app
from backend.solver_fdtd.main import app as solver_app

preprocessor = TestClient(preprocessor_app)
solver = TestClient(solver_app)
postprocessor = TestClient(postprocessor_app)


@pytest.mark.critical
class TestCompleteWorkflow1D:
    """Full 1-D FDTD workflow: validate → mesh → solve → postprocess."""

    def test_full_1d_workflow(self):
        """
        1) Define geometry with a source and probe
        2) Validate setup is stable
        3) Generate mesh and confirm grid dimensions
        4) Run solver
        5) Extract field snapshot from final state
        6) Verify physics: pulse propagation, probe detection
        """
        domain_size = [0.5, 0.01, 0.01]
        cell_size = [0.005, 0.01, 0.01]
        config = {"num_time_steps": 400, "courant_number": 0.99}

        # --- 1. Validate ---
        val_body = {
            "geometry": {"domain_size": domain_size, "cell_size": cell_size},
            "config": config,
        }
        r = preprocessor.post("/api/fdtd/validate", json=val_body)
        assert r.status_code == 200
        val = r.json()
        assert val["valid"] is True
        assert val["nx"] == 100

        # --- 2. Mesh ---
        mesh_body = {
            "geometry": {
                "domain_size": domain_size,
                "cell_size": cell_size,
                "structures": [],
                "sources": [],
            }
        }
        r = preprocessor.post("/api/fdtd/mesh", json=mesh_body)
        assert r.status_code == 200
        mesh = r.json()
        assert mesh["nx"] == 100
        assert mesh["total_cells"] > 0

        # --- 3. Solve ---
        solve_req = {
            "dimensionality": "1d",
            "domain_size": domain_size,
            "cell_size": cell_size,
            "structures": [],
            "sources": [
                {
                    "name": "gaussian",
                    "type": "gaussian_pulse",
                    "position": [0.15, 0.0, 0.0],
                    "parameters": {"amplitude": 1.0, "width": 30},
                    "polarization": "z",
                }
            ],
            "boundaries": {
                "x_min": {"type": "mur_abc"},
                "x_max": {"type": "mur_abc"},
                "y_min": {"type": "mur_abc"},
                "y_max": {"type": "mur_abc"},
                "z_min": {"type": "mur_abc"},
                "z_max": {"type": "mur_abc"},
            },
            "probes": [
                {
                    "name": "farfield",
                    "type": "point",
                    "position": [0.35, 0.0, 0.0],
                    "fields": ["Ez"],
                }
            ],
            "config": config,
        }
        r = solver.post("/api/fdtd/solve", json=solve_req)
        assert r.status_code == 200
        solve = r.json()
        assert solve["total_time_steps"] == 400
        assert solve["dt"] > 0

        # Probe detected the pulse
        probe = solve["probe_data"][0]
        assert probe["name"] == "farfield"
        peak = max(abs(v) for v in probe["values"])
        assert peak > 0.01

        # --- 4. Field snapshot ---
        ez_final = solve["fields_final"]["Ez"]
        r = postprocessor.post(
            "/api/fdtd/fields/extract",
            json={"field_component": "Ez", "field_data": ez_final, "dx": 0.005},
        )
        assert r.status_code == 200
        snap = r.json()
        assert snap["field_component"] == "Ez"
        assert len(snap["x_coords"]) == len(snap["values"])

        # --- 5. Poynting vector ---
        r = postprocessor.post(
            "/api/fdtd/energy",
            json={
                "e_fields": {"Ez": ez_final},
                "h_fields": {"Hy": solve["fields_final"]["Hy"]},
                "dx": 0.005,
            },
        )
        assert r.status_code == 200
        energy = r.json()
        assert energy["total_power"] >= 0
        assert len(energy["magnitude"]) > 0


@pytest.mark.critical
class TestCompleteWorkflow2D:
    """Full 2-D TM FDTD workflow: validate → mesh → solve → postprocess."""

    def test_full_2d_tm_workflow(self):
        """
        Complete 2-D TM mode pipeline with structure.
        """
        lx, ly = 0.15, 0.15
        dx, dy = 0.005, 0.005
        config = {"num_time_steps": 200, "courant_number": 0.5}

        # --- 1. Validate ---
        val_body = {
            "geometry": {"domain_size": [lx, ly, 0.01], "cell_size": [dx, dy, 0.01]},
            "config": config,
        }
        r = preprocessor.post("/api/fdtd/validate", json=val_body)
        assert r.status_code == 200
        assert r.json()["valid"] is True

        # --- 2. Mesh with structure ---
        mesh_body = {
            "geometry": {
                "domain_size": [lx, ly, 0.01],
                "cell_size": [dx, dy, 0.01],
                "structures": [
                    {
                        "name": "metal_strip",
                        "type": "box",
                        "position": [lx / 2, ly / 2, 0.0],
                        "dimensions": {"size_x": 0.02, "size_y": 0.06, "size_z": 0.01},
                        "material": "copper",
                    }
                ],
                "sources": [],
            }
        }
        r = preprocessor.post("/api/fdtd/mesh", json=mesh_body)
        assert r.status_code == 200
        mesh = r.json()
        assert mesh["structures_applied"] == 1

        # --- 3. Solve ---
        solve_req = {
            "dimensionality": "2d",
            "domain_size": [lx, ly, 0.01],
            "cell_size": [dx, dy, 0.01],
            "structures": [
                {
                    "name": "metal_strip",
                    "type": "box",
                    "position": [lx / 2, ly / 2, 0.0],
                    "dimensions": {"size_x": 0.02, "size_y": 0.06, "size_z": 0.01},
                    "material": "copper",
                }
            ],
            "sources": [
                {
                    "name": "excitation",
                    "type": "gaussian_pulse",
                    "position": [0.02, ly / 2, 0.0],
                    "parameters": {"amplitude": 1.0, "width": 15},
                    "polarization": "z",
                }
            ],
            "boundaries": {
                "x_min": {"type": "mur_abc"},
                "x_max": {"type": "mur_abc"},
                "y_min": {"type": "mur_abc"},
                "y_max": {"type": "mur_abc"},
                "z_min": {"type": "mur_abc"},
                "z_max": {"type": "mur_abc"},
            },
            "probes": [
                {
                    "name": "observation",
                    "type": "point",
                    "position": [lx * 0.8, ly / 2, 0.0],
                    "fields": ["Ez"],
                }
            ],
            "config": config,
            "mode": "tm",
        }
        r = solver.post("/api/fdtd/solve", json=solve_req)
        assert r.status_code == 200
        solve = r.json()
        assert solve["dimensionality"] == "2d"
        assert solve["mode"] == "tm"

        # --- 4. Field snapshot ---
        ez_final = solve["fields_final"]["Ez"]
        r = postprocessor.post(
            "/api/fdtd/fields/extract",
            json={"field_component": "Ez", "field_data": ez_final, "dx": dx, "dy": dy},
        )
        assert r.status_code == 200
        snap = r.json()
        assert len(snap["x_coords"]) > 0
        assert len(snap["y_coords"]) > 0

        # --- 5. Poynting vector ---
        r = postprocessor.post(
            "/api/fdtd/energy",
            json={
                "e_fields": {"Ez": ez_final},
                "h_fields": {
                    "Hx": solve["fields_final"]["Hx"],
                    "Hy": solve["fields_final"]["Hy"],
                },
                "dx": dx,
                "dy": dy,
            },
        )
        assert r.status_code == 200
        energy = r.json()
        assert energy["total_power"] >= 0


class TestCompleteWorkflow2DTE:
    """Full 2-D TE mode workflow."""

    def test_full_2d_te_workflow(self):
        """TE mode: Hz, Ex, Ey fields."""
        lx, ly = 0.1, 0.1
        dx, dy = 0.005, 0.005

        solve_req = {
            "dimensionality": "2d",
            "domain_size": [lx, ly, 0.01],
            "cell_size": [dx, dy, 0.01],
            "structures": [],
            "sources": [
                {
                    "name": "center",
                    "type": "gaussian_pulse",
                    "position": [lx / 2, ly / 2, 0.0],
                    "parameters": {"amplitude": 1.0, "width": 20},
                    "polarization": "z",
                }
            ],
            "boundaries": {
                "x_min": {"type": "mur_abc"},
                "x_max": {"type": "mur_abc"},
                "y_min": {"type": "mur_abc"},
                "y_max": {"type": "mur_abc"},
                "z_min": {"type": "mur_abc"},
                "z_max": {"type": "mur_abc"},
            },
            "probes": [
                {
                    "name": "corner",
                    "type": "point",
                    "position": [lx * 0.75, ly * 0.75, 0.0],
                    "fields": ["Hz"],
                }
            ],
            "config": {"num_time_steps": 150, "courant_number": 0.5},
            "mode": "te",
        }
        r = solver.post("/api/fdtd/solve", json=solve_req)
        assert r.status_code == 200
        data = r.json()
        assert data["mode"] == "te"
        assert "Hz" in data["fields_final"]

        # Probe should have recorded something
        probe = data["probe_data"][0]
        peak = max(abs(v) for v in probe["values"])
        assert peak > 0.001
