"""Tests for FEM geometry domain models — backward compatibility and new fields."""

from backend.common.models.fem.geometry import (
    FEMGeometry,
    GeoBodyDef,
    GeoEdgeDef,
    GeoOperation,
)


class TestGeoEdgeDef:
    """GeoEdgeDef with new optional fields."""

    def test_minimal_edge(self):
        edge = GeoEdgeDef(id="e1", edge_type="line", point_ids=["p1", "p2"])
        assert edge.id == "e1"
        assert edge.name == ""
        assert edge.parent_surface_id is None

    def test_edge_with_name_and_parent(self):
        edge = GeoEdgeDef(
            id="e1",
            name="rect_1_left",
            edge_type="line",
            point_ids=["p1", "p2"],
            parent_surface_id="s1",
        )
        assert edge.name == "rect_1_left"
        assert edge.parent_surface_id == "s1"

    def test_edge_serialization(self):
        edge = GeoEdgeDef(
            id="e1",
            name="arc_1",
            edge_type="arc",
            point_ids=["p1", "p2", "p3"],
            parent_surface_id="circle_1",
        )
        d = edge.model_dump()
        assert d["name"] == "arc_1"
        assert d["parent_surface_id"] == "circle_1"

    def test_edge_deserialization_without_new_fields(self):
        """Old serialized data lacking new fields should still parse."""
        data = {"id": "e1", "edge_type": "line", "point_ids": ["p1", "p2"]}
        edge = GeoEdgeDef.model_validate(data)
        assert edge.name == ""
        assert edge.parent_surface_id is None


class TestGeoBodyDef:
    """GeoBodyDef with new primitive_type field."""

    def test_body_without_primitive_type(self):
        body = GeoBodyDef(id="b1", name="plate", edge_ids=["e1", "e2"])
        assert body.primitive_type == ""

    def test_body_with_primitive_type(self):
        body = GeoBodyDef(
            id="s1",
            name="rect_1",
            primitive_type="rectangle",
            edge_ids=["e1", "e2", "e3", "e4"],
        )
        assert body.primitive_type == "rectangle"

    def test_body_deserialization_without_primitive_type(self):
        """Old serialized data lacking primitive_type should still parse."""
        data = {"id": "b1", "name": "plate", "edge_ids": ["e1"]}
        body = GeoBodyDef.model_validate(data)
        assert body.primitive_type == ""


class TestFEMGeometry:
    """FEMGeometry with surfaces alias."""

    def test_surfaces_alias_returns_bodies(self):
        body = GeoBodyDef(id="s1", name="rect_1", edge_ids=["e1"])
        geo = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_rectangle", params={"x": 0, "y": 0, "width": 1, "height": 1}
                ),
            ],
            bodies=[body],
        )
        assert geo.surfaces is not None
        assert len(geo.surfaces) == 1
        assert geo.surfaces[0].id == "s1"

    def test_surfaces_alias_none_when_no_bodies(self):
        geo = FEMGeometry(
            operations=[GeoOperation(type="add_point", params={"x": 0, "y": 0})],
        )
        assert geo.surfaces is None

    def test_surfaces_in_serialized_output(self):
        body = GeoBodyDef(id="s1", name="rect_1", edge_ids=["e1"])
        geo = FEMGeometry(operations=[], bodies=[body])
        d = geo.model_dump()
        assert "surfaces" in d
        assert d["surfaces"][0]["id"] == "s1"
