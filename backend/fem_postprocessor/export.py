"""Export FEM mesh + results to VTK and CSV formats."""

from backend.common.models.fem.mesh import FEMMesh
from backend.common.models.fem.results import FEMSolverResult, ScalarFieldResult


def export_vtk(mesh: FEMMesh, result: FEMSolverResult) -> str:
    """Export mesh and scalar fields to VTK legacy ASCII format.

    Returns the complete VTK file as a string.
    """
    lines = []
    lines.append("# vtk DataFile Version 3.0")
    lines.append("FEM Result Export")
    lines.append("ASCII")
    lines.append("DATASET UNSTRUCTURED_GRID")

    # Points (3D — append z=0 for 2D meshes)
    n_nodes = len(mesh.nodes)
    lines.append(f"POINTS {n_nodes} float")
    for node in mesh.nodes:
        c = node.coords
        x, y = c[0], c[1]
        z = c[2] if len(c) > 2 else 0.0
        lines.append(f"{x} {y} {z}")

    # Cells
    n_cells = len(mesh.elements)
    # Each cell line: n_verts v0 v1 v2 ...
    cell_data_size = sum(1 + len(e.node_ids) for e in mesh.elements)
    lines.append(f"CELLS {n_cells} {cell_data_size}")
    for elem in mesh.elements:
        nids = elem.node_ids
        lines.append(f"{len(nids)} " + " ".join(str(n) for n in nids))

    # Cell types (5 = VTK_TRIANGLE, 9 = VTK_QUAD)
    lines.append(f"CELL_TYPES {n_cells}")
    for elem in mesh.elements:
        vtk_type = 5 if len(elem.node_ids) == 3 else 9
        lines.append(str(vtk_type))

    # Point data (scalar fields at nodes)
    if result.scalar_fields:
        lines.append(f"POINT_DATA {n_nodes}")
        for name, field in result.scalar_fields.items():
            lines.append(f"SCALARS {name} float 1")
            lines.append("LOOKUP_TABLE default")
            for v in field.node_values:
                lines.append(str(v))

    # Cell data (vector fields at element centroids)
    if result.vector_fields:
        lines.append(f"CELL_DATA {n_cells}")
        for name, field in result.vector_fields.items():
            lines.append(f"VECTORS {name} float")
            for vec in field.element_values:
                vx, vy = vec[0], vec[1]
                vz = vec[2] if len(vec) > 2 else 0.0
                lines.append(f"{vx} {vy} {vz}")

    return "\n".join(lines) + "\n"


def export_csv_scalar(mesh: FEMMesh, field: ScalarFieldResult) -> str:
    """Export a scalar field to CSV: x, y, field_name."""
    lines = [f"x,y,{field.field_name}"]
    for i, node in enumerate(mesh.nodes):
        x, y = node.coords[0], node.coords[1]
        v = field.node_values[i]
        lines.append(f"{x},{y},{v}")
    return "\n".join(lines) + "\n"
