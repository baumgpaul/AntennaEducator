"""Tests for FEM boundary condition and excitation models."""

from backend.common.models.fem.boundary_conditions import (
    BCType,
    BoundaryCondition,
    Excitation,
)


class TestBCType:
    """Test BCType enum."""

    def test_dirichlet(self):
        assert BCType.DIRICHLET == "dirichlet"

    def test_neumann(self):
        assert BCType.NEUMANN == "neumann"

    def test_robin(self):
        assert BCType.ROBIN == "robin"


class TestBoundaryCondition:
    """Test BoundaryCondition model."""

    def test_dirichlet_numeric(self):
        bc = BoundaryCondition(
            bc_type=BCType.DIRICHLET,
            boundary_name="top",
            value=100.0,
        )
        assert bc.bc_type == BCType.DIRICHLET
        assert bc.value == 100.0

    def test_dirichlet_with_expression(self):
        bc = BoundaryCondition(
            bc_type=BCType.DIRICHLET,
            boundary_name="top",
            value="V_applied",
        )
        assert bc.value == "V_applied"

    def test_neumann_zero_flux(self):
        bc = BoundaryCondition(
            bc_type=BCType.NEUMANN,
            boundary_name="left",
            value=0.0,
        )
        assert bc.bc_type == BCType.NEUMANN
        assert bc.value == 0.0

    def test_neumann_with_expression(self):
        bc = BoundaryCondition(
            bc_type=BCType.NEUMANN,
            boundary_name="right",
            value="q_0 * sin(pi/4)",
        )
        assert bc.value == "q_0 * sin(pi/4)"

    def test_robin_bc(self):
        bc = BoundaryCondition(
            bc_type=BCType.ROBIN,
            boundary_name="outer",
            value=0.0,
            alpha=1.0,
            beta=0.5,
        )
        assert bc.alpha == 1.0
        assert bc.beta == 0.5

    def test_robin_defaults_none(self):
        bc = BoundaryCondition(
            bc_type=BCType.DIRICHLET,
            boundary_name="top",
            value=0.0,
        )
        assert bc.alpha is None
        assert bc.beta is None

    def test_serialization_round_trip(self):
        bc = BoundaryCondition(
            bc_type=BCType.DIRICHLET,
            boundary_name="electrode",
            value=50.0,
        )
        data = bc.model_dump()
        restored = BoundaryCondition.model_validate(data)
        assert restored == bc

    def test_json_round_trip_with_expression(self):
        bc = BoundaryCondition(
            bc_type=BCType.NEUMANN,
            boundary_name="surface",
            value="flux_val * 2",
        )
        json_str = bc.model_dump_json()
        restored = BoundaryCondition.model_validate_json(json_str)
        assert restored == bc

    def test_robin_json_round_trip(self):
        bc = BoundaryCondition(
            bc_type=BCType.ROBIN,
            boundary_name="absorbing",
            value=0.0,
            alpha=2.0,
            beta=1.0,
        )
        json_str = bc.model_dump_json()
        restored = BoundaryCondition.model_validate_json(json_str)
        assert restored.alpha == 2.0
        assert restored.beta == 1.0


class TestExcitation:
    """Test Excitation model."""

    def test_charge_density(self):
        exc = Excitation(
            region_name="dielectric",
            excitation_type="charge_density",
            value=1e-6,
        )
        assert exc.excitation_type == "charge_density"
        assert exc.value == 1e-6

    def test_excitation_with_expression(self):
        exc = Excitation(
            region_name="source_region",
            excitation_type="current_density",
            value="J_0 * area",
        )
        assert exc.value == "J_0 * area"

    def test_serialization_round_trip(self):
        exc = Excitation(
            region_name="body1",
            excitation_type="charge_density",
            value=0.0,
        )
        data = exc.model_dump()
        restored = Excitation.model_validate(data)
        assert restored == exc
