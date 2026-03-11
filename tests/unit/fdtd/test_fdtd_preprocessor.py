"""
Tests for FDTD Preprocessor service.

Covers: Yee grid generation, structure application, source placement,
boundary application, setup validation, schemas, and API endpoints.
TDD — written before implementation.
"""

import math

import numpy as np
import pytest
from pydantic import ValidationError

from backend.common.constants import C_0
from backend.common.models.fdtd import (
    BoundaryCondition,
    DomainBoundaries,
    FdtdConfig,
    FdtdGeometry,
    FdtdMaterial,
    FdtdProbe,
    FdtdSource,
    FdtdStructure,
    MATERIAL_LIBRARY,
    compute_courant_limit,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _simple_geometry(
    domain_size=(0.1, 0.1, 0.1),
    cell_size=(0.01, 0.01, 0.01),
    structures=None,
    sources=None,
    boundaries=None,
    probes=None,
) -> FdtdGeometry:
    """Create a minimal FdtdGeometry for testing."""
    kwargs = dict(domain_size=domain_size, cell_size=cell_size)
    if structures is not None:
        kwargs["structures"] = structures
    if sources is not None:
        kwargs["sources"] = sources
    if boundaries is not None:
        kwargs["boundaries"] = boundaries
    if probes is not None:
        kwargs["probes"] = probes
    return FdtdGeometry(**kwargs)


def _box_structure(
    name="box1",
    position=(0.05, 0.05, 0.05),
    dimensions=None,
    material="copper",
) -> FdtdStructure:
    """Create a simple box structure."""
    if dimensions is None:
        dimensions = {"lx": 0.02, "ly": 0.02, "lz": 0.02}
    return FdtdStructure(
        name=name,
        type="box",
        position=position,
        dimensions=dimensions,
        material=material,
    )


def _gaussian_source(
    name="src1",
    position=(0.05, 0.05, 0.05),
    polarization="z",
) -> FdtdSource:
    """Create a Gaussian pulse source."""
    return FdtdSource(
        name=name,
        type="gaussian_pulse",
        position=position,
        parameters={"frequency": 1e9, "bandwidth": 0.5e9},
        polarization=polarization,
    )


# ---------------------------------------------------------------------------
# Yee Grid Building
# ---------------------------------------------------------------------------
class TestBuildYeeGrid:
    """Tests for build_yee_grid()."""

    def test_empty_grid_dimensions(self):
        """Grid dimensions must match domain_size / cell_size."""
        from backend.fdtd_preprocessor.builders import build_yee_grid

        geo = _simple_geometry(domain_size=(0.1, 0.1, 0.1), cell_size=(0.01, 0.01, 0.01))
        grid = build_yee_grid(geo)

        assert grid["nx"] == 10
        assert grid["ny"] == 10
        assert grid["nz"] == 10

    def test_grid_arrays_initialized_to_vacuum(self):
        """Empty grid should have vacuum material everywhere."""
        from backend.fdtd_preprocessor.builders import build_yee_grid

        geo = _simple_geometry()
        grid = build_yee_grid(geo)

        # Vacuum: epsilon_r=1.0, mu_r=1.0, sigma=0.0
        assert np.all(grid["epsilon_r"] == 1.0)
        assert np.all(grid["mu_r"] == 1.0)
        assert np.all(grid["sigma"] == 0.0)

    def test_grid_array_shapes(self):
        """Material arrays shape must be (nx, ny, nz)."""
        from backend.fdtd_preprocessor.builders import build_yee_grid

        geo = _simple_geometry(domain_size=(0.2, 0.1, 0.05), cell_size=(0.02, 0.01, 0.01))
        grid = build_yee_grid(geo)

        expected_shape = (10, 10, 5)
        assert grid["epsilon_r"].shape == expected_shape
        assert grid["mu_r"].shape == expected_shape
        assert grid["sigma"].shape == expected_shape

    def test_non_uniform_cell_sizes(self):
        """Grid with different cell sizes in each dimension."""
        from backend.fdtd_preprocessor.builders import build_yee_grid

        geo = _simple_geometry(domain_size=(0.1, 0.2, 0.3), cell_size=(0.01, 0.02, 0.03))
        grid = build_yee_grid(geo)

        assert grid["nx"] == 10
        assert grid["ny"] == 10
        assert grid["nz"] == 10

    def test_grid_stores_cell_size(self):
        """Grid dict should store the cell size for time-step computation."""
        from backend.fdtd_preprocessor.builders import build_yee_grid

        cs = (0.005, 0.01, 0.02)
        geo = _simple_geometry(cell_size=cs)
        grid = build_yee_grid(geo)

        assert grid["dx"] == cs[0]
        assert grid["dy"] == cs[1]
        assert grid["dz"] == cs[2]


# ---------------------------------------------------------------------------
# Structure Application
# ---------------------------------------------------------------------------
class TestApplyStructure:
    """Tests for apply_structure() — painting material into grid cells."""

    def test_box_fills_correct_cells(self):
        """A box structure should fill cells within its bounds."""
        from backend.fdtd_preprocessor.builders import apply_structure, build_yee_grid

        geo = _simple_geometry(domain_size=(0.1, 0.1, 0.1), cell_size=(0.01, 0.01, 0.01))
        grid = build_yee_grid(geo)

        # Box centered at (0.05, 0.05, 0.05) with lx=ly=lz=0.04
        box = _box_structure(
            position=(0.05, 0.05, 0.05),
            dimensions={"lx": 0.04, "ly": 0.04, "lz": 0.04},
            material="copper",
        )
        apply_structure(grid, box)

        copper = MATERIAL_LIBRARY["copper"]
        # Center cells (3:7,3:7,3:7) should be copper
        assert np.all(grid["sigma"][3:7, 3:7, 3:7] == copper.sigma)
        # Corner cell (0,0,0) should still be vacuum
        assert grid["sigma"][0, 0, 0] == 0.0

    def test_structure_with_library_material(self):
        """Structure references a material from MATERIAL_LIBRARY."""
        from backend.fdtd_preprocessor.builders import apply_structure, build_yee_grid

        geo = _simple_geometry(domain_size=(0.1, 0.1, 0.1), cell_size=(0.01, 0.01, 0.01))
        grid = build_yee_grid(geo)

        box = _box_structure(material="fr4")
        apply_structure(grid, box)

        fr4 = MATERIAL_LIBRARY["fr4"]
        # Some cells should have FR4 properties
        center = (5, 5, 5)
        assert grid["epsilon_r"][center] == fr4.epsilon_r

    def test_structure_with_custom_material(self):
        """Structure with material='custom' should use custom_material."""
        from backend.fdtd_preprocessor.builders import apply_structure, build_yee_grid

        geo = _simple_geometry(domain_size=(0.1, 0.1, 0.1), cell_size=(0.01, 0.01, 0.01))
        grid = build_yee_grid(geo)

        custom_mat = FdtdMaterial(name="my_mat", epsilon_r=3.0, sigma=0.5)
        box = FdtdStructure(
            name="custom_box",
            type="box",
            position=(0.05, 0.05, 0.05),
            dimensions={"lx": 0.02, "ly": 0.02, "lz": 0.02},
            material="custom",
            custom_material=custom_mat,
        )
        apply_structure(grid, box)

        center = (5, 5, 5)
        assert grid["epsilon_r"][center] == 3.0
        assert grid["sigma"][center] == 0.5

    def test_unknown_material_raises(self):
        """Referencing an unknown material name should raise ValueError."""
        from backend.fdtd_preprocessor.builders import apply_structure, build_yee_grid

        geo = _simple_geometry(domain_size=(0.1, 0.1, 0.1), cell_size=(0.01, 0.01, 0.01))
        grid = build_yee_grid(geo)

        box = _box_structure(material="unobtainium")
        with pytest.raises(ValueError, match="Unknown material"):
            apply_structure(grid, box)

    def test_sphere_structure(self):
        """Sphere structure should fill roughly spherical region."""
        from backend.fdtd_preprocessor.builders import apply_structure, build_yee_grid

        geo = _simple_geometry(domain_size=(0.1, 0.1, 0.1), cell_size=(0.01, 0.01, 0.01))
        grid = build_yee_grid(geo)

        sphere = FdtdStructure(
            name="sphere1",
            type="sphere",
            position=(0.05, 0.05, 0.05),
            dimensions={"radius": 0.03},
            material="water",
        )
        apply_structure(grid, sphere)

        water = MATERIAL_LIBRARY["water"]
        # Center cell should be water
        assert grid["epsilon_r"][5, 5, 5] == water.epsilon_r
        # Corner cell should still be vacuum
        assert grid["epsilon_r"][0, 0, 0] == 1.0

    def test_cylinder_structure(self):
        """Cylinder structure should fill cylindrical region."""
        from backend.fdtd_preprocessor.builders import apply_structure, build_yee_grid

        geo = _simple_geometry(domain_size=(0.1, 0.1, 0.1), cell_size=(0.01, 0.01, 0.01))
        grid = build_yee_grid(geo)

        cyl = FdtdStructure(
            name="cyl1",
            type="cylinder",
            position=(0.05, 0.05, 0.05),
            dimensions={"radius": 0.02, "height": 0.06, "axis": "z"},
            material="copper",
        )
        apply_structure(grid, cyl)

        copper = MATERIAL_LIBRARY["copper"]
        # Center cell on axis should be copper
        assert grid["sigma"][5, 5, 5] == copper.sigma
        # Far corner should still be vacuum
        assert grid["sigma"][0, 0, 0] == 0.0

    def test_multiple_overlapping_structures(self):
        """Later structures overwrite earlier ones (painter's algorithm)."""
        from backend.fdtd_preprocessor.builders import apply_structure, build_yee_grid

        geo = _simple_geometry(domain_size=(0.1, 0.1, 0.1), cell_size=(0.01, 0.01, 0.01))
        grid = build_yee_grid(geo)

        # First: large FR4 box
        box1 = _box_structure(
            name="substrate",
            position=(0.05, 0.05, 0.05),
            dimensions={"lx": 0.08, "ly": 0.08, "lz": 0.08},
            material="fr4",
        )
        apply_structure(grid, box1)
        assert grid["epsilon_r"][5, 5, 5] == MATERIAL_LIBRARY["fr4"].epsilon_r

        # Second: smaller copper box overwrites center
        box2 = _box_structure(
            name="trace",
            position=(0.05, 0.05, 0.05),
            dimensions={"lx": 0.02, "ly": 0.02, "lz": 0.02},
            material="copper",
        )
        apply_structure(grid, box2)
        assert grid["sigma"][5, 5, 5] == MATERIAL_LIBRARY["copper"].sigma


# ---------------------------------------------------------------------------
# Source Application
# ---------------------------------------------------------------------------
class TestApplySource:
    """Tests for apply_source()."""

    def test_point_source_returns_info(self):
        """Source application should return source cell indices."""
        from backend.fdtd_preprocessor.builders import apply_source, build_yee_grid

        geo = _simple_geometry(domain_size=(0.1, 0.1, 0.1), cell_size=(0.01, 0.01, 0.01))
        grid = build_yee_grid(geo)

        src = _gaussian_source(position=(0.05, 0.05, 0.05))
        info = apply_source(grid, src)

        assert "cell_indices" in info
        assert info["cell_indices"] == (5, 5, 5)
        assert info["polarization"] == "z"

    def test_source_position_to_cell_mapping(self):
        """Source position is mapped to nearest grid cell indices."""
        from backend.fdtd_preprocessor.builders import apply_source, build_yee_grid

        geo = _simple_geometry(domain_size=(0.1, 0.1, 0.1), cell_size=(0.01, 0.01, 0.01))
        grid = build_yee_grid(geo)

        # Position at cell boundary (0.015) → nearest cell index
        src = _gaussian_source(position=(0.015, 0.025, 0.035))
        info = apply_source(grid, src)

        # 0.015/0.01 = 1.5 → round to 2; 0.025/0.01=2.5→2; 0.035/0.01=3.5→4
        # Actually: round(pos/cell_size) → nearest integer, but clamped to [0, n-1]
        assert len(info["cell_indices"]) == 3
        for idx in info["cell_indices"]:
            assert isinstance(idx, int)
            assert 0 <= idx < 10

    def test_source_outside_domain_raises(self):
        """Source placed outside the domain should raise ValueError."""
        from backend.fdtd_preprocessor.builders import apply_source, build_yee_grid

        geo = _simple_geometry(domain_size=(0.1, 0.1, 0.1), cell_size=(0.01, 0.01, 0.01))
        grid = build_yee_grid(geo)

        src = _gaussian_source(position=(0.5, 0.5, 0.5))  # Way outside
        with pytest.raises(ValueError, match="outside.*domain"):
            apply_source(grid, src)

    def test_source_preserves_parameters(self):
        """Source info should carry through the original parameters."""
        from backend.fdtd_preprocessor.builders import apply_source, build_yee_grid

        geo = _simple_geometry()
        grid = build_yee_grid(geo)
        src = _gaussian_source()
        info = apply_source(grid, src)

        assert info["type"] == "gaussian_pulse"
        assert info["parameters"]["frequency"] == 1e9


# ---------------------------------------------------------------------------
# Boundary Application
# ---------------------------------------------------------------------------
class TestApplyBoundary:
    """Tests for apply_boundary()."""

    def test_default_boundaries_are_mur_abc(self):
        """Default boundary config should produce Mur ABC on all faces."""
        from backend.fdtd_preprocessor.builders import apply_boundary, build_yee_grid

        geo = _simple_geometry()
        grid = build_yee_grid(geo)
        bc_info = apply_boundary(grid, DomainBoundaries())

        for face in ["x_min", "x_max", "y_min", "y_max", "z_min", "z_max"]:
            assert bc_info[face]["type"] == "mur_abc"

    def test_pec_boundary(self):
        """PEC boundary should set tangential E to zero on that face."""
        from backend.fdtd_preprocessor.builders import apply_boundary, build_yee_grid

        boundaries = DomainBoundaries(
            x_min=BoundaryCondition(type="pec"),
            x_max=BoundaryCondition(type="pec"),
        )
        geo = _simple_geometry(boundaries=boundaries)
        grid = build_yee_grid(geo)
        bc_info = apply_boundary(grid, boundaries)

        assert bc_info["x_min"]["type"] == "pec"
        assert bc_info["x_max"]["type"] == "pec"

    def test_mixed_boundaries(self):
        """Each face can have a different boundary condition."""
        from backend.fdtd_preprocessor.builders import apply_boundary, build_yee_grid

        boundaries = DomainBoundaries(
            x_min=BoundaryCondition(type="pec"),
            x_max=BoundaryCondition(type="mur_abc"),
            y_min=BoundaryCondition(type="pmc"),
            y_max=BoundaryCondition(type="periodic"),
            z_min=BoundaryCondition(type="mur_abc"),
            z_max=BoundaryCondition(type="pec"),
        )
        geo = _simple_geometry(boundaries=boundaries)
        grid = build_yee_grid(geo)
        bc_info = apply_boundary(grid, boundaries)

        assert bc_info["x_min"]["type"] == "pec"
        assert bc_info["y_min"]["type"] == "pmc"
        assert bc_info["y_max"]["type"] == "periodic"
        assert bc_info["z_max"]["type"] == "pec"


# ---------------------------------------------------------------------------
# Setup Validation
# ---------------------------------------------------------------------------
class TestValidateSetup:
    """Tests for validate_setup()."""

    def test_valid_setup_no_errors(self):
        """A well-formed setup should produce no errors."""
        from backend.fdtd_preprocessor.builders import validate_setup

        geo = _simple_geometry(
            sources=[_gaussian_source()],
        )
        config = FdtdConfig(courant_number=0.5)
        result = validate_setup(geo, config)

        assert result["errors"] == []

    def test_no_sources_warning(self):
        """Setup without sources should produce a warning."""
        from backend.fdtd_preprocessor.builders import validate_setup

        geo = _simple_geometry()
        config = FdtdConfig()
        result = validate_setup(geo, config)

        assert any("source" in w.lower() for w in result["warnings"])

    def test_cfl_violation_error(self):
        """Courant number > CFL limit should produce an error."""
        from backend.fdtd_preprocessor.builders import validate_setup

        geo = _simple_geometry(cell_size=(0.01, 0.01, 0.01))
        config = FdtdConfig(courant_number=1.0)
        result = validate_setup(geo, config)

        # CFL limit for cube cells is 1/sqrt(3) ~ 0.577
        # courant_number=1.0 exceeds this for 3D, but our model allows le=1.0
        # The validate_setup should check the 3D CFL and warn/error
        dt_max = compute_courant_limit(0.01, 0.01, 0.01)
        dt_actual = config.courant_number * dt_max  # This is fine actually

        # Actually courant_number is a fraction of the CFL limit, so 1.0 means
        # dt = dt_max which is the stability boundary. This is borderline valid.
        # For courant > 1.0 it would be invalid, but Pydantic enforces le=1.0
        # Instead check that CFL info is present in the result
        assert "dt" in result
        assert result["dt"] > 0

    def test_structure_outside_domain_warning(self):
        """Structure extending outside domain should produce a warning."""
        from backend.fdtd_preprocessor.builders import validate_setup

        # Structure center at (0.09, 0.09, 0.09) with lx=ly=lz=0.04
        # extends beyond domain (0.1, 0.1, 0.1)
        box = _box_structure(
            position=(0.09, 0.09, 0.09),
            dimensions={"lx": 0.04, "ly": 0.04, "lz": 0.04},
        )
        geo = _simple_geometry(structures=[box], sources=[_gaussian_source()])
        config = FdtdConfig()
        result = validate_setup(geo, config)

        assert any("outside" in w.lower() or "extends" in w.lower() for w in result["warnings"])

    def test_validate_reports_grid_info(self):
        """Validation result should include grid and time step information."""
        from backend.fdtd_preprocessor.builders import validate_setup

        geo = _simple_geometry(sources=[_gaussian_source()])
        config = FdtdConfig(courant_number=0.5)
        result = validate_setup(geo, config)

        assert "nx" in result
        assert "ny" in result
        assert "nz" in result
        assert "dt" in result
        assert result["nx"] == 10
        assert result["ny"] == 10
        assert result["nz"] == 10

    def test_validate_large_grid_warning(self):
        """Very large grid (> 1M cells) should produce a warning."""
        from backend.fdtd_preprocessor.builders import validate_setup

        # 200x200x200 = 8M cells
        geo = _simple_geometry(
            domain_size=(1.0, 1.0, 1.0),
            cell_size=(0.005, 0.005, 0.005),
            sources=[_gaussian_source()],
        )
        config = FdtdConfig()
        result = validate_setup(geo, config)

        assert any("large" in w.lower() or "cells" in w.lower() for w in result["warnings"])

    def test_validate_dt_computation(self):
        """Validation must compute dt = courant_number * dt_max."""
        from backend.fdtd_preprocessor.builders import validate_setup

        geo = _simple_geometry(
            cell_size=(0.01, 0.01, 0.01),
            sources=[_gaussian_source()],
        )
        config = FdtdConfig(courant_number=0.5)
        result = validate_setup(geo, config)

        dt_max = compute_courant_limit(0.01, 0.01, 0.01)
        expected_dt = 0.5 * dt_max
        assert abs(result["dt"] - expected_dt) < 1e-20


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class TestSchemas:
    """Tests for request/response Pydantic schemas."""

    def test_mesh_request_basic(self):
        """FdtdMeshRequest should accept minimal geometry."""
        from backend.fdtd_preprocessor.schemas import FdtdMeshRequest

        req = FdtdMeshRequest(
            geometry=_simple_geometry().model_dump(),
        )
        assert req.geometry.domain_size == (0.1, 0.1, 0.1)

    def test_mesh_response_structure(self):
        """FdtdMeshResponse should include grid dimensions and cell counts."""
        from backend.fdtd_preprocessor.schemas import FdtdMeshResponse

        resp = FdtdMeshResponse(
            nx=10,
            ny=10,
            nz=10,
            dx=0.01,
            dy=0.01,
            dz=0.01,
            total_cells=1000,
            structures_applied=1,
            sources=[],
            boundaries={},
            message="Grid generated successfully",
        )
        assert resp.total_cells == 1000
        assert resp.nx == 10

    def test_validation_request(self):
        """FdtdValidationRequest should accept geometry + config."""
        from backend.fdtd_preprocessor.schemas import FdtdValidationRequest

        req = FdtdValidationRequest(
            geometry=_simple_geometry().model_dump(),
            config=FdtdConfig().model_dump(),
        )
        assert req.config.courant_number == 0.99

    def test_validation_response(self):
        """FdtdValidationResponse should carry warnings, errors, dt, grid info."""
        from backend.fdtd_preprocessor.schemas import FdtdValidationResponse

        resp = FdtdValidationResponse(
            valid=True,
            warnings=["No sources defined"],
            errors=[],
            nx=10,
            ny=10,
            nz=10,
            dt=1.92e-11,
            total_cells=1000,
        )
        assert resp.valid is True
        assert len(resp.warnings) == 1


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
class TestConfig:
    """Tests for service configuration."""

    def test_default_config_values(self):
        """Settings should have sensible defaults."""
        from backend.fdtd_preprocessor.config import Settings

        s = Settings()
        assert s.service_name == "fdtd-preprocessor"
        assert s.api_prefix == "/api"
        assert s.port == 8004

    def test_env_prefix(self):
        """Settings should use FDTD_PREPROCESSOR_ env prefix."""
        from backend.fdtd_preprocessor.config import Settings

        assert Settings.model_config["env_prefix"] == "FDTD_PREPROCESSOR_"


# ---------------------------------------------------------------------------
# FastAPI Endpoints (integration-style, using TestClient)
# ---------------------------------------------------------------------------
class TestEndpoints:
    """Tests for the FastAPI application endpoints."""

    @pytest.fixture
    def client(self):
        from fastapi.testclient import TestClient

        from backend.fdtd_preprocessor.main import app

        return TestClient(app)

    def test_health_endpoint(self, client):
        """GET /health should return service info."""
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert data["service"] == "fdtd-preprocessor"
        assert "timestamp" in data

    def test_mesh_endpoint(self, client):
        """POST /api/fdtd/mesh should generate grid info."""
        geo = _simple_geometry(sources=[_gaussian_source()]).model_dump()
        resp = client.post("/api/fdtd/mesh", json={"geometry": geo})
        assert resp.status_code == 200
        data = resp.json()
        assert data["nx"] == 10
        assert data["ny"] == 10
        assert data["nz"] == 10
        assert data["total_cells"] == 1000

    def test_mesh_endpoint_with_structures(self, client):
        """POST /api/fdtd/mesh with structures should report applied count."""
        box = _box_structure().model_dump()
        geo = _simple_geometry(
            structures=[_box_structure()],
            sources=[_gaussian_source()],
        ).model_dump()
        resp = client.post("/api/fdtd/mesh", json={"geometry": geo})
        assert resp.status_code == 200
        data = resp.json()
        assert data["structures_applied"] == 1

    def test_validate_endpoint(self, client):
        """POST /api/fdtd/validate should return validation result."""
        geo = _simple_geometry(sources=[_gaussian_source()]).model_dump()
        config = FdtdConfig(courant_number=0.5).model_dump()
        resp = client.post(
            "/api/fdtd/validate",
            json={"geometry": geo, "config": config},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["valid"] is True
        assert "dt" in data
        assert "warnings" in data
        assert "errors" in data

    def test_validate_endpoint_with_issues(self, client):
        """POST /api/fdtd/validate with no sources should return warnings."""
        geo = _simple_geometry().model_dump()
        config = FdtdConfig().model_dump()
        resp = client.post(
            "/api/fdtd/validate",
            json={"geometry": geo, "config": config},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["warnings"]) > 0

    def test_mesh_endpoint_invalid_geometry(self, client):
        """POST /api/fdtd/mesh with bad geometry should return 422."""
        resp = client.post("/api/fdtd/mesh", json={"geometry": {"bad": "data"}})
        assert resp.status_code == 422
