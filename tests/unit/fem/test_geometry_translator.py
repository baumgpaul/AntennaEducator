"""Tests for Gmsh geometry translator — converts FEMGeometry operations to Gmsh API calls."""

import pytest

gmsh = pytest.importorskip("gmsh")

from backend.common.models.fem.geometry import (
    FEMGeometry,
    GeoOperation,
)
from backend.fem_preprocessor.geometry.translator import GmshGeometryTranslator


@pytest.fixture(autouse=True)
def _gmsh_session():
    """Initialize and finalize Gmsh for each test."""
    gmsh.initialize()
    gmsh.option.setNumber("General.Terminal", 0)  # Suppress output
    yield
    gmsh.finalize()


class TestAddRectangle:
    """Test translating add_rectangle operations."""

    def test_rectangle_creates_surface(self):
        geometry = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_rectangle",
                    params={"x": 0.0, "y": 0.0, "width": 2.0, "height": 1.0},
                )
            ]
        )
        translator = GmshGeometryTranslator()
        result = translator.translate(geometry, variables={})

        # Should create at least one surface
        surfaces = gmsh.model.getEntities(dim=2)
        assert len(surfaces) >= 1

    def test_rectangle_bounding_box(self):
        geometry = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_rectangle",
                    params={"x": 1.0, "y": 2.0, "width": 3.0, "height": 4.0},
                )
            ]
        )
        translator = GmshGeometryTranslator()
        translator.translate(geometry, variables={})

        # Check the bounding box of the created surface
        surfaces = gmsh.model.getEntities(dim=2)
        xmin, ymin, zmin, xmax, ymax, zmax = gmsh.model.getBoundingBox(
            surfaces[0][0], surfaces[0][1]
        )
        assert abs(xmin - 1.0) < 1e-6
        assert abs(ymin - 2.0) < 1e-6
        assert abs(xmax - 4.0) < 1e-6
        assert abs(ymax - 6.0) < 1e-6


class TestAddCircle:
    """Test translating add_circle (disk) operations."""

    def test_circle_creates_surface(self):
        geometry = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_circle",
                    params={"cx": 0.0, "cy": 0.0, "radius": 1.0},
                )
            ]
        )
        translator = GmshGeometryTranslator()
        translator.translate(geometry, variables={})

        surfaces = gmsh.model.getEntities(dim=2)
        assert len(surfaces) >= 1

    def test_circle_bounding_box(self):
        geometry = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_circle",
                    params={"cx": 1.0, "cy": 2.0, "radius": 0.5},
                )
            ]
        )
        translator = GmshGeometryTranslator()
        translator.translate(geometry, variables={})

        surfaces = gmsh.model.getEntities(dim=2)
        xmin, ymin, zmin, xmax, ymax, zmax = gmsh.model.getBoundingBox(
            surfaces[0][0], surfaces[0][1]
        )
        assert abs(xmin - 0.5) < 1e-6
        assert abs(ymin - 1.5) < 1e-6
        assert abs(xmax - 1.5) < 1e-6
        assert abs(ymax - 2.5) < 1e-6


class TestAddEllipse:
    """Test translating add_ellipse operations."""

    def test_ellipse_creates_surface(self):
        geometry = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_ellipse",
                    params={"cx": 0.0, "cy": 0.0, "rx": 2.0, "ry": 1.0},
                )
            ]
        )
        translator = GmshGeometryTranslator()
        translator.translate(geometry, variables={})

        surfaces = gmsh.model.getEntities(dim=2)
        assert len(surfaces) >= 1


class TestAddPolygon:
    """Test translating add_polygon operations."""

    def test_triangle_polygon(self):
        geometry = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_polygon",
                    params={
                        "vertices": [[0.0, 0.0], [1.0, 0.0], [0.5, 1.0]],
                    },
                )
            ]
        )
        translator = GmshGeometryTranslator()
        translator.translate(geometry, variables={})

        surfaces = gmsh.model.getEntities(dim=2)
        assert len(surfaces) == 1


class TestAddPointLine:
    """Test translating add_point and add_line operations."""

    def test_point_line_surface(self):
        """Build a triangle from points + lines + curve loop + surface."""
        geometry = FEMGeometry(
            operations=[
                GeoOperation(type="add_point", params={"id": "p1", "x": 0.0, "y": 0.0}),
                GeoOperation(type="add_point", params={"id": "p2", "x": 1.0, "y": 0.0}),
                GeoOperation(type="add_point", params={"id": "p3", "x": 0.5, "y": 1.0}),
                GeoOperation(
                    type="add_line",
                    params={"id": "l1", "start": "p1", "end": "p2"},
                ),
                GeoOperation(
                    type="add_line",
                    params={"id": "l2", "start": "p2", "end": "p3"},
                ),
                GeoOperation(
                    type="add_line",
                    params={"id": "l3", "start": "p3", "end": "p1"},
                ),
                GeoOperation(
                    type="add_surface",
                    params={"id": "s1", "edge_ids": ["l1", "l2", "l3"]},
                ),
            ]
        )
        translator = GmshGeometryTranslator()
        translator.translate(geometry, variables={})

        surfaces = gmsh.model.getEntities(dim=2)
        assert len(surfaces) == 1


