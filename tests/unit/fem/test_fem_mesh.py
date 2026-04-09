"""Tests for FEM mesh models."""

import pytest
from pydantic import ValidationError

from backend.common.models.fem.mesh import (
    BoundaryEdge,
    ElementType,
    FEMElement,
    FEMMesh,
    FEMNode,
    Region,
)


class TestElementType:
    """Test ElementType enum."""

    def test_tri3(self):
        assert ElementType.TRI3 == "tri3"

    def test_tri6(self):
        assert ElementType.TRI6 == "tri6"

    def test_quad4(self):
        assert ElementType.QUAD4 == "quad4"

    def test_invalid_type_rejected(self):
        with pytest.raises(ValidationError):
            FEMElement(id=0, element_type="invalid", node_ids=[0, 1, 2], region_id=0)


class TestFEMNode:
    """Test FEMNode model."""

    def test_2d_node(self):
        node = FEMNode(id=0, coords=[1.0, 2.0])
        assert node.id == 0
        assert node.coords == [1.0, 2.0]

    def test_3d_node(self):
        node = FEMNode(id=5, coords=[1.0, 2.0, 3.0])
        assert node.coords == [1.0, 2.0, 3.0]

    def test_serialization_round_trip(self):
        node = FEMNode(id=0, coords=[1.5, -2.3])
        data = node.model_dump()
        restored = FEMNode.model_validate(data)
        assert restored == node

    def test_json_round_trip(self):
        node = FEMNode(id=42, coords=[0.0, 0.0])
        json_str = node.model_dump_json()
        restored = FEMNode.model_validate_json(json_str)
        assert restored == node


class TestFEMElement:
    """Test FEMElement model."""

    def test_tri3_element(self):
        elem = FEMElement(
            id=0,
            element_type=ElementType.TRI3,
            node_ids=[0, 1, 2],
            region_id=0,
        )
        assert elem.element_type == ElementType.TRI3
        assert len(elem.node_ids) == 3

    def test_tri6_element(self):
        elem = FEMElement(
            id=0,
            element_type=ElementType.TRI6,
            node_ids=[0, 1, 2, 3, 4, 5],
            region_id=0,
        )
        assert len(elem.node_ids) == 6

    def test_quad4_element(self):
        elem = FEMElement(
            id=0,
            element_type=ElementType.QUAD4,
            node_ids=[0, 1, 2, 3],
            region_id=1,
        )
        assert len(elem.node_ids) == 4

    def test_serialization_round_trip(self):
        elem = FEMElement(
            id=5,
            element_type=ElementType.TRI3,
            node_ids=[10, 20, 30],
            region_id=2,
        )
        data = elem.model_dump()
        restored = FEMElement.model_validate(data)
        assert restored == elem


class TestRegion:
    """Test Region model."""

    def test_region_without_material(self):
        region = Region(id=0, name="air")
        assert region.material_id is None

    def test_region_with_material(self):
        region = Region(id=0, name="dielectric", material_id="silicon")
        assert region.material_id == "silicon"

    def test_serialization_round_trip(self):
        region = Region(id=1, name="conductor", material_id="copper")
        data = region.model_dump()
        restored = Region.model_validate(data)
        assert restored == region


class TestBoundaryEdge:
    """Test BoundaryEdge model."""

    def test_linear_edge(self):
        edge = BoundaryEdge(id=0, node_ids=[0, 1], region_name="bottom")
        assert len(edge.node_ids) == 2
        assert edge.region_name == "bottom"

    def test_quadratic_edge(self):
        edge = BoundaryEdge(id=0, node_ids=[0, 1, 5], region_name="top")
        assert len(edge.node_ids) == 3

    def test_serialization_round_trip(self):
        edge = BoundaryEdge(id=3, node_ids=[7, 8], region_name="left")
        data = edge.model_dump()
        restored = BoundaryEdge.model_validate(data)
        assert restored == edge


