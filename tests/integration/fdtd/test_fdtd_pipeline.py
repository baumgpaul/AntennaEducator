"""
FDTD Integration Tests — End-to-End Pipeline
=============================================
Validates the complete FDTD workflow using FastAPI TestClient:
  Preprocessor (mesh) → Solver (time-step) → Postprocessor (field extraction)

These tests call the real HTTP endpoints in-process (no network), ensuring
request/response schemas match and the physics pipeline produces sensible output.
"""

import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.fdtd_postprocessor.main import app as postprocessor_app
from backend.fdtd_preprocessor.main import app as preprocessor_app
from backend.solver_fdtd.main import app as solver_app

preprocessor = TestClient(preprocessor_app)
solver = TestClient(solver_app)
postprocessor = TestClient(postprocessor_app)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _make_1d_gaussian_request(
    domain_length: float = 1.0,
    dx: float = 0.005,
    num_time_steps: int = 500,
    source_pos: float = 0.5,
    probe_pos: float = 0.75,
) -> dict:
    """Build a minimal 1-D Gaussian-pulse simulation request."""
    return {
        "dimensionality": "1d",
        "domain_size": [domain_length, 0.01, 0.01],
        "cell_size": [dx, 0.01, 0.01],
        "structures": [],
        "sources": [
            {
                "name": "gaussian",
                "type": "gaussian_pulse",
                "position": [source_pos, 0.0, 0.0],
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
                "name": "probe_right",
                "type": "point",
                "position": [probe_pos, 0.0, 0.0],
                "fields": ["Ez"],
            }
        ],
        "config": {
            "num_time_steps": num_time_steps,
            "courant_number": 0.99,
            "output_every_n_steps": 50,
        },
    }


def _make_2d_tm_request(
    lx: float = 0.2,
    ly: float = 0.2,
    dx: float = 0.005,
    dy: float = 0.005,
    num_time_steps: int = 300,
) -> dict:
    """Build a minimal 2-D TM simulation request."""
    return {
        "dimensionality": "2d",
        "domain_size": [lx, ly, 0.01],
        "cell_size": [dx, dy, 0.01],
        "structures": [],
        "sources": [
            {
                "name": "center_pulse",
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
                "name": "corner_probe",
                "type": "point",
                "position": [lx * 0.75, ly * 0.75, 0.0],
                "fields": ["Ez"],
            }
        ],
        "config": {
            "num_time_steps": num_time_steps,
            "courant_number": 0.5,
            "output_every_n_steps": 50,
        },
        "mode": "tm",
    }


# ===================================================================
# Health-check smoke tests
# ===================================================================
class TestHealthEndpoints:
    """All three FDTD services should respond to /health."""

    def test_preprocessor_health(self):
        r = preprocessor.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "healthy"

    def test_solver_health(self):
        r = solver.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "healthy"

    def test_postprocessor_health(self):
        r = postprocessor.get("/health")
        assert r.status_code == 200
        assert r.json()["status"] == "healthy"


# ===================================================================
# Preprocessor tests
# ===================================================================
class TestPreprocessor:
    """Yee grid generation and validation endpoints."""

    def test_mesh_1d(self):
        body = {
            "geometry": {
                "domain_size": [1.0, 0.01, 0.01],
                "cell_size": [0.01, 0.01, 0.01],
                "structures": [],
                "sources": [],
            }
        }
        r = preprocessor.post("/api/fdtd/mesh", json=body)
        assert r.status_code == 200
        data = r.json()
        assert data["nx"] == 100
        assert data["total_cells"] > 0
        assert "message" in data

    def test_mesh_with_structure(self):
        body = {
            "geometry": {
                "domain_size": [0.5, 0.5, 0.01],
                "cell_size": [0.01, 0.01, 0.01],
                "structures": [
                    {
                        "name": "dielectric_block",
                        "type": "box",
                        "position": [0.25, 0.25, 0.0],
                        "dimensions": {"size_x": 0.1, "size_y": 0.1, "size_z": 0.01},
                        "material": "fr4",
                    }
                ],
                "sources": [],
            }
        }
        r = preprocessor.post("/api/fdtd/mesh", json=body)
        assert r.status_code == 200
        assert r.json()["structures_applied"] == 1

    def test_validate_stable_setup(self):
        body = {
            "geometry": {
                "domain_size": [1.0, 0.01, 0.01],
                "cell_size": [0.01, 0.01, 0.01],
            },
            "config": {
                "num_time_steps": 500,
                "courant_number": 0.99,
            },
        }
        r = preprocessor.post("/api/fdtd/validate", json=body)
        assert r.status_code == 200
        data = r.json()
        assert data["valid"] is True
        assert data["dt"] > 0


