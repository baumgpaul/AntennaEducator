"""
Tests for FDTD domain models.

Covers: model validation, material library completeness, CFL computation,
boundary defaults, probe configuration, and geometry constraints.
"""

import math

import pytest
from pydantic import ValidationError

from backend.common.constants import C_0, EPSILON_0, MU_0
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
# FdtdMaterial
# ---------------------------------------------------------------------------
class TestFdtdMaterial:
    """Tests for the FdtdMaterial model."""

    def test_default_material_is_vacuum(self):
        """Default material should have vacuum properties."""
        mat = FdtdMaterial(name="vacuum")
        assert mat.epsilon_r == 1.0
        assert mat.mu_r == 1.0
        assert mat.sigma == 0.0

    def test_custom_dielectric(self):
        """Custom dielectric with permittivity and loss."""
        mat = FdtdMaterial(name="fr4", epsilon_r=4.4, sigma=0.02)
        assert mat.epsilon_r == 4.4
        assert mat.sigma == 0.02

    def test_negative_permittivity_rejected(self):
        """epsilon_r must be >= 1.0 for non-dispersive materials."""
        with pytest.raises(ValidationError):
            FdtdMaterial(name="bad", epsilon_r=0.5)

    def test_negative_permeability_rejected(self):
        """mu_r must be >= 1.0 for non-dispersive materials."""
        with pytest.raises(ValidationError):
            FdtdMaterial(name="bad", mu_r=-1.0)

    def test_negative_conductivity_rejected(self):
        """sigma must be >= 0."""
        with pytest.raises(ValidationError):
            FdtdMaterial(name="bad", sigma=-1.0)

    def test_color_field(self):
        """Material should store a visualization color."""
        mat = FdtdMaterial(name="copper", color="#B87333")
        assert mat.color == "#B87333"


# ---------------------------------------------------------------------------
# MATERIAL_LIBRARY
# ---------------------------------------------------------------------------
class TestMaterialLibrary:
    """Tests for the built-in material library."""

    def test_library_is_nonempty(self):
        """Library should contain predefined materials."""
        assert len(MATERIAL_LIBRARY) > 0

    def test_vacuum_in_library(self):
        """Vacuum/free-space must be in the library."""
        assert "vacuum" in MATERIAL_LIBRARY
        vac = MATERIAL_LIBRARY["vacuum"]
        assert vac.epsilon_r == 1.0
        assert vac.mu_r == 1.0
        assert vac.sigma == 0.0

    def test_copper_in_library(self):
        """Copper must be in the library with high conductivity."""
        assert "copper" in MATERIAL_LIBRARY
        cu = MATERIAL_LIBRARY["copper"]
        assert cu.sigma > 1e6

    def test_fr4_in_library(self):
        """FR-4 PCB substrate must be in the library."""
        assert "fr4" in MATERIAL_LIBRARY
        fr4 = MATERIAL_LIBRARY["fr4"]
        assert 4.0 <= fr4.epsilon_r <= 5.0

    def test_all_entries_are_fdtd_material(self):
        """Every library entry must be an FdtdMaterial instance."""
        for name, mat in MATERIAL_LIBRARY.items():
            assert isinstance(mat, FdtdMaterial), f"{name} is not FdtdMaterial"

    def test_biological_tissues_present(self):
        """Library should include biological tissue materials for SAR demos."""
        bio_materials = {"skin", "bone", "brain"}
        available = set(MATERIAL_LIBRARY.keys())
        assert bio_materials.issubset(available), (
            f"Missing bio materials: {bio_materials - available}"
        )

    def test_soil_materials_present(self):
        """Library should include soil materials for GPR demos."""
        assert "dry_soil" in MATERIAL_LIBRARY
        assert "wet_soil" in MATERIAL_LIBRARY


