"""Tests for Gmsh discretization applier — configures mesh sizing in Gmsh."""

import pytest

gmsh = pytest.importorskip("gmsh")

from backend.common.models.fem.geometry import DiscretizationSettings
from backend.fem_preprocessor.mesher.discretization import GmshDiscretizationApplier


@pytest.fixture(autouse=True)
def _gmsh_session():
    """Initialize and finalize Gmsh for each test."""
    gmsh.initialize()
    gmsh.option.setNumber("General.Terminal", 0)
    yield
    gmsh.finalize()


def _create_rectangle():
    """Create a unit rectangle and return the surface tag."""
    tag = gmsh.model.occ.addRectangle(0, 0, 0, 1, 1)
    gmsh.model.occ.synchronize()
    return tag


class TestGlobalSettings:
    """Test that global discretization settings are applied."""

    def test_global_element_size(self):
        tag = _create_rectangle()
        settings = DiscretizationSettings(global_element_size=0.1)
        applier = GmshDiscretizationApplier()
        applier.apply(settings)

        # Mesh size max should be set
        val = gmsh.option.getNumber("Mesh.MeshSizeMax")
        assert abs(val - 0.1) < 1e-10

    def test_min_element_size(self):
        tag = _create_rectangle()
        settings = DiscretizationSettings(global_element_size=0.5, min_element_size=0.05)
        applier = GmshDiscretizationApplier()
        applier.apply(settings)

        val = gmsh.option.getNumber("Mesh.MeshSizeMin")
        assert abs(val - 0.05) < 1e-10

    def test_growth_rate(self):
        tag = _create_rectangle()
        settings = DiscretizationSettings(growth_rate=1.5)
        applier = GmshDiscretizationApplier()
        applier.apply(settings)

        val = gmsh.option.getNumber("Mesh.MeshSizeFactor")
        assert abs(val - 1.5) < 1e-10


class TestAlgorithm:
    """Test mesh algorithm selection."""

    @pytest.mark.parametrize(
        "algo_name,expected_number",
        [
            ("meshadapt", 1),
            ("automatic", 2),
            ("frontal_delaunay", 6),
            ("delaunay", 5),
        ],
    )
    def test_algorithm_mapping(self, algo_name, expected_number):
        _create_rectangle()
        settings = DiscretizationSettings(algorithm=algo_name)
        applier = GmshDiscretizationApplier()
        applier.apply(settings)

        val = gmsh.option.getNumber("Mesh.Algorithm")
        assert int(val) == expected_number


class TestOptimize:
    """Test mesh optimization flag."""

    def test_optimize_enabled(self):
        _create_rectangle()
        settings = DiscretizationSettings(optimize=True)
        applier = GmshDiscretizationApplier()
        applier.apply(settings)

        val = gmsh.option.getNumber("Mesh.Optimize")
        assert int(val) == 1

    def test_optimize_disabled(self):
        _create_rectangle()
        settings = DiscretizationSettings(optimize=False)
        applier = GmshDiscretizationApplier()
        applier.apply(settings)

        val = gmsh.option.getNumber("Mesh.Optimize")
        assert int(val) == 0


class TestRecombine:
    """Test recombine-to-quads setting."""

    def test_recombine_sets_option(self):
        tag = _create_rectangle()
        settings = DiscretizationSettings(recombine_to_quads=True)
        applier = GmshDiscretizationApplier()
        applier.apply(settings, surface_tags=[tag])

        # After meshing, should produce quads
        gmsh.option.setNumber("Mesh.MeshSizeMax", 0.5)
        gmsh.model.mesh.generate(2)

        # Check that recombination was applied (quads present)
        elem_types, _, _ = gmsh.model.mesh.getElements(dim=2)
        # Gmsh type 3 = QUAD4
        assert 3 in elem_types


class TestAutoElementSize:
    """Test auto element size computation."""

    def test_auto_computes_reasonable_size(self):
        """When size is 'auto', should compute from geometry bounding box."""
        _create_rectangle()
        settings = DiscretizationSettings(global_element_size="auto")
        applier = GmshDiscretizationApplier()
        applier.apply(settings)

        val = gmsh.option.getNumber("Mesh.MeshSizeMax")
        # For a 1×1 rectangle, auto should give something reasonable (e.g., 0.1–0.5)
        assert 0.01 < val < 1.0