class TestBooleanOperations:
    """Test boolean geometry operations."""

    def _two_overlapping_rects(self):
        return FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_rectangle",
                    params={
                        "id": "r1",
                        "x": 0.0,
                        "y": 0.0,
                        "width": 2.0,
                        "height": 1.0,
                    },
                ),
                GeoOperation(
                    type="add_rectangle",
                    params={
                        "id": "r2",
                        "x": 1.0,
                        "y": 0.0,
                        "width": 2.0,
                        "height": 1.0,
                    },
                ),
            ]
        )

    def test_boolean_union(self):
        geom = self._two_overlapping_rects()
        geom.operations.append(
            GeoOperation(
                type="boolean_union",
                params={"object": "r1", "tool": "r2"},
            )
        )
        translator = GmshGeometryTranslator()
        translator.translate(geom, variables={})

        surfaces = gmsh.model.getEntities(dim=2)
        # Union of two overlapping rects → one surface
        assert len(surfaces) == 1

        # Bounding box of the union
        xmin, ymin, zmin, xmax, ymax, zmax = gmsh.model.getBoundingBox(
            surfaces[0][0], surfaces[0][1]
        )
        assert abs(xmin - 0.0) < 1e-6
        assert abs(xmax - 3.0) < 1e-6

    def test_boolean_subtract(self):
        geom = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_rectangle",
                    params={
                        "id": "r1",
                        "x": 0.0,
                        "y": 0.0,
                        "width": 4.0,
                        "height": 2.0,
                    },
                ),
                GeoOperation(
                    type="add_circle",
                    params={"id": "c1", "cx": 2.0, "cy": 1.0, "radius": 0.5},
                ),
                GeoOperation(
                    type="boolean_subtract",
                    params={"object": "r1", "tool": "c1"},
                ),
            ]
        )
        translator = GmshGeometryTranslator()
        translator.translate(geom, variables={})

        surfaces = gmsh.model.getEntities(dim=2)
        # Rectangle with hole → one surface
        assert len(surfaces) == 1

    def test_boolean_intersect(self):
        geom = self._two_overlapping_rects()
        geom.operations.append(
            GeoOperation(
                type="boolean_intersect",
                params={"object": "r1", "tool": "r2"},
            )
        )
        translator = GmshGeometryTranslator()
        translator.translate(geom, variables={})

        surfaces = gmsh.model.getEntities(dim=2)
        assert len(surfaces) == 1

        # Intersection is 1×1 rectangle from x=1..2, y=0..1
        xmin, ymin, zmin, xmax, ymax, zmax = gmsh.model.getBoundingBox(
            surfaces[0][0], surfaces[0][1]
        )
        assert abs(xmin - 1.0) < 1e-6
        assert abs(xmax - 2.0) < 1e-6


class TestParametricExpressions:
    """Test that expression coordinates are evaluated with variable context."""

    def test_rectangle_with_variables(self):
        geometry = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_rectangle",
                    params={"x": 0.0, "y": 0.0, "width": "W", "height": "H"},
                )
            ]
        )
        translator = GmshGeometryTranslator()
        translator.translate(geometry, variables={"W": 3.0, "H": 2.0})

        surfaces = gmsh.model.getEntities(dim=2)
        xmin, ymin, zmin, xmax, ymax, zmax = gmsh.model.getBoundingBox(
            surfaces[0][0], surfaces[0][1]
        )
        assert abs(xmax - 3.0) < 1e-6
        assert abs(ymax - 2.0) < 1e-6

    def test_expression_evaluation(self):
        geometry = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_rectangle",
                    params={
                        "x": 0.0,
                        "y": 0.0,
                        "width": "2*a + 1",
                        "height": "b/2",
                    },
                )
            ]
        )
        translator = GmshGeometryTranslator()
        translator.translate(geometry, variables={"a": 1.0, "b": 4.0})

        surfaces = gmsh.model.getEntities(dim=2)
        xmin, ymin, zmin, xmax, ymax, zmax = gmsh.model.getBoundingBox(
            surfaces[0][0], surfaces[0][1]
        )
        assert abs(xmax - 3.0) < 1e-6
        assert abs(ymax - 2.0) < 1e-6


class TestTranslatorTagMapping:
    """Test that the translator returns an ID → Gmsh tag mapping."""

    def test_returns_tag_map(self):
        geometry = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_rectangle",
                    params={
                        "id": "rect1",
                        "x": 0.0,
                        "y": 0.0,
                        "width": 1.0,
                        "height": 1.0,
                    },
                ),
            ]
        )
        translator = GmshGeometryTranslator()
        tag_map = translator.translate(geometry, variables={})

        assert "rect1" in tag_map
        # The tag should be a valid Gmsh surface tag
        assert isinstance(tag_map["rect1"], int)


