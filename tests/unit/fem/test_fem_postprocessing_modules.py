"""Tests for FEM postprocessor pure modules: visualization, line eval, point probe, export."""

import pytest

from backend.common.models.fem.mesh import (
    BoundaryEdge,
    ElementType,
    FEMElement,
    FEMMesh,
    FEMNode,
    Region,
)
from backend.common.models.fem.results import (
    FEMSolverResult,
    IntegralQuantity,
    ScalarFieldResult,
    VectorFieldResult,
)


def _make_mesh() -> FEMMesh:
    """2-element mesh covering unit square [0,1]x[0,1]."""
    return FEMMesh(
        nodes=[
            FEMNode(id=0, coords=[0.0, 0.0]),
            FEMNode(id=1, coords=[1.0, 0.0]),
            FEMNode(id=2, coords=[1.0, 1.0]),
            FEMNode(id=3, coords=[0.0, 1.0]),
        ],
        elements=[
            FEMElement(id=0, element_type=ElementType.TRI3, node_ids=[0, 1, 2], region_id=0),
            FEMElement(id=1, element_type=ElementType.TRI3, node_ids=[0, 2, 3], region_id=0),
        ],
        regions=[Region(id=0, name="air")],
        boundary_edges=[
            BoundaryEdge(id=0, node_ids=[0, 1], region_name="bottom"),
            BoundaryEdge(id=1, node_ids=[2, 3], region_name="top"),
        ],
        element_type=ElementType.TRI3,
    )


def _make_result() -> FEMSolverResult:
    """Solved result for unit-square: potential linearly varying from 0 (bottom) to 1 (top)."""
    return FEMSolverResult(
        scalar_fields={
            "electric_potential": ScalarFieldResult(
                field_name="electric_potential",
                node_values=[0.0, 0.0, 1.0, 1.0],
                unit="V",
                min_value=0.0,
                max_value=1.0,
            )
        },
        vector_fields={
            "electric_field": VectorFieldResult(
                field_name="electric_field",
                element_values=[[0.0, -1.0], [0.0, -1.0]],
                unit="V/m",
                max_magnitude=1.0,
            )
        },
        integrals=[IntegralQuantity(name="electric_energy", value=4.427e-12, unit="J")],
        n_dofs=4,
        n_elements=2,
        solve_time=0.001,
    )


class TestVisualization:
    """Tests for the visualization data preparation module."""

    def test_prepare_scalar_field(self):
        from backend.fem_postprocessor.visualization import prepare_scalar_field

        mesh = _make_mesh()
        result = _make_result()
        field = result.scalar_fields["electric_potential"]

        data = prepare_scalar_field(mesh, field)
        # Positions: flat array [x0, y0, x1, y1, ...]
        assert len(data["positions"]) == 4 * 2  # 4 nodes * 2 coords
        # Indices: triangle vertex indices for WebGL
        assert len(data["indices"]) == 2 * 3  # 2 elements * 3 vertices
        # Values: one per node
        assert len(data["values"]) == 4
        assert data["min_value"] == pytest.approx(0.0)
        assert data["max_value"] == pytest.approx(1.0)

    def test_prepare_vector_field(self):
        from backend.fem_postprocessor.visualization import prepare_vector_field

        mesh = _make_mesh()
        result = _make_result()
        field = result.vector_fields["electric_field"]

        data = prepare_vector_field(mesh, field)
        # Arrows: one per element with cx, cy, vx, vy
        assert len(data["arrows"]) == 2
        for arrow in data["arrows"]:
            assert "cx" in arrow
            assert "cy" in arrow
            assert "vx" in arrow
            assert "vy" in arrow
        # E-field points downward
        assert data["arrows"][0]["vy"] == pytest.approx(-1.0)


class TestLineEvaluation:
    """Tests for field interpolation along a line."""

    def test_sample_scalar_along_vertical_line(self):
        from backend.fem_postprocessor.line_evaluation import sample_field_along_line

        mesh = _make_mesh()
        result = _make_result()
        field = result.scalar_fields["electric_potential"]

        distances, values = sample_field_along_line(
            mesh, field, start=[0.5, 0.0], end=[0.5, 1.0], num_points=5
        )
        assert len(distances) == 5
        assert len(values) == 5
        assert distances[0] == pytest.approx(0.0)
        assert distances[-1] == pytest.approx(1.0)
        # Linear potential: 0 → 1
        assert values[0] == pytest.approx(0.0, abs=0.05)
        assert values[-1] == pytest.approx(1.0, abs=0.05)
        assert values[2] == pytest.approx(0.5, abs=0.05)

    def test_sample_scalar_along_horizontal_line(self):
        from backend.fem_postprocessor.line_evaluation import sample_field_along_line

        mesh = _make_mesh()
        result = _make_result()
        field = result.scalar_fields["electric_potential"]

        distances, values = sample_field_along_line(
            mesh, field, start=[0.0, 0.5], end=[1.0, 0.5], num_points=3
        )
        # Potential is constant at y=0.5 → ~0.5
        for v in values:
            assert v == pytest.approx(0.5, abs=0.1)


class TestPointProbe:
    """Tests for single-point field evaluation."""

    def test_probe_at_node(self):
        from backend.fem_postprocessor.point_probe import probe_field_at_point

        mesh = _make_mesh()
        result = _make_result()
        field = result.scalar_fields["electric_potential"]

        value = probe_field_at_point(mesh, field, point=[0.0, 0.0])
        assert value == pytest.approx(0.0, abs=1e-10)

    def test_probe_at_center(self):
        from backend.fem_postprocessor.point_probe import probe_field_at_point

        mesh = _make_mesh()
        result = _make_result()
        field = result.scalar_fields["electric_potential"]

        value = probe_field_at_point(mesh, field, point=[0.5, 0.5])
        assert value == pytest.approx(0.5, abs=0.1)

    def test_probe_outside_domain_raises(self):
        from backend.fem_postprocessor.point_probe import probe_field_at_point

        mesh = _make_mesh()
        result = _make_result()
        field = result.scalar_fields["electric_potential"]

        with pytest.raises(ValueError, match="outside"):
            probe_field_at_point(mesh, field, point=[10.0, 10.0])


class TestVTKExport:
    """Tests for VTK legacy export."""

    def test_export_vtk_header(self):
        from backend.fem_postprocessor.export import export_vtk

        mesh = _make_mesh()
        result = _make_result()

        vtk_str = export_vtk(mesh, result)
        lines = vtk_str.split("\n")
        assert lines[0] == "# vtk DataFile Version 3.0"
        assert "POINTS 4" in vtk_str
        assert "CELLS 2" in vtk_str
        assert "POINT_DATA 4" in vtk_str
        assert "electric_potential" in vtk_str

    def test_export_vtk_values(self):
        from backend.fem_postprocessor.export import export_vtk

        mesh = _make_mesh()
        result = _make_result()

        vtk_str = export_vtk(mesh, result)
        # Should contain the potential values
        assert "0.0" in vtk_str
        assert "1.0" in vtk_str


class TestCSVExport:
    """Tests for CSV field export."""

    def test_export_csv_scalar(self):
        from backend.fem_postprocessor.export import export_csv_scalar

        mesh = _make_mesh()
        result = _make_result()
        field = result.scalar_fields["electric_potential"]

        csv_str = export_csv_scalar(mesh, field)
        lines = csv_str.strip().split("\n")
        assert len(lines) == 5  # header + 4 nodes
        header = lines[0]
        assert "x" in header
        assert "y" in header
        assert "electric_potential" in header
