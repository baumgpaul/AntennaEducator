"""Tests for FEM geometry models (parametric operation history)."""

from backend.common.models.fem.geometry import (
    BoundaryLayerSpec,
    DiscretizationSettings,
    FEMGeometry,
    GeoBodyDef,
    GeoEdgeDef,
    GeoOperation,
    GeoPointDef,
)
from backend.common.models.fem.mesh import ElementType


class TestGeoPointDef:
    """Test parametric point definition."""

    def test_numeric_coordinates(self):
        p = GeoPointDef(id="p1", x="0.0", y="1.5")
        assert p.id == "p1"
        assert p.x == "0.0"
        assert p.y == "1.5"

    def test_expression_coordinates(self):
        p = GeoPointDef(id="p2", x="a/2", y="b * sin(pi/4)")
        assert p.x == "a/2"
        assert p.y == "b * sin(pi/4)"

    def test_serialization_round_trip(self):
        p = GeoPointDef(id="p1", x="1.0", y="2.0")
        data = p.model_dump()
        restored = GeoPointDef.model_validate(data)
        assert restored == p


class TestGeoEdgeDef:
    """Test edge (line/arc) definition."""

    def test_line_edge(self):
        edge = GeoEdgeDef(id="e1", edge_type="line", point_ids=["p1", "p2"])
        assert edge.edge_type == "line"
        assert len(edge.point_ids) == 2

    def test_arc_edge(self):
        edge = GeoEdgeDef(
            id="e2",
            edge_type="arc",
            point_ids=["p1", "p_center", "p2"],
        )
        assert edge.edge_type == "arc"
        assert len(edge.point_ids) == 3

    def test_serialization_round_trip(self):
        edge = GeoEdgeDef(id="e1", edge_type="line", point_ids=["p1", "p2"])
        data = edge.model_dump()
        restored = GeoEdgeDef.model_validate(data)
        assert restored == edge


class TestGeoBodyDef:
    """Test body (closed surface region) definition."""

    def test_simple_body(self):
        body = GeoBodyDef(
            id="b1",
            name="domain",
            edge_ids=["e1", "e2", "e3", "e4"],
        )
        assert body.name == "domain"
        assert len(body.edge_ids) == 4
        assert body.inner_loops == []

    def test_body_with_hole(self):
        body = GeoBodyDef(
            id="b1",
            name="plate_with_hole",
            edge_ids=["e1", "e2", "e3", "e4"],
            inner_loops=[["e5", "e6", "e7", "e8"]],
        )
        assert len(body.inner_loops) == 1
        assert len(body.inner_loops[0]) == 4

    def test_default_inner_loops_empty(self):
        body = GeoBodyDef(id="b1", name="solid", edge_ids=["e1"])
        assert body.inner_loops == []

    def test_serialization_round_trip(self):
        body = GeoBodyDef(
            id="b1",
            name="ring",
            edge_ids=["e1", "e2"],
            inner_loops=[["e3", "e4"]],
        )
        data = body.model_dump()
        restored = GeoBodyDef.model_validate(data)
        assert restored == body


class TestGeoOperation:
    """Test parametric geometry operations."""

    def test_add_point_operation(self):
        op = GeoOperation(
            type="add_point",
            params={"id": "p1", "x": "0.0", "y": "1.0"},
        )
        assert op.type == "add_point"
        assert op.params["x"] == "0.0"

    def test_add_rectangle_operation(self):
        op = GeoOperation(
            type="add_rectangle",
            params={"id": "b1", "x": "0", "y": "0", "width": "2*a", "height": "b"},
        )
        assert op.type == "add_rectangle"
        assert op.params["width"] == "2*a"

    def test_boolean_subtract_operation(self):
        op = GeoOperation(
            type="boolean_subtract",
            params={"id": "b3", "objectId": "b1", "toolId": "b2"},
        )
        assert op.type == "boolean_subtract"

    def test_transform_operation(self):
        op = GeoOperation(
            type="transform_translate",
            params={"targetId": "b1", "dx": "1.0", "dy": "0.0"},
        )
        assert op.params["dx"] == "1.0"

    def test_serialization_round_trip(self):
        op = GeoOperation(
            type="add_circle",
            params={"id": "b2", "cx": "0", "cy": "0", "radius": "R"},
        )
        data = op.model_dump()
        restored = GeoOperation.model_validate(data)
        assert restored == op


