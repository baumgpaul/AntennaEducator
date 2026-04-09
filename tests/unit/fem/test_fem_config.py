"""Tests for FEM solver configuration models."""

from backend.common.models.fem.config import (
    AnalysisType,
    FEMSolverConfig,
    LinearSolverType,
    PDEType,
)


class TestPDEType:
    """Test PDEType enum."""

    def test_electrostatic(self):
        assert PDEType.ELECTROSTATIC == "electrostatic"

    def test_current_flow(self):
        assert PDEType.CURRENT_FLOW == "current_flow"

    def test_magnetostatic(self):
        assert PDEType.MAGNETOSTATIC == "magnetostatic"

    def test_all_types_exist(self):
        expected = {
            "electrostatic",
            "current_flow",
            "magnetostatic",
            "eddy_current",
            "mechanics",
            "acoustic",
        }
        actual = {t.value for t in PDEType}
        assert actual == expected


class TestAnalysisType:
    """Test AnalysisType enum."""

    def test_static(self):
        assert AnalysisType.STATIC == "static"

    def test_harmonic(self):
        assert AnalysisType.HARMONIC == "harmonic"

    def test_all_types(self):
        expected = {"static", "harmonic", "transient", "eigenfrequency"}
        actual = {t.value for t in AnalysisType}
        assert actual == expected


class TestLinearSolverType:
    """Test LinearSolverType enum."""

    def test_direct(self):
        assert LinearSolverType.DIRECT == "direct"

    def test_cg(self):
        assert LinearSolverType.CG == "cg"

    def test_gmres(self):
        assert LinearSolverType.GMRES == "gmres"


class TestFEMSolverConfig:
    """Test FEMSolverConfig model."""

    def test_minimal_config(self):
        config = FEMSolverConfig(pde_type=PDEType.ELECTROSTATIC)
        assert config.pde_type == PDEType.ELECTROSTATIC
        assert config.analysis_type == AnalysisType.STATIC
        assert config.polynomial_order == 1
        assert config.gauss_order is None
        assert config.solver_type == LinearSolverType.DIRECT
        assert config.tolerance == 1e-10
        assert config.max_iterations == 1000
        assert config.frequency is None
        assert config.compute_gradient is True
        assert config.compute_flux is True
        assert config.compute_energy is True

    def test_full_config(self):
        config = FEMSolverConfig(
            pde_type=PDEType.EDDY_CURRENT,
            analysis_type=AnalysisType.HARMONIC,
            polynomial_order=2,
            gauss_order=4,
            solver_type=LinearSolverType.GMRES,
            tolerance=1e-8,
            max_iterations=5000,
            frequency=1e6,
            compute_gradient=True,
            compute_flux=False,
            compute_energy=True,
        )
        assert config.pde_type == PDEType.EDDY_CURRENT
        assert config.analysis_type == AnalysisType.HARMONIC
        assert config.polynomial_order == 2
        assert config.gauss_order == 4
        assert config.frequency == 1e6
        assert config.compute_flux is False

    def test_quadratic_elements(self):
        config = FEMSolverConfig(
            pde_type=PDEType.ELECTROSTATIC,
            polynomial_order=2,
        )
        assert config.polynomial_order == 2

    def test_iterative_solver_config(self):
        config = FEMSolverConfig(
            pde_type=PDEType.ELECTROSTATIC,
            solver_type=LinearSolverType.CG,
            tolerance=1e-12,
            max_iterations=2000,
        )
        assert config.solver_type == LinearSolverType.CG
        assert config.tolerance == 1e-12

    def test_serialization_round_trip(self):
        config = FEMSolverConfig(
            pde_type=PDEType.CURRENT_FLOW,
            polynomial_order=2,
            solver_type=LinearSolverType.CG,
        )
        data = config.model_dump()
        restored = FEMSolverConfig.model_validate(data)
        assert restored == config

    def test_json_round_trip(self):
        config = FEMSolverConfig(
            pde_type=PDEType.MECHANICS,
            analysis_type=AnalysisType.STATIC,
        )
        json_str = config.model_dump_json()
        restored = FEMSolverConfig.model_validate_json(json_str)
        assert restored == config
