"""Extract FEMMesh from a Gmsh model after mesh generation."""

import gmsh

from backend.common.models.fem.mesh import (
    BoundaryEdge,
    ElementType,
    FEMElement,
    FEMMesh,
    FEMNode,
    Region,
)

# Gmsh element-type codes → our ElementType
_GMSH_TYPE_MAP = {
    2: ElementType.TRI3,  # 3-node triangle
    3: ElementType.QUAD4,  # 4-node quad
    9: ElementType.TRI6,  # 6-node triangle
}


class GmshMeshExtractor:
    """Extract a FEMMesh from the current Gmsh model."""

    def extract(self, element_type_hint: ElementType = ElementType.TRI3) -> FEMMesh:
        """Extract nodes, elements, regions, and boundary edges.

        Args:
            element_type_hint: The expected element type for the mesh-level
                ``element_type`` field.  Individual elements carry their own type.
        """
        nodes = self._extract_nodes()
        gmsh_to_local = {n.id: i for i, n in enumerate(nodes)}
        # Re-index nodes to 0-based contiguous
        for i, n in enumerate(nodes):
            n.id = i

        regions = self._extract_regions()
        region_tag_to_id = self._build_region_tag_map(regions)

        elements = self._extract_elements(gmsh_to_local, region_tag_to_id)
        boundary_edges = self._extract_boundary_edges(gmsh_to_local)

        # Determine dominant element type
        dominant_type = self._dominant_element_type(elements, element_type_hint)

        return FEMMesh(
            nodes=nodes,
            elements=elements,
            regions=regions,
            boundary_edges=boundary_edges,
            element_type=dominant_type,
            dimension=2,
            metadata={
                "n_nodes": len(nodes),
                "n_elements": len(elements),
            },
        )

    def _extract_nodes(self) -> list[FEMNode]:
        """Get all mesh nodes (2D coords only)."""
        node_tags, coords, _ = gmsh.model.mesh.getNodes()
        nodes = []
        for i, tag in enumerate(node_tags):
            x = coords[3 * i]
            y = coords[3 * i + 1]
            nodes.append(FEMNode(id=int(tag), coords=[x, y]))
        return nodes

    def _extract_regions(self) -> list[Region]:
        """Build regions from 2D physical groups."""
        regions = []
        phys_groups = gmsh.model.getPhysicalGroups(dim=2)
        for dim, tag in phys_groups:
            name = gmsh.model.getPhysicalName(dim, tag)
            regions.append(Region(id=tag, name=name or f"region_{tag}"))

        # If no physical groups defined, create a default region
        if not regions:
            regions.append(Region(id=0, name="default"))
        return regions

    def _build_region_tag_map(self, regions: list[Region]) -> dict[int, int]:
        """Map Gmsh entity tag → Region.id for element assignment.

        Uses physical group membership: for each 2D physical group,
        find all entities in that group and map them to the region ID.
        """
        entity_to_region: dict[int, int] = {}
        phys_groups = gmsh.model.getPhysicalGroups(dim=2)
        for dim, phys_tag in phys_groups:
            entities = gmsh.model.getEntitiesForPhysicalGroup(dim, phys_tag)
            for ent_tag in entities:
                entity_to_region[ent_tag] = phys_tag

        # If no physical groups, map everything to default region 0
        if not entity_to_region:
            for dim, tag in gmsh.model.getEntities(dim=2):
                entity_to_region[tag] = 0

        return entity_to_region

    def _extract_elements(
        self,
        gmsh_to_local: dict[int, int],
        region_tag_to_id: dict[int, int],
    ) -> list[FEMElement]:
        """Extract 2D elements from all surfaces."""
        elements = []
        elem_id = 0

        for dim, entity_tag in gmsh.model.getEntities(dim=2):
            region_id = region_tag_to_id.get(entity_tag, 0)
            elem_types, elem_tags_list, node_tags_list = gmsh.model.mesh.getElements(
                dim, entity_tag
            )

            for etype, etags, ntags in zip(elem_types, elem_tags_list, node_tags_list):
                if etype not in _GMSH_TYPE_MAP:
                    continue
                fe_type = _GMSH_TYPE_MAP[etype]
                nodes_per_elem = len(ntags) // len(etags)

                for i in range(len(etags)):
                    local_nids = []
                    for j in range(nodes_per_elem):
                        gmsh_nid = int(ntags[i * nodes_per_elem + j])
                        local_nids.append(gmsh_to_local[gmsh_nid])

                    elements.append(
                        FEMElement(
                            id=elem_id,
                            element_type=fe_type,
                            node_ids=local_nids,
                            region_id=region_id,
                        )
                    )
                    elem_id += 1

        return elements

    def _extract_boundary_edges(self, gmsh_to_local: dict[int, int]) -> list[BoundaryEdge]:
        """Extract boundary edges from 1D physical groups."""
        edges = []
        edge_id = 0

        phys_groups = gmsh.model.getPhysicalGroups(dim=1)
        for dim, phys_tag in phys_groups:
            name = gmsh.model.getPhysicalName(dim, phys_tag)
            entities = gmsh.model.getEntitiesForPhysicalGroup(dim, phys_tag)

            for ent_tag in entities:
                elem_types, elem_tags_list, node_tags_list = gmsh.model.mesh.getElements(1, ent_tag)
                for etype, etags, ntags in zip(elem_types, elem_tags_list, node_tags_list):
                    # Only line elements (type 1 = 2-node line)
                    if etype != 1:
                        continue
                    for i in range(len(etags)):
                        n1 = gmsh_to_local[int(ntags[i * 2])]
                        n2 = gmsh_to_local[int(ntags[i * 2 + 1])]
                        edges.append(
                            BoundaryEdge(
                                id=edge_id,
                                node_ids=[n1, n2],
                                region_name=name or f"boundary_{phys_tag}",
                            )
                        )
                        edge_id += 1

        return edges

    def _dominant_element_type(self, elements: list[FEMElement], hint: ElementType) -> ElementType:
        """Determine the dominant element type."""
        if not elements:
            return hint
        type_counts: dict[ElementType, int] = {}
        for e in elements:
            type_counts[e.element_type] = type_counts.get(e.element_type, 0) + 1
        return max(type_counts, key=type_counts.get)