class TestFEMGeometry:
    """Test complete parametric geometry model."""

    def test_empty_geometry(self):
        geo = FEMGeometry(operations=[])
        assert len(geo.operations) == 0
        assert geo.points is None
        assert geo.edges is None
        assert geo.bodies is None

    def test_geometry_with_operations(self):
        ops = [
            GeoOperation(
                type="add_rectangle",
                params={"id": "b1", "x": "0", "y": "0", "width": "1", "height": "1"},
            ),
            GeoOperation(
                type="add_circle",
                params={"id": "b2", "cx": "0.5", "cy": "0.5", "radius": "0.2"},
            ),
            GeoOperation(
                type="boolean_subtract",
                params={"id": "b3", "objectId": "b1", "toolId": "b2"},
            ),
        ]
        geo = FEMGeometry(operations=ops)
        assert len(geo.operations) == 3

    def test_geometry_with_evaluated_state(self):
        geo = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_rectangle",
                    params={"id": "b1", "x": "0", "y": "0", "width": "1", "height": "1"},
                ),
            ],
            points=[
                GeoPointDef(id="p1", x="0", y="0"),
                GeoPointDef(id="p2", x="1", y="0"),
                GeoPointDef(id="p3", x="1", y="1"),
                GeoPointDef(id="p4", x="0", y="1"),
            ],
            edges=[
                GeoEdgeDef(id="e1", edge_type="line", point_ids=["p1", "p2"]),
                GeoEdgeDef(id="e2", edge_type="line", point_ids=["p2", "p3"]),
                GeoEdgeDef(id="e3", edge_type="line", point_ids=["p3", "p4"]),
                GeoEdgeDef(id="e4", edge_type="line", point_ids=["p4", "p1"]),
            ],
            bodies=[
                GeoBodyDef(id="b1", name="Rectangle_1", edge_ids=["e1", "e2", "e3", "e4"]),
            ],
        )
        assert len(geo.points) == 4
        assert len(geo.edges) == 4
        assert len(geo.bodies) == 1

    def test_json_round_trip(self):
        geo = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_point",
                    params={"id": "p1", "x": "0", "y": "0"},
                ),
            ],
        )
        json_str = geo.model_dump_json()
        restored = FEMGeometry.model_validate_json(json_str)
        assert len(restored.operations) == 1


class TestDiscretizationSettings:
    """Test mesh discretization configuration."""

    def test_defaults(self):
        ds = DiscretizationSettings()
        assert ds.element_type == ElementType.TRI3
        assert ds.global_element_size == "auto"
        assert ds.min_element_size == "auto"
        assert ds.growth_rate == 1.2
        assert ds.algorithm == "frontal_delaunay"
        assert ds.optimize is True
        assert ds.polynomial_order == 1
        assert ds.recombine_to_quads is False

    def test_custom_settings(self):
        ds = DiscretizationSettings(
            element_type=ElementType.TRI6,
            global_element_size=0.1,
            growth_rate=1.5,
            polynomial_order=2,
        )
        assert ds.element_type == ElementType.TRI6
        assert ds.global_element_size == 0.1
        assert ds.polynomial_order == 2

    def test_per_body_sizes(self):
        ds = DiscretizationSettings(
            body_sizes={"body1": 0.05, "body2": "elem_size / 2"},
        )
        assert ds.body_sizes["body1"] == 0.05
        assert ds.body_sizes["body2"] == "elem_size / 2"

    def test_per_edge_divisions(self):
        ds = DiscretizationSettings(
            edge_divisions={"e1": 10, "e2": 20},
            edge_gradings={"e1": 1.2},
        )
        assert ds.edge_divisions["e1"] == 10
        assert ds.edge_gradings["e1"] == 1.2

    def test_expression_element_size(self):
        ds = DiscretizationSettings(
            global_element_size="wavelength / 10",
        )
        assert ds.global_element_size == "wavelength / 10"

    def test_serialization_round_trip(self):
        ds = DiscretizationSettings(
            element_type=ElementType.QUAD4,
            global_element_size=0.2,
            recombine_to_quads=True,
        )
        data = ds.model_dump()
        restored = DiscretizationSettings.model_validate(data)
        assert restored == ds


class TestBoundaryLayerSpec:
    """Test boundary layer specification."""

    def test_basic_boundary_layer(self):
        bl = BoundaryLayerSpec(
            edge_id="e1",
            first_layer_thickness=0.001,
            num_layers=5,
        )
        assert bl.first_layer_thickness == 0.001
        assert bl.num_layers == 5
        assert bl.growth_rate == 1.5  # default

    def test_custom_growth_rate(self):
        bl = BoundaryLayerSpec(
            edge_id="e1",
            first_layer_thickness=0.01,
            num_layers=3,
            growth_rate=2.0,
        )
        assert bl.growth_rate == 2.0

    def test_expression_thickness(self):
        bl = BoundaryLayerSpec(
            edge_id="e1",
            first_layer_thickness="delta / 5",
            num_layers=4,
        )
        assert bl.first_layer_thickness == "delta / 5"

    def test_serialization_round_trip(self):
        bl = BoundaryLayerSpec(
            edge_id="e2",
            first_layer_thickness=0.005,
            num_layers=8,
            growth_rate=1.3,
        )
        data = bl.model_dump()
        restored = BoundaryLayerSpec.model_validate(data)
        assert restored == bl
