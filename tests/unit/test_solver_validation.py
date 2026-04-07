"""Tests for solver schema validation — bounds and NaN/Inf guards."""

import pytest
from pydantic import ValidationError

from backend.solver.schemas import (
    AntennaInput,
    FrequencySweepRequest,
    SingleFrequencyRequest,
)


class TestSingleFrequencyValidation:
    NODES = [[0, 0, 0], [0, 0, 0.5], [0, 0, 1.0]]
    EDGES = [[1, 2], [2, 3]]
    RADII = [0.001, 0.001]

    def test_nan_frequency_rejected(self):
        with pytest.raises(ValidationError):
            SingleFrequencyRequest(
                nodes=self.NODES, edges=self.EDGES, radii=self.RADII, frequency=float("nan")
            )

    def test_inf_frequency_rejected(self):
        with pytest.raises(ValidationError):
            SingleFrequencyRequest(
                nodes=self.NODES, edges=self.EDGES, radii=self.RADII, frequency=float("inf")
            )

    def test_nodes_max_length(self):
        big_nodes = [[0, 0, i * 0.001] for i in range(5001)]
        with pytest.raises(ValidationError, match="5000"):
            SingleFrequencyRequest(
                nodes=big_nodes, edges=self.EDGES, radii=self.RADII, frequency=1e6
            )

    def test_edges_max_length(self):
        big_edges = [[1, 2]] * 10001
        with pytest.raises(ValidationError, match="10000"):
            SingleFrequencyRequest(
                nodes=self.NODES, edges=big_edges, radii=self.RADII, frequency=1e6
            )

    def test_valid_request_passes(self):
        r = SingleFrequencyRequest(
            nodes=self.NODES, edges=self.EDGES, radii=self.RADII, frequency=300e6
        )
        assert r.frequency == 300e6


class TestFrequencySweepValidation:
    NODES = [[0, 0, 0], [0, 0, 0.5]]
    EDGES = [[1, 2]]
    RADII = [0.001]

    def test_nan_in_frequencies_rejected(self):
        with pytest.raises(ValidationError, match="finite"):
            FrequencySweepRequest(
                nodes=self.NODES,
                edges=self.EDGES,
                radii=self.RADII,
                frequencies=[1e6, float("nan"), 3e6],
            )

    def test_inf_in_frequencies_rejected(self):
        with pytest.raises(ValidationError, match="finite"):
            FrequencySweepRequest(
                nodes=self.NODES,
                edges=self.EDGES,
                radii=self.RADII,
                frequencies=[float("inf")],
            )

    def test_valid_sweep_passes(self):
        r = FrequencySweepRequest(
            nodes=self.NODES,
            edges=self.EDGES,
            radii=self.RADII,
            frequencies=[1e6, 2e6, 3e6],
        )
        assert len(r.frequencies) == 3


class TestAntennaInputBounds:
    def test_nodes_max_length(self):
        big_nodes = [[0, 0, i * 0.001] for i in range(5001)]
        with pytest.raises(ValidationError, match="5000"):
            AntennaInput(
                antenna_id="a1",
                nodes=big_nodes,
                edges=[[1, 2]],
                radii=[0.001],
            )