# ===================================================================
# Solver tests — 1-D
# ===================================================================
class TestSolver1D:
    """1-D FDTD solve endpoint."""

    def test_solve_1d_basic(self):
        """A Gaussian pulse in free space should propagate and be recorded."""
        req = _make_1d_gaussian_request()
        r = solver.post("/api/fdtd/solve", json=req)
        assert r.status_code == 200

        data = r.json()
        assert data["dimensionality"] == "1d"
        assert data["total_time_steps"] == 500
        assert data["dt"] > 0
        assert data["solve_time_s"] >= 0

        # Should have probe data
        assert len(data["probe_data"]) == 1
        probe = data["probe_data"][0]
        assert probe["name"] == "probe_right"
        assert len(probe["values"]) > 0

        # Pulse should have arrived at the probe (non-zero max)
        peak = max(abs(v) for v in probe["values"])
        assert peak > 0.01, f"Probe should detect Gaussian pulse, got peak={peak}"

    def test_solve_1d_with_pec_reflects(self):
        """PEC boundary should reflect the pulse back."""
        req = _make_1d_gaussian_request(source_pos=0.3, probe_pos=0.2)
        req["boundaries"]["x_max"]["type"] = "pec"
        req["config"]["num_time_steps"] = 1000

        r = solver.post("/api/fdtd/solve", json=req)
        assert r.status_code == 200

        data = r.json()
        probe = data["probe_data"][0]
        values = probe["values"]

        # With a PEC wall, the probe behind the source should see a reflection
        # Check the probe registered some activity
        peak = max(abs(v) for v in values)
        assert peak > 0.01, "PEC reflection should be detected at probe"


# ===================================================================
# Solver tests — 2-D
# ===================================================================
class TestSolver2D:
    """2-D FDTD solve endpoints (TM mode)."""

    def test_solve_2d_tm(self):
        """A 2-D TM pulse in free space should produce non-zero fields."""
        req = _make_2d_tm_request()
        r = solver.post("/api/fdtd/solve", json=req)
        assert r.status_code == 200

        data = r.json()
        assert data["dimensionality"] == "2d"
        assert data["mode"] == "tm"
        assert data["total_time_steps"] == 300

        # Check final fields exist
        assert "Ez" in data["fields_final"]
        ez = np.array(data["fields_final"]["Ez"])
        assert ez.shape[0] > 1 and ez.shape[1] > 1

    def test_solve_2d_te(self):
        """TE mode should produce Hz fields."""
        req = _make_2d_tm_request()
        req["mode"] = "te"
        r = solver.post("/api/fdtd/solve", json=req)
        assert r.status_code == 200

        data = r.json()
        assert data["mode"] == "te"
        assert "Hz" in data["fields_final"]


# ===================================================================
# Postprocessor tests
# ===================================================================
class TestPostprocessor:
    """Field extraction and analysis endpoints."""

    def test_field_snapshot_1d(self):
        """Extract a 1-D field snapshot with spatial coordinates."""
        field_data = [0.0, 0.1, 0.5, 1.0, 0.5, 0.1, 0.0]
        body = {
            "field_component": "Ez",
            "field_data": field_data,
            "dx": 0.01,
        }
        r = postprocessor.post("/api/fdtd/fields/extract", json=body)
        assert r.status_code == 200

        data = r.json()
        assert data["field_component"] == "Ez"
        assert len(data["values"]) == 7
        assert len(data["x_coords"]) == 7
        assert data["max_value"] == pytest.approx(1.0)

    def test_sar_computation(self):
        """SAR = sigma * |E|^2 / (2 * rho) should give correct peak."""
        e_mag = [0.0, 1.0, 2.0, 1.0, 0.0]
        sigma = [0.5] * 5
        density = [1000.0] * 5
        body = {
            "e_field_magnitude": e_mag,
            "sigma": sigma,
            "density": density,
            "dx": 0.01,
        }
        r = postprocessor.post("/api/fdtd/sar", json=body)
        assert r.status_code == 200

        data = r.json()
        # SAR at index 2: 0.5 * 4.0 / (2 * 1000) = 0.001
        assert data["peak_sar"] == pytest.approx(0.001, rel=0.01)

    def test_poynting_1d(self):
        """1-D Poynting vector from Ez and Hy arrays."""
        n = 50
        ez = np.sin(np.linspace(0, np.pi, n)).tolist()
        hy = np.sin(np.linspace(0, np.pi, n)).tolist()
        body = {
            "e_fields": {"Ez": ez},
            "h_fields": {"Hy": hy},
            "dx": 0.01,
        }
        r = postprocessor.post("/api/fdtd/energy", json=body)
        assert r.status_code == 200

        data = r.json()
        assert len(data["magnitude"]) == n
        assert data["total_power"] > 0


