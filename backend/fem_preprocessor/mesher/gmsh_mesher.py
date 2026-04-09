"""Gmsh mesher orchestrator — end-to-end geometry → FEMMesh pipeline."""

import gmsh

from backend.common.models.fem.geometry import DiscretizationSettings, FEMGeometry
from backend.common.models.fem.mesh import FEMMesh
from backend.fem_preprocessor.geometry.translator import GmshGeometryTranslator
from backend.fem_preprocessor.mesher.discretization import GmshDiscretizationApplier
from backend.fem_preprocessor.mesher.extractor import GmshMeshExtractor


class GmshMesher:
    """Orchestrate geometry translation, discretization, mesh generation, and extraction."""

    def generate(
        self,
        geometry: FEMGeometry,
        settings: DiscretizationSettings,
        variables: dict[str, float] | None = None,
    ) -> FEMMesh:
        """Generate a FEMMesh from geometry and discretization settings.

        Each call initializes and finalizes Gmsh to ensure a clean state.
        """
        variables = variables or {}

        gmsh.initialize()
        gmsh.option.setNumber("General.Terminal", 0)

        try:
            # 1. Translate geometry operations to Gmsh entities
            translator = GmshGeometryTranslator()
            tag_map = translator.translate(geometry, variables)

            # 2. Apply discretization settings
            surface_tags = list(tag_map.values()) if tag_map else None
            applier = GmshDiscretizationApplier()
            applier.apply(settings, surface_tags=surface_tags)

            # 3. Add default physical groups if none exist
            self._ensure_physical_groups()

            # 4. Generate 2D mesh
            gmsh.model.mesh.generate(2)

            # 5. Extract FEMMesh
            extractor = GmshMeshExtractor()
            mesh = extractor.extract(element_type_hint=settings.element_type)

            return mesh
        finally:
            gmsh.finalize()

    def _ensure_physical_groups(self):
        """Add default physical groups if the user didn't define any."""
        existing_2d = gmsh.model.getPhysicalGroups(dim=2)
        if not existing_2d:
            surfaces = gmsh.model.getEntities(dim=2)
            if surfaces:
                tags = [t for _, t in surfaces]
                gmsh.model.addPhysicalGroup(2, tags, name="domain")

        existing_1d = gmsh.model.getPhysicalGroups(dim=1)
        if not existing_1d:
            curves = gmsh.model.getEntities(dim=1)
            if curves:
                tags = [t for _, t in curves]
                gmsh.model.addPhysicalGroup(1, tags, name="boundary")
