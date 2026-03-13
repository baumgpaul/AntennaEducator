"""
FDTD Integration: API Endpoint Validation
==========================================
Verifies that all FDTD service endpoints are callable with valid data
and return correct response schemas (status codes, required fields).
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


# ===================================================================
# Preprocessor endpoints
# ===================================================================
class TestPreprocessorEndpoints:
    """All preprocessor endpoints return correct schemas."""

    def test_health(self):
        r = preprocessor.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert "status" in data
        assert "service" in data

    def test_mesh_response_schema(self):
        body = {
            "geometry": {
                "domain_size": [0.5, 0.5, 0.01],
                "cell_size": [0.01, 0.01, 0.01],
                "structures": [],
                "sources": [],
            }
        }
        r = preprocessor.post("/api/fdtd/mesh", json=body)
        assert r.status_code == 200
        data = r.json()
        # Validate all required fields
        for field in [
            "nx",
            "ny",
            "nz",
            "dx",
            "dy",
            "dz",
            "total_cells",
            "structures_applied",
            "sources",
            "boundaries",
            "message",
        ]:
            assert field in data, f"Missing field: {field}"
        assert isinstance(data["nx"], int)
        assert isinstance(data["dx"], float)

    def test_validate_response_schema(self):
        body = {
            "geometry": {
                "domain_size": [0.3, 0.01, 0.01],
                "cell_size": [0.01, 0.01, 0.01],
            },
            "config": {"num_time_steps": 100, "courant_number": 0.99},
        }
        r = preprocessor.post("/api/fdtd/validate", json=body)
        assert r.status_code == 200
        data = r.json()
        for field in ["valid", "warnings", "errors", "nx", "ny", "nz", "dt", "total_cells"]:
            assert field in data, f"Missing field: {field}"
        assert isinstance(data["valid"], bool)
        assert isinstance(data["warnings"], list)
        assert isinstance(data["errors"], list)

    def test_mesh_invalid_request_returns_error(self):
        """Missing geometry should fail with a validation error."""
        r = preprocessor.post("/api/fdtd/mesh", json={})
        assert r.status_code == 422


# ===================================================================
# Solver endpoints
# ===================================================================
class TestSolverEndpoints:
    """All solver endpoints return correct schemas."""

    def test_health(self):
        r = solver.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "healthy"
        assert "solver_type" in data

    def test_solve_config(self):
        r = solver.get("/api/fdtd/solve/config")
        assert r.status_code == 200
        data = r.json()
        assert "max_time_steps" in data
        assert "gpu_available" in data

    def test_solve_1d_response_schema(self):
        body = {
            "dimensionality": "1d",
            "domain_size": [0.2, 0.01, 0.01],
            "cell_size": [0.005, 0.01, 0.01],
            "structures": [],
            "sources": [
                {
                    "name": "src",
                    "type": "gaussian_pulse",
                    "position": [0.1, 0.0, 0.0],
                    "parameters": {"amplitude": 1.0, "width": 20},
                    "polarization": "z",
                }
            ],
            "probes": [],
            "config": {"num_time_steps": 100, "courant_number": 0.99},
        }
        r = solver.post("/api/fdtd/solve", json=body)
        assert r.status_code == 200
        data = r.json()
        for field in [
            "dimensionality",
            "mode",
            "total_time_steps",
            "dt",
            "solve_time_s",
            "fields_final",
            "probe_data",
        ]:
            assert field in data, f"Missing field: {field}"
        assert data["dimensionality"] == "1d"
        assert isinstance(data["dt"], float)
        assert isinstance(data["fields_final"], dict)
        assert "Ez" in data["fields_final"]

    def test_solve_2d_response_schema(self):
        body = {
            "dimensionality": "2d",
            "domain_size": [0.1, 0.1, 0.01],
            "cell_size": [0.005, 0.005, 0.01],
            "structures": [],
            "sources": [
                {
                    "name": "src",
                    "type": "gaussian_pulse",
                    "position": [0.05, 0.05, 0.0],
                    "parameters": {"amplitude": 1.0, "width": 15},
                    "polarization": "z",
                }
            ],
            "probes": [],
            "config": {"num_time_steps": 50, "courant_number": 0.5},
            "mode": "tm",
        }
        r = solver.post("/api/fdtd/solve", json=body)
        assert r.status_code == 200
        data = r.json()
        assert data["dimensionality"] == "2d"
        assert data["mode"] == "tm"
        assert "Ez" in data["fields_final"]
        assert "Hx" in data["fields_final"]
        assert "Hy" in data["fields_final"]

    def test_solve_invalid_dimensionality(self):
        body = {
            "dimensionality": "3d",
            "domain_size": [0.1, 0.1, 0.1],
            "cell_size": [0.01, 0.01, 0.01],
        }
        r = solver.post("/api/fdtd/solve", json=body)
        assert r.status_code == 422


# ===================================================================
# Postprocessor endpoints
# ===================================================================
class TestPostprocessorEndpoints:
    """All postprocessor endpoints return correct schemas."""

    def test_health(self):
        r = postprocessor.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "healthy"

    def test_field_extract_1d_schema(self):
        body = {
            "field_component": "Ez",
            "field_data": [0.0, 0.5, 1.0, 0.5, 0.0],
            "dx": 0.01,
        }
        r = postprocessor.post("/api/fdtd/fields/extract", json=body)
        assert r.status_code == 200
        data = r.json()
        for field in [
            "field_component",
            "values",
            "x_coords",
            "y_coords",
            "min_value",
            "max_value",
        ]:
            assert field in data, f"Missing field: {field}"
        assert data["field_component"] == "Ez"
        assert data["max_value"] == pytest.approx(1.0)

    def test_field_extract_2d_schema(self):
        field_2d = [[0.0, 0.1, 0.0], [0.1, 1.0, 0.1], [0.0, 0.1, 0.0]]
        body = {
            "field_component": "Ez",
            "field_data": field_2d,
            "dx": 0.01,
            "dy": 0.01,
        }
        r = postprocessor.post("/api/fdtd/fields/extract", json=body)
        assert r.status_code == 200
        data = r.json()
        assert len(data["x_coords"]) == 3
        assert len(data["y_coords"]) == 3
        assert data["max_value"] == pytest.approx(1.0)

    def test_sar_schema(self):
        body = {
            "e_field_magnitude": [0.0, 1.0, 0.0],
            "sigma": [0.5, 0.5, 0.5],
            "density": [1000.0, 1000.0, 1000.0],
            "dx": 0.01,
        }
        r = postprocessor.post("/api/fdtd/sar", json=body)
        assert r.status_code == 200
        data = r.json()
        for field in ["sar", "peak_sar", "average_sar", "x_coords"]:
            assert field in data, f"Missing field: {field}"
        assert data["peak_sar"] > 0

    def test_energy_1d_schema(self):
        n = 20
        body = {
            "e_fields": {"Ez": [float(x) for x in np.sin(np.linspace(0, np.pi, n))]},
            "h_fields": {"Hy": [float(x) for x in np.sin(np.linspace(0, np.pi, n))]},
            "dx": 0.01,
        }
        r = postprocessor.post("/api/fdtd/energy", json=body)
        assert r.status_code == 200
        data = r.json()
        for field in ["magnitude", "total_power"]:
            assert field in data, f"Missing field: {field}"
        assert data["total_power"] > 0

    def test_energy_2d_schema(self):
        n = 5
        ez = [[float(i + j) for j in range(n)] for i in range(n)]
        hx = [[0.1] * n for _ in range(n)]
        hy = [[0.1] * n for _ in range(n)]
        body = {
            "e_fields": {"Ez": ez},
            "h_fields": {"Hx": hx, "Hy": hy},
            "dx": 0.01,
            "dy": 0.01,
        }
        r = postprocessor.post("/api/fdtd/energy", json=body)
        assert r.status_code == 200
        data = r.json()
        assert data["total_power"] >= 0

    def test_frequency_field_schema(self):
        n = 10
        body = {
            "frequency_hz": 1e9,
            "dft_real": [float(x) for x in np.cos(np.linspace(0, np.pi, n))],
            "dft_imag": [float(x) for x in np.sin(np.linspace(0, np.pi, n))],
            "dx": 0.01,
        }
        r = postprocessor.post("/api/fdtd/fields/frequency", json=body)
        assert r.status_code == 200
        data = r.json()
        for field in ["frequency_hz", "magnitude", "phase_deg", "x_coords"]:
            assert field in data, f"Missing field: {field}"

    def test_invalid_field_component_returns_error(self):
        body = {
            "field_component": "InvalidField",
            "field_data": [0.0, 1.0],
            "dx": 0.01,
        }
        r = postprocessor.post("/api/fdtd/fields/extract", json=body)
        assert r.status_code == 422
