"""Tests for preprocessor schema validation bounds."""

import pytest
from pydantic import ValidationError

from backend.preprocessor.schemas import (
    CustomNodeInput,
    CustomRequest,
    DipoleRequest,
    LoopRequest,
    RodRequest,
)


class TestDipoleRequestBounds:
    def test_length_too_large_rejected(self):
        with pytest.raises(ValidationError, match="less than or equal to 100"):
            DipoleRequest(length=101)

    def test_segments_too_large_rejected(self):
        with pytest.raises(ValidationError, match="less than or equal to 1000"):
            DipoleRequest(length=1.0, segments=1001)

    def test_wire_radius_too_large_rejected(self):
        with pytest.raises(ValidationError, match="less than or equal to 1"):
            DipoleRequest(length=1.0, wire_radius=1.5)

    def test_valid_dipole_passes(self):
        d = DipoleRequest(length=0.5, segments=21, wire_radius=0.001)
        assert d.length == 0.5
        assert d.segments == 21


class TestLoopRequestBounds:
    def test_radius_too_large_rejected(self):
        with pytest.raises(ValidationError, match="less than or equal to 50"):
            LoopRequest(radius=51)

    def test_segments_too_large_rejected(self):
        with pytest.raises(ValidationError, match="less than or equal to 1000"):
            LoopRequest(radius=0.1, segments=1001)

    def test_valid_loop_passes(self):
        r = LoopRequest(radius=0.1, segments=36)
        assert r.radius == 0.1


class TestRodRequestBounds:
    def test_length_too_large_rejected(self):
        with pytest.raises(ValidationError, match="less than or equal to 100"):
            RodRequest(length=101)

    def test_segments_too_large_rejected(self):
        with pytest.raises(ValidationError, match="less than or equal to 1000"):
            RodRequest(length=1.0, segments=1001)

    def test_valid_rod_passes(self):
        r = RodRequest(length=1.0, segments=21)
        assert r.length == 1.0


class TestCustomRequestBounds:
    def test_nodes_max_length(self):
        nodes = [{"id": i, "x": 0, "y": 0, "z": i * 0.01} for i in range(1, 5002)]
        edges = [{"node_start": 1, "node_end": 2}]
        with pytest.raises(ValidationError, match="5000"):
            CustomRequest(nodes=nodes, edges=edges)

    def test_edges_max_length(self):
        nodes = [{"id": 1, "x": 0, "y": 0, "z": 0}, {"id": 2, "x": 0, "y": 0, "z": 1}]
        edges = [{"node_start": 1, "node_end": 2}] * 10001
        with pytest.raises(ValidationError, match="10000"):
            CustomRequest(nodes=nodes, edges=edges)

    def test_node_radius_too_large_rejected(self):
        with pytest.raises(ValidationError, match="less than or equal to 1"):
            CustomNodeInput(id=1, x=0, y=0, z=0, radius=1.5)

    def test_valid_custom_passes(self):
        r = CustomRequest(
            nodes=[{"id": 1, "x": 0, "y": 0, "z": 0}, {"id": 2, "x": 0, "y": 0, "z": 1}],
            edges=[{"node_start": 1, "node_end": 2}],
        )
        assert len(r.nodes) == 2
