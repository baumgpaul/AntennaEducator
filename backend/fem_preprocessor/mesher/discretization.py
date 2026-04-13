"""Apply discretization settings to a Gmsh model before mesh generation."""

import gmsh

from backend.common.models.fem.geometry import DiscretizationSettings

# Map algorithm names to Gmsh algorithm numbers
_ALGORITHM_MAP = {
    "meshadapt": 1,
    "automatic": 2,
    "initial_mesh_only": 3,
    "delaunay": 5,
    "frontal_delaunay": 6,
    "bamg": 7,
    "frontal_delaunay_quads": 8,
    "packing_of_parallelograms": 9,
}


class GmshDiscretizationApplier:
    """Configure Gmsh meshing parameters from DiscretizationSettings."""

    def apply(
        self,
        settings: DiscretizationSettings,
        surface_tags: list[int] | None = None,
        tag_map: dict[str, int] | None = None,
    ):
        """Apply settings to the current Gmsh model.

        Args:
            settings: Discretization configuration.
            surface_tags: Optional list of surface tags for recombination.
            tag_map: Optional mapping from geometry surface IDs to Gmsh surface tags,
                used to apply per-body element sizes and per-edge divisions.
        """
        self._apply_element_size(settings)
        self._apply_algorithm(settings)
        self._apply_optimize(settings)
        self._apply_recombine(settings, surface_tags)
        if tag_map:
            self._apply_body_sizes(settings, tag_map)
            self._apply_edge_divisions(settings, tag_map)

    def _apply_element_size(self, settings: DiscretizationSettings):
        """Set global and minimum element sizes."""
        if settings.global_element_size == "auto":
            size = self._compute_auto_size()
        else:
            size = float(settings.global_element_size)

        gmsh.option.setNumber("Mesh.MeshSizeMax", size)

        if settings.min_element_size != "auto":
            gmsh.option.setNumber("Mesh.MeshSizeMin", float(settings.min_element_size))

        # Growth rate controls how fast element sizes change spatially.
        # Gmsh uses MeshSizeFactor as a global scaling factor and
        # MeshSizeExtendFromBoundary to propagate sizes.
        gmsh.option.setNumber("Mesh.MeshSizeFactor", settings.growth_rate)

    def _apply_algorithm(self, settings: DiscretizationSettings):
        """Set the meshing algorithm."""
        algo = _ALGORITHM_MAP.get(settings.algorithm, 6)
        gmsh.option.setNumber("Mesh.Algorithm", algo)

    def _apply_optimize(self, settings: DiscretizationSettings):
        """Enable or disable mesh optimization."""
        gmsh.option.setNumber("Mesh.Optimize", 1 if settings.optimize else 0)

    def _apply_recombine(
        self,
        settings: DiscretizationSettings,
        surface_tags: list[int] | None,
    ):
        """Apply recombination (tri→quad) if requested."""
        if not settings.recombine_to_quads:
            return

        if surface_tags:
            for tag in surface_tags:
                gmsh.model.mesh.setRecombine(2, tag)
        else:
            # Recombine all surfaces
            for dim, tag in gmsh.model.getEntities(dim=2):
                gmsh.model.mesh.setRecombine(2, tag)

    def _compute_auto_size(self) -> float:
        """Compute a reasonable element size from the model bounding box."""
        entities = gmsh.model.getEntities(dim=2)
        if not entities:
            return 0.1

        xmin = ymin = float("inf")
        xmax = ymax = float("-inf")
        for dim, tag in entities:
            bb = gmsh.model.getBoundingBox(dim, tag)
            xmin = min(xmin, bb[0])
            ymin = min(ymin, bb[1])
            xmax = max(xmax, bb[3])
            ymax = max(ymax, bb[4])

        # Use ~1/10 of the diagonal as default size
        diag = ((xmax - xmin) ** 2 + (ymax - ymin) ** 2) ** 0.5
        return max(diag / 10.0, 1e-6)

    def _apply_body_sizes(
        self,
        settings: DiscretizationSettings,
        tag_map: dict[str, int],
    ):
        """Apply per-surface element sizes via Gmsh mesh size fields."""
        if not settings.body_sizes:
            return

        field_ids = []
        for body_key, size_value in settings.body_sizes.items():
            gmsh_tag = tag_map.get(body_key)
            if gmsh_tag is None:
                continue
            if isinstance(size_value, str):
                continue  # Skip expression sizes (not yet supported)
            size = float(size_value)

            # MathEval field restricted to the surface region
            restrict_id = gmsh.model.mesh.field.add("MathEval")
            gmsh.model.mesh.field.setString(restrict_id, "F", str(size))
            restrict_field = gmsh.model.mesh.field.add("Restrict")
            gmsh.model.mesh.field.setNumber(restrict_field, "InField", restrict_id)
            gmsh.model.mesh.field.setNumbers(restrict_field, "SurfacesList", [gmsh_tag])
            field_ids.append(restrict_field)

        if field_ids:
            min_field = gmsh.model.mesh.field.add("Min")
            gmsh.model.mesh.field.setNumbers(min_field, "FieldsList", field_ids)
            gmsh.model.mesh.field.setAsBackgroundMesh(min_field)

    def _apply_edge_divisions(
        self,
        settings: DiscretizationSettings,
        tag_map: dict[str, int],
    ):
        """Apply per-edge transfinite divisions, overriding surface-level sizes."""
        if not settings.edge_divisions:
            return

        # Build mapping from edge names to Gmsh curve tags.
        # Edge keys follow the convention "{surface_key}_e{i}" matching boundary curves.
        for edge_key, n_divisions in settings.edge_divisions.items():
            # Find the surface this edge belongs to
            curve_tag = self._find_curve_tag(edge_key, tag_map)
            if curve_tag is not None:
                gmsh.model.mesh.setTransfiniteCurve(curve_tag, n_divisions + 1)

    @staticmethod
    def _find_curve_tag(edge_key: str, tag_map: dict[str, int]) -> int | None:
        """Resolve an edge key to its Gmsh curve tag via physical group names."""
        phys_groups = gmsh.model.getPhysicalGroups(dim=1)
        for dim, phys_tag in phys_groups:
            name = gmsh.model.getPhysicalName(dim, phys_tag)
            if name == edge_key:
                entities = gmsh.model.getEntitiesForPhysicalGroup(dim, phys_tag)
                return entities[0] if entities else None
        return None
