"""Tests for FEM result models."""

import pytest

from backend.common.models.fem.results import (
    FEMSolverResult,
    IntegralQuantity,
    ScalarFieldResult,
    VectorFieldResult,
)


class TestScalarFieldResult:
    """Test ScalarFieldResult model."""

    def test_potential_field(self):
        field = ScalarFieldResult(
            field_name="electric_potential",
            node_values=[0.0, 25.0, 50.0, 75.0, 100.0],
            unit="V",
            min_value=0.0,
            max_value=100.0,
        )
        assert field.field_name == "electric_potential"
        assert len(field.node_values) == 5
        assert field.unit == "V"

    def test_default_min_max(self):
        field = ScalarFieldResult(
            field_name="temperature",
            node_values=[20.0, 30.0],
        )
        assert field.min_value == 0.0
        assert field.max_value == 0.0
        assert field.unit == ""

    def test_serialization_round_trip(self):
        field = ScalarFieldResult(
            field_name="potential",
            node_values=[1.0, 2.0, 3.0],
            unit="V",
            min_value=1.0,
            max_value=3.0,
        )
        data = field.model_dump()
        restored = ScalarFieldResult.model_validate(data)
        assert restored == field


class TestVectorFieldResult:
    """Test VectorFieldResult model."""

    def test_e_field(self):
        field = VectorFieldResult(
            field_name="electric_field",
            element_values=[[0.0, -100.0], [0.0, -100.0]],
            unit="V/m",
            max_magnitude=100.0,
        )
        assert field.field_name == "electric_field"
        assert len(field.element_values) == 2
        assert field.element_values[0] == [0.0, -100.0]

    def test_default_values(self):
        field = VectorFieldResult(
            field_name="velocity",
            element_values=[],
        )
        assert field.unit == ""
        assert field.max_magnitude == 0.0

    def test_serialization_round_trip(self):
        field = VectorFieldResult(
            field_name="current_density",
            element_values=[[1.0, 0.0], [0.0, 1.0], [0.5, 0.5]],
            unit="A/m^2",
            max_magnitude=1.0,
        )
        data = field.model_dump()
        restored = VectorFieldResult.model_validate(data)
        assert restored == field


class TestIntegralQuantity:
    """Test IntegralQuantity model."""

    def test_energy(self):
        iq = IntegralQuantity(
            name="electric_energy",
            value=4.425e-11,
            unit="J",
        )
        assert iq.name == "electric_energy"
        assert iq.value == pytest.approx(4.425e-11)
        assert iq.region is None

    def test_charge_on_boundary(self):
        iq = IntegralQuantity(
            name="total_charge",
            value=8.854e-10,
            unit="C",
            region="top",
        )
        assert iq.region == "top"

    def test_serialization_round_trip(self):
        iq = IntegralQuantity(
            name="capacitance",
            value=8.854e-12,
            unit="F",
        )
        data = iq.model_dump()
        restored = IntegralQuantity.model_validate(data)
        assert restored == iq


class TestFEMSolverResult:
    """Test complete FEMSolverResult model."""

    @pytest.fixture
    def electrostatic_result(self):
        """Minimal electrostatic result with potential and E-field."""
        return FEMSolverResult(
            scalar_fields={
                "electric_potential": ScalarFieldResult(
                    field_name="electric_potential",
                    node_values=[0.0, 50.0, 100.0, 0.0, 50.0, 100.0],
                    unit="V",
                    min_value=0.0,
                    max_value=100.0,
                ),
            },
            vector_fields={
                "electric_field": VectorFieldResult(
                    field_name="electric_field",
                    element_values=[[0.0, -100.0], [0.0, -100.0]],
                    unit="V/m",
                    max_magnitude=100.0,
                ),
            },
            integrals=[
                IntegralQuantity(name="electric_energy", value=4.425e-11, unit="J"),
                IntegralQuantity(name="capacitance", value=8.854e-12, unit="F"),
            ],
            n_dofs=6,
            n_elements=2,
            solve_time=0.005,
        )

    def test_result_construction(self, electrostatic_result):
        result = electrostatic_result
        assert "electric_potential" in result.scalar_fields
        assert "electric_field" in result.vector_fields
        assert len(result.integrals) == 2
        assert result.n_dofs == 6
        assert result.n_elements == 2
        assert result.solve_time == pytest.approx(0.005)

    def test_result_default_solver_info(self, electrostatic_result):
        assert electrostatic_result.solver_info == {}

    def test_result_with_solver_info(self):
        result = FEMSolverResult(
            scalar_fields={},
            vector_fields={},
            integrals=[],
            n_dofs=100,
            n_elements=50,
            solve_time=1.2,
            solver_info={
                "method": "direct",
                "condition_number": 1e6,
            },
        )
        assert result.solver_info["method"] == "direct"

    def test_json_round_trip(self, electrostatic_result):
        json_str = electrostatic_result.model_dump_json()
        restored = FEMSolverResult.model_validate_json(json_str)
        assert restored.n_dofs == electrostatic_result.n_dofs
        assert len(restored.scalar_fields) == 1
        assert len(restored.vector_fields) == 1
        assert len(restored.integrals) == 2

    def test_empty_result(self):
        result = FEMSolverResult(
            scalar_fields={},
            vector_fields={},
            integrals=[],
            n_dofs=0,
            n_elements=0,
            solve_time=0.0,
        )
        assert len(result.scalar_fields) == 0
