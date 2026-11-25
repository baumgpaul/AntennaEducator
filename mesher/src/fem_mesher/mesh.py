"""2D mesh (triangles, optionally quadrilaterals) with named domains and
boundaries, element quality measures and VTU output."""

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

VTK_TRIANGLE, VTK_QUADRATIC_TRIANGLE = 5, 22
VTK_QUAD, VTK_QUADRATIC_QUAD = 9, 23


def _empty(n: int) -> np.ndarray:
    return np.zeros((0, n), dtype=np.int64)


@dataclass
class Mesh:
    """A 2D mesh.

    ``triangles`` are 0-based node indices: 3 corners (P1), or 3 corners then
    the 3 edge midpoints between corners 0-1, 1-2, 2-0 (P2). ``quads`` (only
    with ``element = quad``) likewise: 4 corners, then for order 2 the 4 edge
    midpoints 0-1, 1-2, 2-3, 3-0. All elements are counter-clockwise. Boundary
    ``edges`` hold 2 end nodes, plus the midpoint for order 2. Element-wise
    arrays (quality measures) list the triangles first, then the quads.
    """

    nodes: np.ndarray  # (N, 2) coordinates [m]
    triangles: np.ndarray  # (M, 3) or (M, 6)
    triangle_domain: np.ndarray  # (M,) index into domain_names
    domain_names: list[str]
    edges: np.ndarray  # (K, 2) or (K, 3)
    boundaries: dict[str, np.ndarray] = field(default_factory=dict)  # name -> indices into edges
    order: int = 1
    quads: np.ndarray = field(default_factory=lambda: _empty(4))  # (Q, 4) or (Q, 8)
    quad_domain: np.ndarray = field(default_factory=lambda: np.zeros(0, dtype=np.int64))

    @property
    def n_nodes(self) -> int:
        return len(self.nodes)

    @property
    def n_triangles(self) -> int:
        return len(self.triangles)

    @property
    def n_quads(self) -> int:
        return len(self.quads)

    @property
    def n_elements(self) -> int:
        return self.n_triangles + self.n_quads

    def corner_coordinates(self) -> np.ndarray:
        """(M, 3, 2) coordinates of the triangle corners."""
        return self.nodes[self.triangles[:, :3]]

    def areas(self) -> np.ndarray:
        """Signed areas of the (straight-sided) triangles; positive = counter-clockwise."""
        p = self.corner_coordinates()
        a, b = p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]
        return 0.5 * (a[:, 0] * b[:, 1] - a[:, 1] * b[:, 0])

    def quad_areas(self) -> np.ndarray:
        """Signed areas of the (straight-sided) quadrilaterals (shoelace)."""
        p = self.nodes[self.quads[:, :4]]
        x, y = p[..., 0], p[..., 1]
        return 0.5 * (x * np.roll(y, -1, axis=1) - np.roll(x, -1, axis=1) * y).sum(axis=1)

    def element_domains(self) -> np.ndarray:
        return np.concatenate([self.triangle_domain, self.quad_domain]).astype(np.int64)

    def domain_area(self, name: str) -> float:
        d = self.domain_names.index(name)
        return float(
            self.areas()[self.triangle_domain == d].sum()
            + self.quad_areas()[self.quad_domain == d].sum()
        )

    # ── Quality ───────────────────────────────────────────────────────────────

    def quality(self) -> np.ndarray:
        """Shape quality per element, 1 = ideal, → 0 degenerate.

        Triangles: q = 4·√3·A / (l₁² + l₂² + l₃²), 1 for an equilateral
        triangle. Quadrilaterals: the scaled Jacobian, the smallest sine of
        the corner angles, 1 for a rectangle (negative: not convex). Flat
        elements make the element matrices badly conditioned and the field
        inaccurate.
        """
        p = self.corner_coordinates()
        sq = sum(((p[:, i] - p[:, (i + 1) % 3]) ** 2).sum(axis=1) for i in range(3))
        tri = 4.0 * np.sqrt(3.0) * np.abs(self.areas()) / sq
        return np.concatenate([tri, self._quad_sines().min(axis=1, initial=1.0)])

    def _corner_angles(self, cells: np.ndarray, n: int) -> np.ndarray:
        """(M, n) interior angles [degrees] of counter-clockwise polygons."""
        p = self.nodes[cells[:, :n]]
        a = np.roll(p, 1, axis=1) - p  # to the previous corner
        b = np.roll(p, -1, axis=1) - p  # to the next corner
        cos = (a * b).sum(axis=2) / (np.linalg.norm(a, axis=2) * np.linalg.norm(b, axis=2))
        return np.degrees(np.arccos(np.clip(cos, -1.0, 1.0)))

    def _quad_sines(self) -> np.ndarray:
        p = self.nodes[self.quads[:, :4]]
        a = np.roll(p, 1, axis=1) - p
        b = np.roll(p, -1, axis=1) - p
        cross = b[..., 0] * a[..., 1] - b[..., 1] * a[..., 0]
        return cross / (np.linalg.norm(a, axis=2) * np.linalg.norm(b, axis=2))

    def angles(self) -> tuple[np.ndarray, np.ndarray]:
        """Smallest and largest corner angle of every element [degrees]."""
        tri = self._corner_angles(self.triangles, 3)
        quad = self._corner_angles(self.quads, 4)
        return (
            np.concatenate([tri.min(axis=1, initial=180.0), quad.min(axis=1, initial=360.0)]),
            np.concatenate([tri.max(axis=1, initial=0.0), quad.max(axis=1, initial=0.0)]),
        )

    def aspect_ratio(self) -> np.ndarray:
        """1 = ideal. Triangles: circumradius / (2 · inradius); quadrilaterals:
        longest / shortest edge."""
        p = self.corner_coordinates()
        lengths = np.stack(
            [np.linalg.norm(p[:, (i + 1) % 3] - p[:, i], axis=1) for i in range(3)], axis=1
        )
        s = lengths.sum(axis=1) / 2
        area = np.abs(self.areas())
        with np.errstate(divide="ignore"):
            tri = lengths.prod(axis=1) * s / (8 * area**2)
        q = self.nodes[self.quads[:, :4]]
        ql = np.linalg.norm(np.roll(q, -1, axis=1) - q, axis=2)
        with np.errstate(divide="ignore"):
            quad = ql.max(axis=1, initial=0.0) / ql.min(axis=1, initial=1.0)
        return np.concatenate([tri, quad])

    def boundary_length(self, name: str) -> float:
        e = self.edges[self.boundaries[name]]
        return float(np.linalg.norm(self.nodes[e[:, 1]] - self.nodes[e[:, 0]], axis=1).sum())

    def stats(self) -> dict:
        q = self.quality()
        hist, bin_edges = np.histogram(q, bins=10, range=(0.0, 1.0))
        smallest, largest = self.angles()
        aspect = self.aspect_ratio()
        domains = self.element_domains()
        return {
            "nodes": self.n_nodes,
            "triangles": self.n_triangles,
            "quads": self.n_quads,
            "elements": self.n_elements,
            "order": self.order,
            "domains": {n: int((domains == i).sum()) for i, n in enumerate(self.domain_names)},
            "boundaries": {n: int(len(ix)) for n, ix in self.boundaries.items()},
            "quality": {
                "min": float(q.min()),
                "mean": float(q.mean()),
                "histogram": hist.tolist(),
                "bin_edges": bin_edges.tolist(),
            },
            "angles": {"min": float(smallest.min()), "max": float(largest.max())},
            "aspect": {"max": float(aspect.max()), "mean": float(aspect.mean())},
        }

    def write_vtu(self, path: str | Path) -> None:
        """ASCII VTU (ParaView) with the domain index and quality measures as cell data."""
        tri, quad = self.triangles, self.quads
        tri_type = VTK_TRIANGLE if tri.shape[1] == 3 else VTK_QUADRATIC_TRIANGLE
        quad_type = VTK_QUAD if quad.shape[1] == 4 else VTK_QUADRATIC_QUAD
        connectivity = np.concatenate([tri.ravel(), quad.ravel()])
        sizes = np.concatenate([np.full(len(tri), tri.shape[1]), np.full(len(quad), quad.shape[1])])
        types = np.concatenate([np.full(len(tri), tri_type), np.full(len(quad), quad_type)])
        points = np.column_stack([self.nodes, np.zeros(self.n_nodes)])
        smallest, _ = self.angles()

        def arr(name, values, fmt, comps=1, typ="Float64"):
            c = f' NumberOfComponents="{comps}"' if comps > 1 else ""
            body = " ".join(fmt % v for v in np.ravel(values))
            return f'<DataArray type="{typ}" Name="{name}"{c} format="ascii">{body}</DataArray>'

        xml = f"""<?xml version="1.0"?>
<VTKFile type="UnstructuredGrid" version="1.0" byte_order="LittleEndian">
  <UnstructuredGrid>
    <Piece NumberOfPoints="{self.n_nodes}" NumberOfCells="{self.n_elements}">
      <Points>{arr("Points", points, "%.9g", 3)}</Points>
      <Cells>
        {arr("connectivity", connectivity, "%d", typ="Int64")}
        {arr("offsets", np.cumsum(sizes), "%d", typ="Int64")}
        {arr("types", types, "%d", typ="UInt8")}
      </Cells>
      <CellData Scalars="domain">
        {arr("domain", self.element_domains(), "%d", typ="Int32")}
        {arr("quality", self.quality(), "%.6g")}
        {arr("min_angle", smallest, "%.6g")}
        {arr("aspect_ratio", self.aspect_ratio(), "%.6g")}
      </CellData>
    </Piece>
  </UnstructuredGrid>
</VTKFile>
"""
        Path(path).write_text(xml, encoding="utf-8")
