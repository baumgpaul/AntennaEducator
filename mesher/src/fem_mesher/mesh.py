"""Triangle mesh with named domains and boundaries, quality metrics and VTU output."""

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

VTK_TRIANGLE, VTK_QUADRATIC_TRIANGLE = 5, 22


@dataclass
class Mesh:
    """A 2D triangle mesh.

    ``triangles`` are 0-based node indices: 3 corners (P1), or 3 corners then
    the 3 edge midpoints between corners 0-1, 1-2, 2-0 (P2). Boundary ``edges``
    likewise hold 2 end nodes, plus the midpoint for P2.
    """

    nodes: np.ndarray  # (N, 2) coordinates [m]
    triangles: np.ndarray  # (M, 3) or (M, 6)
    triangle_domain: np.ndarray  # (M,) index into domain_names
    domain_names: list[str]
    edges: np.ndarray  # (K, 2) or (K, 3)
    boundaries: dict[str, np.ndarray] = field(default_factory=dict)  # name -> indices into edges
    order: int = 1

    @property
    def n_nodes(self) -> int:
        return len(self.nodes)

    @property
    def n_triangles(self) -> int:
        return len(self.triangles)

    def corner_coordinates(self) -> np.ndarray:
        """(M, 3, 2) coordinates of the triangle corners."""
        return self.nodes[self.triangles[:, :3]]

    def areas(self) -> np.ndarray:
        """Signed areas of the (straight-sided) triangles; positive = counter-clockwise."""
        p = self.corner_coordinates()
        a, b = p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]
        return 0.5 * (a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0])

    def domain_area(self, name: str) -> float:
        return float(self.areas()[self.triangle_domain == self.domain_names.index(name)].sum())

    def quality(self) -> np.ndarray:
        """Shape quality q = 4·√3·A / (l₁² + l₂² + l₃²) per triangle.

        1 for an equilateral triangle, → 0 for a degenerate (flat) one. Flat
        triangles make the element matrices badly conditioned and the field
        inaccurate.
        """
        p = self.corner_coordinates()
        sq = sum(((p[:, i] - p[:, (i + 1) % 3]) ** 2).sum(axis=1) for i in range(3))
        return 4.0 * np.sqrt(3.0) * np.abs(self.areas()) / sq

    def boundary_length(self, name: str) -> float:
        e = self.edges[self.boundaries[name]]
        return float(np.linalg.norm(self.nodes[e[:, 1]] - self.nodes[e[:, 0]], axis=1).sum())

    def stats(self) -> dict:
        q = self.quality()
        hist, bin_edges = np.histogram(q, bins=10, range=(0.0, 1.0))
        return {
            "nodes": self.n_nodes,
            "triangles": self.n_triangles,
            "order": self.order,
            "domains": {
                n: int((self.triangle_domain == i).sum()) for i, n in enumerate(self.domain_names)
            },
            "boundaries": {n: int(len(ix)) for n, ix in self.boundaries.items()},
            "quality": {
                "min": float(q.min()),
                "mean": float(q.mean()),
                "histogram": hist.tolist(),
                "bin_edges": bin_edges.tolist(),
            },
        }

    def write_vtu(self, path: str | Path) -> None:
        """ASCII VTU (ParaView) with the domain index and quality as cell data."""
        cells = self.triangles
        n_per = cells.shape[1]
        vtk_type = VTK_TRIANGLE if n_per == 3 else VTK_QUADRATIC_TRIANGLE
        points = np.column_stack([self.nodes, np.zeros(self.n_nodes)])

        def arr(name, values, fmt, comps=1, typ="Float64"):
            c = f' NumberOfComponents="{comps}"' if comps > 1 else ""
            body = " ".join(fmt % v for v in np.ravel(values))
            return f'<DataArray type="{typ}" Name="{name}"{c} format="ascii">{body}</DataArray>'

        xml = f"""<?xml version="1.0"?>
<VTKFile type="UnstructuredGrid" version="1.0" byte_order="LittleEndian">
  <UnstructuredGrid>
    <Piece NumberOfPoints="{self.n_nodes}" NumberOfCells="{self.n_triangles}">
      <Points>{arr("Points", points, "%.9g", 3)}</Points>
      <Cells>
        {arr("connectivity", cells, "%d", typ="Int64")}
        {arr("offsets", np.arange(1, self.n_triangles + 1) * n_per, "%d", typ="Int64")}
        {arr("types", np.full(self.n_triangles, vtk_type), "%d", typ="UInt8")}
      </Cells>
      <CellData Scalars="domain">
        {arr("domain", self.triangle_domain, "%d", typ="Int32")}
        {arr("quality", self.quality(), "%.6g")}
      </CellData>
    </Piece>
  </UnstructuredGrid>
</VTKFile>
"""
        Path(path).write_text(xml, encoding="utf-8")