# ---------------------------------------------------------------------------
# FdtdStructure
# ---------------------------------------------------------------------------
class TestFdtdStructure:
    """Tests for the FdtdStructure model."""

    def test_box_structure(self):
        """Create a valid box structure."""
        s = FdtdStructure(
            name="substrate",
            type="box",
            position=(0.0, 0.0, 0.0),
            dimensions={"width": 0.01, "height": 0.001, "depth": 0.01},
            material="fr4",
        )
        assert s.type == "box"
        assert s.material == "fr4"
        assert s.id is not None

    def test_cylinder_structure(self):
        """Create a valid cylinder structure."""
        s = FdtdStructure(
            name="wire",
            type="cylinder",
            position=(0.0, 0.0, 0.0),
            dimensions={"radius": 0.001, "height": 0.05},
            material="copper",
        )
        assert s.type == "cylinder"

    def test_invalid_type_rejected(self):
        """Only allowed structure types should be accepted."""
        with pytest.raises(ValidationError):
            FdtdStructure(
                name="bad",
                type="pyramid",
                position=(0.0, 0.0, 0.0),
                dimensions={},
                material="copper",
            )

    def test_custom_material_override(self):
        """Structure can carry a custom material definition."""
        custom = FdtdMaterial(name="my_dielectric", epsilon_r=2.5)
        s = FdtdStructure(
            name="block",
            type="box",
            position=(0.0, 0.0, 0.0),
            dimensions={"width": 0.01, "height": 0.01, "depth": 0.01},
            material="custom",
            custom_material=custom,
        )
        assert s.custom_material is not None
        assert s.custom_material.epsilon_r == 2.5

    def test_auto_generated_id(self):
        """Each structure should get a unique auto-generated ID."""
        s1 = FdtdStructure(
            name="a", type="box", position=(0, 0, 0),
            dimensions={}, material="vacuum",
        )
        s2 = FdtdStructure(
            name="b", type="box", position=(0, 0, 0),
            dimensions={}, material="vacuum",
        )
        assert s1.id != s2.id


# ---------------------------------------------------------------------------
# FdtdSource
# ---------------------------------------------------------------------------
class TestFdtdSource:
    """Tests for the FdtdSource model."""

    def test_gaussian_pulse_source(self):
        """Create a valid Gaussian pulse source."""
        src = FdtdSource(
            name="excitation",
            type="gaussian_pulse",
            position=(0.0, 0.0, 0.0),
            parameters={"frequency": 1e9, "bandwidth": 0.5e9},
        )
        assert src.type == "gaussian_pulse"
        assert src.polarization == "z"  # default

    def test_sinusoidal_source(self):
        """Create a valid sinusoidal source."""
        src = FdtdSource(
            name="cw",
            type="sinusoidal",
            position=(0.0, 0.0, 0.0),
            parameters={"frequency": 2.4e9, "amplitude": 1.0},
            polarization="x",
        )
        assert src.polarization == "x"

    def test_invalid_source_type_rejected(self):
        """Only allowed source types should be accepted."""
        with pytest.raises(ValidationError):
            FdtdSource(
                name="bad",
                type="impulse",
                position=(0.0, 0.0, 0.0),
                parameters={},
            )

    def test_invalid_polarization_rejected(self):
        """Polarization must be x, y, or z."""
        with pytest.raises(ValidationError):
            FdtdSource(
                name="bad",
                type="gaussian_pulse",
                position=(0.0, 0.0, 0.0),
                parameters={},
                polarization="w",
            )

    def test_auto_generated_id(self):
        """Each source should get a unique auto-generated ID."""
        src1 = FdtdSource(
            name="a", type="gaussian_pulse",
            position=(0, 0, 0), parameters={},
        )
        src2 = FdtdSource(
            name="b", type="gaussian_pulse",
            position=(0, 0, 0), parameters={},
        )
        assert src1.id != src2.id


# ---------------------------------------------------------------------------
# BoundaryCondition / DomainBoundaries
# ---------------------------------------------------------------------------
class TestBoundaryConditions:
    """Tests for boundary condition models."""

    def test_default_boundary_is_mur(self):
        """Default boundary type should be Mur ABC."""
        bc = BoundaryCondition()
        assert bc.type == "mur_abc"

    def test_pec_boundary(self):
        """PEC boundary should be accepted."""
        bc = BoundaryCondition(type="pec")
        assert bc.type == "pec"

    def test_invalid_boundary_rejected(self):
        """Invalid boundary types should be rejected."""
        with pytest.raises(ValidationError):
            BoundaryCondition(type="open")

    def test_domain_boundaries_all_default_mur(self):
        """All 6 faces should default to Mur ABC."""
        db = DomainBoundaries()
        for face in ["x_min", "x_max", "y_min", "y_max", "z_min", "z_max"]:
            bc = getattr(db, face)
            assert bc.type == "mur_abc", f"{face} should default to mur_abc"

    def test_mixed_boundaries(self):
        """Should allow different boundary types per face."""
        db = DomainBoundaries(
            x_min=BoundaryCondition(type="pec"),
            x_max=BoundaryCondition(type="pec"),
            y_min=BoundaryCondition(type="pmc"),
            y_max=BoundaryCondition(type="pmc"),
        )
        assert db.x_min.type == "pec"
        assert db.y_min.type == "pmc"
        assert db.z_min.type == "mur_abc"  # default


