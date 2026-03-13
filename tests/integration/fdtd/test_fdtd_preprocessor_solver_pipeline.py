"""
FDTD Integration: Preprocessor → Solver Pipeline
==================================================
Tests that validate mesh generation flows correctly into the solver,
including structure painting and boundary condition propagation.
"""

from fastapi.testclient import TestClient

from backend.fdtd_preprocessor.main import app as preprocessor_app
from backend.solver_fdtd.main import app as solver_app

preprocessor = TestClient(preprocessor_app)
solver = TestClient(solver_app)


class TestPreprocessorSolverPipeline:
    """Geometry → Mesh → Solve integration."""

    def test_1d_mesh_then_solve(self):
        """Generate mesh for a 1-D domain, then solve a simulation on it."""
        # Step 1: Generate mesh
        mesh_body = {
            "geometry": {
                "domain_size": [0.5, 0.01, 0.01],
                "cell_size": [0.005, 0.01, 0.01],
                "structures": [],
                "sources": [],
            }
        }
        r = preprocessor.post("/api/fdtd/mesh", json=mesh_body)
        assert r.status_code == 200
        mesh = r.json()
        assert mesh["nx"] == 100

        # Step 2: Solve using the same geometry
        solve_body = {
            "dimensionality": "1d",
            "domain_size": [0.5, 0.01, 0.01],
            "cell_size": [0.005, 0.01, 0.01],
            "structures": [],
            "sources": [
                {
                    "name": "pulse",
                    "type": "gaussian_pulse",
                    "position": [0.25, 0.0, 0.0],
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
                    "name": "obs",
                    "type": "point",
                    "position": [0.4, 0.0, 0.0],
                    "fields": ["Ez"],
                }
            ],
            "config": {"num_time_steps": 300, "courant_number": 0.99},
        }
        r = solver.post("/api/fdtd/solve", json=solve_body)
        assert r.status_code == 200
        data = r.json()
        assert data["dimensionality"] == "1d"
        assert data["total_time_steps"] == 300
        assert len(data["probe_data"]) == 1
        peak = max(abs(v) for v in data["probe_data"][0]["values"])
        assert peak > 0.01

    def test_2d_with_structure_mesh_then_solve(self):
        """Mesh a 2-D domain with a dielectric block, then solve."""
        # Step 1: Generate mesh with structure
        mesh_body = {
            "geometry": {
                "domain_size": [0.2, 0.2, 0.01],
                "cell_size": [0.005, 0.005, 0.01],
                "structures": [
                    {
                        "name": "dielectric",
                        "type": "box",
                        "position": [0.1, 0.1, 0.0],
                        "dimensions": {"size_x": 0.04, "size_y": 0.04, "size_z": 0.01},
                        "material": "fr4",
                    }
                ],
                "sources": [],
            }
        }
        r = preprocessor.post("/api/fdtd/mesh", json=mesh_body)
        assert r.status_code == 200
        mesh = r.json()
        assert mesh["structures_applied"] == 1

        # Step 2: Solve on same geometry with the structure
        solve_body = {
            "dimensionality": "2d",
            "domain_size": [0.2, 0.2, 0.01],
            "cell_size": [0.005, 0.005, 0.01],
            "structures": [
                {
                    "name": "dielectric",
                    "type": "box",
                    "position": [0.1, 0.1, 0.0],
                    "dimensions": {"size_x": 0.04, "size_y": 0.04, "size_z": 0.01},
                    "material": "fr4",
                }
            ],
            "sources": [
                {
                    "name": "center_pulse",
                    "type": "gaussian_pulse",
                    "position": [0.05, 0.1, 0.0],
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
                    "name": "past_dielectric",
                    "type": "point",
                    "position": [0.15, 0.1, 0.0],
                    "fields": ["Ez"],
                }
            ],
            "config": {"num_time_steps": 200, "courant_number": 0.5},
            "mode": "tm",
        }
        r = solver.post("/api/fdtd/solve", json=solve_body)
        assert r.status_code == 200
        data = r.json()
        assert data["dimensionality"] == "2d"
        assert "Ez" in data["fields_final"]
        # Probe should register some activity
        peak = max(abs(v) for v in data["probe_data"][0]["values"])
        assert peak > 0.001

    def test_validation_feeds_into_solver(self):
        """Validate a setup, confirm it's stable, then solve."""
        geometry = {
            "domain_size": [0.3, 0.01, 0.01],
            "cell_size": [0.005, 0.01, 0.01],
        }
        config = {"num_time_steps": 200, "courant_number": 0.99}

        # Validate
        r = preprocessor.post(
            "/api/fdtd/validate",
            json={"geometry": geometry, "config": config},
        )
        assert r.status_code == 200
        val = r.json()
        assert val["valid"] is True
        assert val["dt"] > 0

        # Use validated dt info — solve the same setup
        solve_body = {
            "dimensionality": "1d",
            "domain_size": [0.3, 0.01, 0.01],
            "cell_size": [0.005, 0.01, 0.01],
            "structures": [],
            "sources": [
                {
                    "name": "src",
                    "type": "gaussian_pulse",
                    "position": [0.15, 0.0, 0.0],
                    "parameters": {"amplitude": 1.0, "width": 25},
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
            "probes": [],
            "config": config,
        }
        r = solver.post("/api/fdtd/solve", json=solve_body)
        assert r.status_code == 200
        data = r.json()
        # Both should produce valid positive dt (exact values may differ:
        # validator uses 3D CFL formula, solver uses 1D formula)
        assert data["dt"] > 0
        assert val["dt"] > 0