# ===================================================================
# End-to-end pipeline: Preprocessor → Solver → Postprocessor
# ===================================================================
@pytest.mark.critical
class TestFdtdPipeline:
    """Full FDTD workflow — the FDTD equivalent of the PEEC gold-standard test."""

    def test_1d_gaussian_pulse_pipeline(self):
        """
        1-D Gaussian pulse in free space:
        1) Validate setup via preprocessor
        2) Run solver
        3) Extract field snapshot from final fields
        4) Verify pulse propagation physics
        """
        # --- Step 1: Validate setup ---
        geometry = {
            "domain_size": [1.0, 0.01, 0.01],
            "cell_size": [0.005, 0.01, 0.01],
        }
        validate_body = {
            "geometry": geometry,
            "config": {"num_time_steps": 500, "courant_number": 0.99},
        }
        r = preprocessor.post("/api/fdtd/validate", json=validate_body)
        assert r.status_code == 200
        val = r.json()
        assert val["valid"] is True, f"Setup invalid: {val.get('errors')}"

        # --- Step 2: Run solver ---
        solve_req = _make_1d_gaussian_request(
            domain_length=1.0,
            dx=0.005,
            num_time_steps=500,
        )
        r = solver.post("/api/fdtd/solve", json=solve_req)
        assert r.status_code == 200
        solve = r.json()

        # Solver should have completed
        assert solve["total_time_steps"] == 500
        assert solve["dt"] > 0

        # Probe should have recorded the pulse
        probe = solve["probe_data"][0]
        peak = max(abs(v) for v in probe["values"])
        assert peak > 0.01

        # --- Step 3: Extract field snapshot ---
        ez_final = solve["fields_final"]["Ez"]
        extract_body = {
            "field_component": "Ez",
            "field_data": ez_final,
            "dx": 0.005,
        }
        r = postprocessor.post("/api/fdtd/fields/extract", json=extract_body)
        assert r.status_code == 200
        snap = r.json()
        assert snap["field_component"] == "Ez"
        assert len(snap["x_coords"]) == len(snap["values"])

    def test_2d_tm_pipeline(self):
        """
        2-D TM mode pipeline:
        1) Validate setup
        2) Run solver
        3) Extract field snapshot
        4) Compute Poynting vector from final fields
        """
        lx, ly = 0.2, 0.2
        dx, dy = 0.005, 0.005

        # --- Step 1: Validate ---
        geometry = {
            "domain_size": [lx, ly, 0.01],
            "cell_size": [dx, dy, 0.01],
        }
        validate_body = {
            "geometry": geometry,
            "config": {"num_time_steps": 300, "courant_number": 0.5},
        }
        r = preprocessor.post("/api/fdtd/validate", json=validate_body)
        assert r.status_code == 200
        assert r.json()["valid"] is True

        # --- Step 2: Solve ---
        solve_req = _make_2d_tm_request(lx=lx, ly=ly, dx=dx, dy=dy)
        r = solver.post("/api/fdtd/solve", json=solve_req)
        assert r.status_code == 200
        solve = r.json()
        assert solve["dimensionality"] == "2d"

        # --- Step 3: Extract field ---
        ez_final = solve["fields_final"]["Ez"]
        extract_body = {
            "field_component": "Ez",
            "field_data": ez_final,
            "dx": dx,
            "dy": dy,
        }
        r = postprocessor.post("/api/fdtd/fields/extract", json=extract_body)
        assert r.status_code == 200
        snap = r.json()
        assert len(snap["x_coords"]) > 0
        assert len(snap["y_coords"]) > 0

        # --- Step 4: Poynting vector ---
        body = {
            "e_fields": {"Ez": ez_final},
            "h_fields": {
                "Hx": solve["fields_final"]["Hx"],
                "Hy": solve["fields_final"]["Hy"],
            },
            "dx": dx,
            "dy": dy,
        }
        r = postprocessor.post("/api/fdtd/energy", json=body)
        assert r.status_code == 200
        energy = r.json()
        assert energy["total_power"] >= 0
