"""Regression tests: invalid/degenerate inputs give clean 4xx, never 500.

TEST_PLAN §8.2 probes B26, B27, B29, B34, B45.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from backend.common.auth.dependencies import get_current_user
from backend.common.auth.identity import UserIdentity, UserRole


def _flatrate_user() -> UserIdentity:
    return UserIdentity(
        id="probe-user",
        email="probe@example.com",
        username="probe",
        role=UserRole.USER,
        simulation_tokens=999,
        flatrate_until=datetime.now(timezone.utc) + timedelta(days=1),
    )


@pytest.fixture
def solver():
    from backend.solver.main import app

    app.dependency_overrides[get_current_user] = _flatrate_user
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


@pytest.fixture
def postprocessor():
    from backend.postprocessor.main import app

    app.dependency_overrides[get_current_user] = _flatrate_user
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


# Half-wave-ish dipole: 3 nodes, 2 edges, fed at the middle node
DIPOLE = {
    "nodes": [[0, 0, -0.25], [0, 0, 0], [0, 0, 0.25]],
    "edges": [[1, 2], [2, 3]],
    "radii": [0.001, 0.001],
}
FEED = [{"node_start": 2, "node_end": 0, "value": 1}]


class TestSolverInputs:
    def test_valid_single_solve_baseline(self, solver):
        resp = solver.post(
            "/api/solve/single", json={**DIPOLE, "frequency": 3e8, "voltage_sources": FEED}
        )
        assert resp.status_code == 200

    def test_edge_index_out_of_range_is_422(self, solver):  # B26
        resp = solver.post(
            "/api/solve/single",
            json={**DIPOLE, "edges": [[1, 999], [2, 3]], "frequency": 3e8, "voltage_sources": FEED},
        )
        assert resp.status_code == 422
        assert "999" in resp.text

    def test_malformed_edge_is_422(self, solver):  # B26
        resp = solver.post(
            "/api/solve/single",
            json={
                **DIPOLE,
                "edges": [[1, 2, 3], [2, 3]],
                "frequency": 3e8,
                "voltage_sources": FEED,
            },
        )
        assert resp.status_code == 422

    @pytest.mark.parametrize("z0", [0, -5])
    def test_non_positive_reference_impedance_is_422(self, solver, z0):  # B27
        resp = solver.post(
            "/api/solve/sweep",
            json={
                **DIPOLE,
                "frequencies": [3e8],
                "voltage_sources": FEED,
                "reference_impedance": z0,
            },
        )
        assert resp.status_code == 422

    def test_zero_current_source_is_clean_error(self, solver):  # B29
        resp = solver.post(
            "/api/solve/single",
            json={**DIPOLE, "frequency": 3e8, "current_sources": [{"node": 2, "value": 0}]},
        )
        assert resp.status_code == 422
        assert "source current" in resp.json()["detail"]

    def test_complex_dict_source_value_accepted(self, solver):  # B45
        resp = solver.post(
            "/api/solve/single",
            json={
                **DIPOLE,
                "frequency": 3e8,
                "voltage_sources": [
                    {"node_start": 2, "node_end": 0, "value": {"real": 1, "imag": 0.5}}
                ],
            },
        )
        assert resp.status_code == 200


class TestPostprocessorInputs:
    BASE = {
        **DIPOLE,
        "frequencies": [3e8],
        "branch_currents": [[{"real": 1, "imag": 0}, {"real": 1, "imag": 0}]],
        "observation_points": [[1, 0, 0]],
    }

    def test_empty_frequencies_is_422(self, postprocessor):  # B34
        resp = postprocessor.post(
            "/api/fields/near", json={**self.BASE, "frequencies": [], "branch_currents": []}
        )
        assert resp.status_code == 422

    def test_empty_observation_points_is_422(self, postprocessor):  # B34
        resp = postprocessor.post("/api/fields/near", json={**self.BASE, "observation_points": []})
        assert resp.status_code == 422

    def test_currents_frequency_mismatch_is_422(self, postprocessor):  # B34
        resp = postprocessor.post("/api/fields/near", json={**self.BASE, "frequencies": [3e8, 4e8]})
        assert resp.status_code == 422
