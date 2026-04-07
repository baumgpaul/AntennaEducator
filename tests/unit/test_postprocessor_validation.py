"""Tests for postprocessor model validation bounds."""

import pytest
from pydantic import ValidationError

from backend.postprocessor.models import FarFieldRequest, FieldRequest


class TestFieldRequestBounds:
    NODES = [[0, 0, 0], [0, 0, 1]]
    EDGES = [[1, 2]]
    RADII = [0.001]
    CURRENTS = [[1 + 0j]]

    def test_observation_points_max_length(self):
        obs = [[i * 0.01, 0, 0] for i in range(40001)]
        with pytest.raises(ValidationError, match="40000"):
            FieldRequest(
                frequencies=[1e6],
                branch_currents=self.CURRENTS,
                nodes=self.NODES,
                edges=self.EDGES,
                radii=self.RADII,
                observation_points=obs,
            )

    def test_nodes_max_length(self):
        big_nodes = [[0, 0, i * 0.001] for i in range(5001)]
        with pytest.raises(ValidationError, match="5000"):
            FieldRequest(
                frequencies=[1e6],
                branch_currents=self.CURRENTS,
                nodes=big_nodes,
                edges=self.EDGES,
                radii=self.RADII,
                observation_points=[[1, 0, 0]],
            )

    def test_valid_request(self):
        r = FieldRequest(
            frequencies=[1e6],
            branch_currents=self.CURRENTS,
            nodes=self.NODES,
            edges=self.EDGES,
            radii=self.RADII,
            observation_points=[[1, 0, 0]],
        )
        assert len(r.observation_points) == 1


class TestFarFieldRequestBounds:
    NODES = [[0, 0, 0], [0, 0, 1]]
    EDGES = [[1, 2]]
    RADII = [0.001]
    CURRENTS = [[1 + 0j]]

    def test_theta_points_too_large(self):
        with pytest.raises(ValidationError, match="721"):
            FarFieldRequest(
                frequencies=[1e6],
                branch_currents=self.CURRENTS,
                nodes=self.NODES,
                edges=self.EDGES,
                radii=self.RADII,
                theta_points=800,
            )

    def test_phi_points_too_large(self):
        with pytest.raises(ValidationError, match="721"):
            FarFieldRequest(
                frequencies=[1e6],
                branch_currents=self.CURRENTS,
                nodes=self.NODES,
                edges=self.EDGES,
                radii=self.RADII,
                phi_points=800,
            )

    def test_valid_request(self):
        r = FarFieldRequest(
            frequencies=[1e6],
            branch_currents=self.CURRENTS,
            nodes=self.NODES,
            edges=self.EDGES,
            radii=self.RADII,
            theta_points=91,
            phi_points=180,
        )
        assert r.theta_points == 91
        assert r.phi_points == 180
