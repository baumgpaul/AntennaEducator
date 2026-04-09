"""Tests for Gmsh mesh extractor — converts Gmsh model to FEMMesh."""

import pytest

gmsh = pytest.importorskip("gmsh")

from backend.common.models.fem.mesh import ElementType, FEMMesh
from backend.fem_preprocessor.mesher.extractor import GmshMeshExtractor


@pytest.fixture(autouse=True)
def _gmsh_session():
    """Initialize and finalize Gmsh for each test."""
    gmsh.initialize()
    gmsh.option.setNumber("General.Terminal", 0)
    yield
    gmsh.finalize()


def _create_rectangle_mesh(x=0.0, y=0.0, w=1.0, h=1.0, size=0.5, physical_groups=True):
    """Helper: create a simple rectangle mesh in Gmsh and return physical group tags."""
    tag = gmsh.model.occ.addRectangle(x, y, 0, w, h)
    gmsh.model.occ.synchronize()

    if physical_groups:
        # Add physical surface for the domain
        gmsh.model.addPhysicalGroup(2, [tag], name="domain")
        # Add physical curves for boundaries
        curves = gmsh.model.getBoundary([(2, tag)], oriented=False)
        curve_tags = [c[1] for c in curves]
        gmsh.model.addPhysicalGroup(1, curve_tags, name="boundary")

    gmsh.option.setNumber("Mesh.MeshSizeMax", size)
    gmsh.model.mesh.generate(2)


class TestBasicExtraction:
    """Test basic mesh extraction from a simple rectangle."""

    def test_returns_fem_mesh(self):
        _create_rectangle_mesh()
        extractor = GmshMeshExtractor()
        mesh = extractor.extract()

        assert isinstance(mesh, FEMMesh)

    def test_has_nodes(self):
        _create_rectangle_mesh()
        extractor = GmshMeshExtractor()
        mesh = extractor.extract()

        assert len(mesh.nodes) > 4  # More than just corners
        # All nodes should have 2D coords
        for node in mesh.nodes:
            assert len(node.coords) == 2

    def test_has_elements(self):
        _create_rectangle_mesh()
        extractor = GmshMeshExtractor()
        mesh = extractor.extract()

        assert len(mesh.elements) > 0
        # Default should be TRI3
        for elem in mesh.elements:
            assert elem.element_type == ElementType.TRI3
            assert len(elem.node_ids) == 3

    def test_element_type_set(self):
        _create_rectangle_mesh()
        extractor = GmshMeshExtractor()
        mesh = extractor.extract()

        assert mesh.element_type == ElementType.TRI3

    def test_dimension_is_2(self):
        _create_rectangle_mesh()
        extractor = GmshMeshExtractor()
        mesh = extractor.extract()

        assert mesh.dimension == 2

    def test_node_ids_are_contiguous_from_zero(self):
        """Node IDs should be re-indexed to 0-based contiguous."""
        _create_rectangle_mesh()
        extractor = GmshMeshExtractor()
        mesh = extractor.extract()

        node_ids = sorted(n.id for n in mesh.nodes)
        assert node_ids == list(range(len(mesh.nodes)))

    def test_element_node_ids_valid(self):
        """All element node IDs should reference existing nodes."""
        _create_rectangle_mesh()
        extractor = GmshMeshExtractor()
        mesh = extractor.extract()

        node_ids = {n.id for n in mesh.nodes}
        for elem in mesh.elements:
            for nid in elem.node_ids:
                assert nid in node_ids

    def test_nodes_within_bounding_box(self):
        _create_rectangle_mesh(x=1.0, y=2.0, w=3.0, h=4.0)
        extractor = GmshMeshExtractor()
        mesh = extractor.extract()

        for node in mesh.nodes:
            assert 1.0 - 1e-10 <= node.coords[0] <= 4.0 + 1e-10
            assert 2.0 - 1e-10 <= node.coords[1] <= 6.0 + 1e-10


class TestPhysicalGroups:
    """Test that physical groups become regions and boundary edges."""

    def test_regions_from_physical_surfaces(self):
        _create_rectangle_mesh()
        extractor = GmshMeshExtractor()
        mesh = extractor.extract()

        region_names = [r.name for r in mesh.regions]
        assert "domain" in region_names

    def test_boundary_edges_from_physical_curves(self):
        _create_rectangle_mesh()
        extractor = GmshMeshExtractor()
        mesh = extractor.extract()

        assert len(mesh.boundary_edges) > 0
        for be in mesh.boundary_edges:
            assert be.region_name == "boundary"
            assert len(be.node_ids) == 2

    def test_elements_have_region_id(self):
        _create_rectangle_mesh()
        extractor = GmshMeshExtractor()
        mesh = extractor.extract()

        region_ids = {r.id for r in mesh.regions}
        for elem in mesh.elements:
            assert elem.region_id in region_ids


class TestMultipleRegions:
    """Test extraction with multiple physical groups."""

    def test_two_adjacent_rectangles(self):
        """Fragment two rectangles → two physical surfaces → two regions."""
        r1 = gmsh.model.occ.addRectangle(0, 0, 0, 1, 1)
        r2 = gmsh.model.occ.addRectangle(1, 0, 0, 1, 1)
        out, out_map = gmsh.model.occ.fragment([(2, r1)], [(2, r2)])
        gmsh.model.occ.synchronize()

        # Assign physical groups to the resulting surfaces
        surfaces = gmsh.model.getEntities(dim=2)
        for i, (dim, tag) in enumerate(surfaces):
            gmsh.model.addPhysicalGroup(2, [tag], name=f"region_{i}")

        gmsh.option.setNumber("Mesh.MeshSizeMax", 0.5)
        gmsh.model.mesh.generate(2)

        extractor = GmshMeshExtractor()
        mesh = extractor.extract()

        assert len(mesh.regions) >= 2


class TestQuadExtraction:
    """Test extraction of quad elements after recombination."""

    def test_recombined_quad4(self):
        tag = gmsh.model.occ.addRectangle(0, 0, 0, 1, 1)
        gmsh.model.occ.synchronize()
        gmsh.model.addPhysicalGroup(2, [tag], name="domain")

        gmsh.option.setNumber("Mesh.MeshSizeMax", 0.5)
        gmsh.model.mesh.setRecombine(2, tag)
        gmsh.model.mesh.generate(2)

        extractor = GmshMeshExtractor()
        mesh = extractor.extract(element_type_hint=ElementType.QUAD4)

        # Should have at least some QUAD4 elements
        quad_count = sum(1 for e in mesh.elements if e.element_type == ElementType.QUAD4)
        assert quad_count > 0


class TestMetadata:
    """Test mesh metadata."""

    def test_metadata_includes_stats(self):
        _create_rectangle_mesh()
        extractor = GmshMeshExtractor()
        mesh = extractor.extract()

        assert "n_nodes" in mesh.metadata
        assert "n_elements" in mesh.metadata
        assert mesh.metadata["n_nodes"] == len(mesh.nodes)
        assert mesh.metadata["n_elements"] == len(mesh.elements)