# ---------------------------------------------------------------------------
# FdtdProbe
# ---------------------------------------------------------------------------
class TestFdtdProbe:
    """Tests for the FdtdProbe model."""

    def test_point_probe(self):
        """Create a valid point probe."""
        p = FdtdProbe(
            name="observer",
            type="point",
            position=(0.01, 0.02, 0.0),
        )
        assert p.type == "point"
        assert p.fields == ["Ez"]  # default

    def test_line_probe_with_direction(self):
        """Line probe should have a direction vector."""
        p = FdtdProbe(
            name="line",
            type="line",
            position=(0.0, 0.0, 0.0),
            direction=(0.1, 0.0, 0.0),
            fields=["Ex", "Ey"],
        )
        assert p.type == "line"
        assert len(p.fields) == 2

    def test_plane_probe_with_extent(self):
        """Plane probe should have an extent."""
        p = FdtdProbe(
            name="plane",
            type="plane",
            position=(0.0, 0.0, 0.0),
            extent=(0.1, 0.1),
            fields=["Ez", "Hx", "Hy"],
        )
        assert p.type == "plane"
        assert len(p.fields) == 3

    def test_invalid_probe_type_rejected(self):
        """Only allowed probe types should be accepted."""
        with pytest.raises(ValidationError):
            FdtdProbe(name="bad", type="volume", position=(0, 0, 0))

    def test_invalid_field_component_rejected(self):
        """Only valid field components (Ex, Ey, Ez, Hx, Hy, Hz) accepted."""
        with pytest.raises(ValidationError):
            FdtdProbe(
                name="bad", type="point",
                position=(0, 0, 0),
                fields=["Bx"],
            )


# ---------------------------------------------------------------------------
# FdtdGeometry
# ---------------------------------------------------------------------------
class TestFdtdGeometry:
    """Tests for the FdtdGeometry model."""

    def test_minimal_geometry(self):
        """Create a minimal valid geometry (empty domain)."""
        geo = FdtdGeometry(
            domain_size=(0.1, 0.1, 0.1),
            cell_size=(0.001, 0.001, 0.001),
        )
        assert geo.domain_size == (0.1, 0.1, 0.1)
        assert len(geo.structures) == 0
        assert len(geo.sources) == 0
        assert len(geo.probes) == 0

    def test_geometry_with_structures_and_sources(self):
        """Geometry can contain structures, sources, and probes."""
        geo = FdtdGeometry(
            domain_size=(0.1, 0.1, 0.05),
            cell_size=(0.001, 0.001, 0.001),
            structures=[
                FdtdStructure(
                    name="block", type="box",
                    position=(0.05, 0.05, 0.025),
                    dimensions={"width": 0.02, "height": 0.01, "depth": 0.02},
                    material="fr4",
                ),
            ],
            sources=[
                FdtdSource(
                    name="pulse", type="gaussian_pulse",
                    position=(0.01, 0.05, 0.025),
                    parameters={"frequency": 1e9, "bandwidth": 0.5e9},
                ),
            ],
            probes=[
                FdtdProbe(
                    name="obs", type="point",
                    position=(0.09, 0.05, 0.025),
                ),
            ],
        )
        assert len(geo.structures) == 1
        assert len(geo.sources) == 1
        assert len(geo.probes) == 1

    def test_grid_dimensions_property(self):
        """Geometry should compute grid dimensions from domain and cell size."""
        geo = FdtdGeometry(
            domain_size=(0.1, 0.05, 0.02),
            cell_size=(0.001, 0.001, 0.001),
        )
        nx, ny, nz = geo.grid_dimensions
        assert nx == 100
        assert ny == 50
        assert nz == 20

    def test_default_boundaries_are_mur(self):
        """Geometry defaults to Mur ABC on all faces."""
        geo = FdtdGeometry(
            domain_size=(0.1, 0.1, 0.1),
            cell_size=(0.001, 0.001, 0.001),
        )
        assert geo.boundaries.x_min.type == "mur_abc"

    def test_positive_domain_size_required(self):
        """Domain size dimensions must be positive."""
        with pytest.raises(ValidationError):
            FdtdGeometry(
                domain_size=(0.0, 0.1, 0.1),
                cell_size=(0.001, 0.001, 0.001),
            )

    def test_positive_cell_size_required(self):
        """Cell size dimensions must be positive."""
        with pytest.raises(ValidationError):
            FdtdGeometry(
                domain_size=(0.1, 0.1, 0.1),
                cell_size=(0.0, 0.001, 0.001),
            )


