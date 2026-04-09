"""Tests for the Gmsh mesher orchestrator — end-to-end geometry → FEMMesh pipeline."""

import pytest

gmsh = pytest.importorskip("gmsh")

from backend.common.models.fem.geometry import (
    DiscretizationSettings,
    FEMGeometry,
    GeoOperation,
)
from backend.common.models.fem.mesh import ElementType
from backend.fem_preprocessor.mesher.gmsh_mesher import GmshMesher


class TestGmshMesher:
    """End-to-end tests for the meshing pipeline."""

    def test_rectangle_mesh(self):
        geometry = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_rectangle",
                    params={"x": 0, "y": 0, "width": 1.0, "height": 1.0},
                )
            ]
        )
        settings = DiscretizationSettings(global_element_size=0.3)

        mesher = GmshMesher()
        mesh = mesher.generate(geometry, settings)

        assert len(mesh.nodes) > 4
        assert len(mesh.elements) > 2
        assert mesh.element_type == ElementType.TRI3
        assert mesh.dimension == 2

    def test_circle_mesh(self):
        geometry = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_circle",
                    params={"cx": 0, "cy": 0, "radius": 1.0},
                )
            ]
        )
        settings = DiscretizationSettings(global_element_size=0.3)

        mesher = GmshMesher()
        mesh = mesher.generate(geometry, settings)

        assert len(mesh.nodes) > 10
        assert len(mesh.elements) > 5

    def test_rectangle_with_hole(self):
        geometry = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_rectangle",
                    params={
                        "id": "r1",
                        "x": 0,
                        "y": 0,
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
        settings = DiscretizationSettings(global_element_size=0.3)

        mesher = GmshMesher()
        mesh = mesher.generate(geometry, settings)

        # Should have mesh that conforms to the circular hole
        assert len(mesh.nodes) > 20
        assert len(mesh.elements) > 10

    def test_parametric_rectangle(self):
        geometry = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_rectangle",
                    params={"x": 0, "y": 0, "width": "L", "height": "H"},
                )
            ]
        )
        settings = DiscretizationSettings(global_element_size=0.3)

        mesher = GmshMesher()
        mesh = mesher.generate(geometry, settings, variables={"L": 2.0, "H": 1.0})

        # All nodes should be within the 2×1 bounding box
        for node in mesh.nodes:
            assert -1e-10 <= node.coords[0] <= 2.0 + 1e-10
            assert -1e-10 <= node.coords[1] <= 1.0 + 1e-10

    def test_finer_mesh_has_more_elements(self):
        geometry = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_rectangle",
                    params={"x": 0, "y": 0, "width": 1.0, "height": 1.0},
                )
            ]
        )
        coarse = DiscretizationSettings(global_element_size=0.5)
        fine = DiscretizationSettings(global_element_size=0.1)

        mesher = GmshMesher()
        mesh_coarse = mesher.generate(geometry, coarse)
        mesh_fine = mesher.generate(geometry, fine)

        assert len(mesh_fine.elements) > len(mesh_coarse.elements)

    def test_quad_mesh(self):
        geometry = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_rectangle",
                    params={"x": 0, "y": 0, "width": 1.0, "height": 1.0},
                )
            ]
        )
        settings = DiscretizationSettings(
            global_element_size=0.3,
            recombine_to_quads=True,
            element_type=ElementType.QUAD4,
        )

        mesher = GmshMesher()
        mesh = mesher.generate(geometry, settings)

        # Should have QUAD4 elements
        quad_count = sum(1 for e in mesh.elements if e.element_type == ElementType.QUAD4)
        assert quad_count > 0

    def test_polygon_mesh(self):
        geometry = FEMGeometry(
            operations=[
                GeoOperation(
                    type="add_polygon",
                    params={
                        "vertices": [
                            [0, 0],
                            [2, 0],
                            [2, 1],
                            [1, 2],
                            [0, 1],
                        ],
                    },
                )
            ]
        )
        settings = DiscretizationSettings(global_element_size=0.3)

        mesher = GmshMesher()
        mesh = mesher.generate(geometry, settings)

        assert len(mesh.nodes) > 5
        assert len(mesh.elements) > 3