class TestUnsupportedOperation:
    """Test error handling for unknown operations."""

    def test_unknown_operation_raises(self):
        geometry = FEMGeometry(
            operations=[
                GeoOperation(type="nonexistent_op", params={}),
            ]
        )
        translator = GmshGeometryTranslator()
        with pytest.raises(ValueError, match="Unsupported.*nonexistent_op"):
            translator.translate(geometry, variables={})


# ─── Tests for frontend canvas parameter format ──────────────────────────────
# The drawing tools emit center_x/center_y for shapes and direct start/end
# coordinates for lines.  These tests verify the translator handles both formats.


class TestFrontendParamFormat:
    """Verify that the frontend canvas parameter conventions are translated correctly."""

    def test_rectangle_center_format(self):
        """Frontend emits center_x/center_y — should produce correct bounding box."""
        geometry = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_rectangle",
                    params={
                        "center_x": 1.0,
                        "center_y": 0.5,
                        "width": 2.0,
                        "height": 1.0,
                        "tag": "rect_frontend",
                    },
                )
            ]
        )
        translator = GmshGeometryTranslator()
        tag_map = translator.translate(geometry, variables={})

        # Tag registered under "tag" key too
        assert "rect_frontend" in tag_map

        surfaces = gmsh.model.getEntities(dim=2)
        xmin, ymin, _, xmax, ymax, _ = gmsh.model.getBoundingBox(surfaces[0][0], surfaces[0][1])
        assert abs(xmin - 0.0) < 1e-6
        assert abs(ymin - 0.0) < 1e-6
        assert abs(xmax - 2.0) < 1e-6
        assert abs(ymax - 1.0) < 1e-6

    def test_circle_center_format(self):
        """Frontend emits center_x/center_y instead of cx/cy."""
        geometry = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_circle",
                    params={
                        "center_x": 0.0,
                        "center_y": 0.0,
                        "radius": 1.0,
                        "tag": "circle_frontend",
                    },
                )
            ]
        )
        translator = GmshGeometryTranslator()
        tag_map = translator.translate(geometry, variables={})

        assert "circle_frontend" in tag_map
        surfaces = gmsh.model.getEntities(dim=2)
        assert len(surfaces) >= 1

    def test_ellipse_center_and_semi_axes_format(self):
        """Frontend emits semi_axis_a/b instead of rx/ry."""
        geometry = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_ellipse",
                    params={
                        "center_x": 0.0,
                        "center_y": 0.0,
                        "semi_axis_a": 2.0,
                        "semi_axis_b": 1.0,
                        "tag": "ellipse_frontend",
                    },
                )
            ]
        )
        translator = GmshGeometryTranslator()
        tag_map = translator.translate(geometry, variables={})

        assert "ellipse_frontend" in tag_map
        surfaces = gmsh.model.getEntities(dim=2)
        assert len(surfaces) >= 1

    def test_line_direct_coord_format(self):
        """Frontend emits start_x/y, end_x/y instead of point ID references."""
        geometry = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_line",
                    params={
                        "start_x": 0.0,
                        "start_y": 0.0,
                        "end_x": 1.0,
                        "end_y": 1.0,
                        "tag": "line_frontend",
                    },
                )
            ]
        )
        translator = GmshGeometryTranslator()
        translator.translate(geometry, variables={})

        curves = gmsh.model.getEntities(dim=1)
        assert len(curves) >= 1

    def test_arc_direct_coord_format(self):
        """Frontend emits start_x/y, center_x/y, end_x/y instead of point IDs."""
        # Arc: part of a unit circle, start at (1,0), center (0,0), end (0,1)
        geometry = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_arc",
                    params={
                        "start_x": 1.0,
                        "start_y": 0.0,
                        "center_x": 0.0,
                        "center_y": 0.0,
                        "end_x": 0.0,
                        "end_y": 1.0,
                        "tag": "arc_frontend",
                    },
                )
            ]
        )
        translator = GmshGeometryTranslator()
        translator.translate(geometry, variables={})

        curves = gmsh.model.getEntities(dim=1)
        assert len(curves) >= 1

    def test_polygon_with_tag(self):
        """Frontend emits polygon with 'tag' key instead of 'id'."""
        geometry = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_polygon",
                    params={
                        "vertices": [[0.0, 0.0], [2.0, 0.0], [1.0, 2.0]],
                        "tag": "triangle_frontend",
                    },
                )
            ]
        )
        translator = GmshGeometryTranslator()
        tag_map = translator.translate(geometry, variables={})

        assert "triangle_frontend" in tag_map
        surfaces = gmsh.model.getEntities(dim=2)
        assert len(surfaces) == 1