# ---------------------------------------------------------------------------
# FdtdConfig
# ---------------------------------------------------------------------------
class TestFdtdConfig:
    """Tests for the FdtdConfig model."""

    def test_default_config(self):
        """Default config should have sensible values."""
        cfg = FdtdConfig()
        assert cfg.num_time_steps == 1000
        assert 0 < cfg.courant_number <= 1.0
        assert cfg.output_every_n_steps > 0

    def test_custom_config(self):
        """Custom config values should be accepted."""
        cfg = FdtdConfig(
            num_time_steps=5000,
            courant_number=0.5,
            output_every_n_steps=50,
            dft_frequencies=[1e9, 2e9, 3e9],
            auto_shutoff_threshold=1e-8,
        )
        assert cfg.num_time_steps == 5000
        assert len(cfg.dft_frequencies) == 3

    def test_zero_time_steps_rejected(self):
        """num_time_steps must be positive."""
        with pytest.raises(ValidationError):
            FdtdConfig(num_time_steps=0)

    def test_courant_number_too_high_rejected(self):
        """Courant number must be <= 1.0."""
        with pytest.raises(ValidationError):
            FdtdConfig(courant_number=1.5)

    def test_courant_number_too_low_rejected(self):
        """Courant number must be > 0."""
        with pytest.raises(ValidationError):
            FdtdConfig(courant_number=0.0)

    def test_negative_shutoff_threshold_rejected(self):
        """auto_shutoff_threshold must be positive."""
        with pytest.raises(ValidationError):
            FdtdConfig(auto_shutoff_threshold=-1.0)


# ---------------------------------------------------------------------------
# compute_courant_limit
# ---------------------------------------------------------------------------
class TestCourantLimit:
    """Tests for CFL stability limit computation."""

    def test_1d_courant_limit(self):
        """1D CFL: dt_max = dx / c."""
        dx = 0.001  # 1 mm
        dt_max = compute_courant_limit(dx)
        expected = dx / C_0
        assert abs(dt_max - expected) / expected < 1e-10

    def test_2d_courant_limit(self):
        """2D CFL: dt_max = 1 / (c * sqrt(1/dx² + 1/dy²))."""
        dx = 0.001
        dy = 0.002
        dt_max = compute_courant_limit(dx, dy)
        expected = 1.0 / (C_0 * math.sqrt(1.0 / dx**2 + 1.0 / dy**2))
        assert abs(dt_max - expected) / expected < 1e-10

    def test_3d_courant_limit(self):
        """3D CFL: dt_max = 1 / (c * sqrt(1/dx² + 1/dy² + 1/dz²))."""
        dx, dy, dz = 0.001, 0.001, 0.001
        dt_max = compute_courant_limit(dx, dy, dz)
        expected = 1.0 / (C_0 * math.sqrt(3.0 / dx**2))
        assert abs(dt_max - expected) / expected < 1e-10

    def test_3d_smaller_than_1d(self):
        """3D CFL limit should be tighter (smaller dt) than 1D for same dx."""
        dx = 0.001
        dt_1d = compute_courant_limit(dx)
        dt_3d = compute_courant_limit(dx, dx, dx)
        assert dt_3d < dt_1d

    def test_uniform_3d_equals_dx_over_c_sqrt3(self):
        """For uniform grid: dt_max = dx / (c * sqrt(3))."""
        dx = 0.001
        dt_max = compute_courant_limit(dx, dx, dx)
        expected = dx / (C_0 * math.sqrt(3.0))
        assert abs(dt_max - expected) / expected < 1e-10

    def test_custom_speed(self):
        """CFL with custom wave speed (e.g., in dielectric)."""
        dx = 0.001
        c_medium = C_0 / 2.0  # epsilon_r = 4
        dt_max = compute_courant_limit(dx, c=c_medium)
        expected = dx / c_medium
        assert abs(dt_max - expected) / expected < 1e-10