class TestFEMMesh:
    """Test FEMMesh model with a complete mesh."""

    @pytest.fixture
    def simple_tri3_mesh(self):
        r"""A minimal 2-triangle mesh forming a unit square.

        3---2
        |\ |
        | \|
        0---1
        """
        nodes = [
            FEMNode(id=0, coords=[0.0, 0.0]),
            FEMNode(id=1, coords=[1.0, 0.0]),
            FEMNode(id=2, coords=[1.0, 1.0]),
            FEMNode(id=3, coords=[0.0, 1.0]),
        ]
        elements = [
            FEMElement(id=0, element_type=ElementType.TRI3, node_ids=[0, 1, 2], region_id=0),
            FEMElement(id=1, element_type=ElementType.TRI3, node_ids=[0, 2, 3], region_id=0),
        ]
        regions = [Region(id=0, name="domain")]
        boundary_edges = [
            BoundaryEdge(id=0, node_ids=[0, 1], region_name="bottom"),
            BoundaryEdge(id=1, node_ids=[1, 2], region_name="right"),
            BoundaryEdge(id=2, node_ids=[2, 3], region_name="top"),
            BoundaryEdge(id=3, node_ids=[3, 0], region_name="left"),
        ]
        return FEMMesh(
            nodes=nodes,
            elements=elements,
            regions=regions,
            boundary_edges=boundary_edges,
            element_type=ElementType.TRI3,
        )

    def test_mesh_construction(self, simple_tri3_mesh):
        mesh = simple_tri3_mesh
        assert mesh.dimension == 2
        assert len(mesh.nodes) == 4
        assert len(mesh.elements) == 2
        assert len(mesh.regions) == 1
        assert len(mesh.boundary_edges) == 4
        assert mesh.element_type == ElementType.TRI3

    def test_mesh_default_dimension(self, simple_tri3_mesh):
        assert simple_tri3_mesh.dimension == 2

    def test_mesh_default_metadata(self, simple_tri3_mesh):
        assert simple_tri3_mesh.metadata == {}

    def test_mesh_with_metadata(self):
        mesh = FEMMesh(
            nodes=[FEMNode(id=0, coords=[0.0, 0.0])],
            elements=[],
            regions=[],
            boundary_edges=[],
            element_type=ElementType.TRI3,
            metadata={"source": "gmsh", "version": "4.11"},
        )
        assert mesh.metadata["source"] == "gmsh"

    def test_mesh_json_round_trip(self, simple_tri3_mesh):
        json_str = simple_tri3_mesh.model_dump_json()
        restored = FEMMesh.model_validate_json(json_str)
        assert restored == simple_tri3_mesh
        assert len(restored.nodes) == 4
        assert len(restored.elements) == 2

    def test_mesh_dict_round_trip(self, simple_tri3_mesh):
        data = simple_tri3_mesh.model_dump()
        restored = FEMMesh.model_validate(data)
        assert restored == simple_tri3_mesh

    def test_empty_mesh(self):
        mesh = FEMMesh(
            nodes=[],
            elements=[],
            regions=[],
            boundary_edges=[],
            element_type=ElementType.TRI3,
        )
        assert len(mesh.nodes) == 0
        assert len(mesh.elements) == 0

    def test_multi_region_mesh(self):
        """Two triangles in different regions."""
        nodes = [FEMNode(id=i, coords=[float(i), 0.0]) for i in range(4)]
        regions = [
            Region(id=0, name="left_region"),
            Region(id=1, name="right_region"),
        ]
        elements = [
            FEMElement(id=0, element_type=ElementType.TRI3, node_ids=[0, 1, 2], region_id=0),
            FEMElement(id=1, element_type=ElementType.TRI3, node_ids=[1, 2, 3], region_id=1),
        ]
        mesh = FEMMesh(
            nodes=nodes,
            elements=elements,
            regions=regions,
            boundary_edges=[],
            element_type=ElementType.TRI3,
        )
        assert len(mesh.regions) == 2
        assert mesh.elements[0].region_id == 0
        assert mesh.elements[1].region_id == 1
