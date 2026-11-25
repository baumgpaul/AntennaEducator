# fem-mesher

Geometry sequence → conforming triangle mesh (Gmsh/OpenCASCADE) with named
domains and boundaries. Solver-agnostic: no web or cloud dependencies. Used by
FEM Studio (preview, see `frontend/src/config/features.ts`).

```sh
pip install -e "mesher[dev]"
python -m fem_mesher geometry.json --msh model.msh --vtu model.vtu   # prints mesh statistics
pytest mesher/tests
```

## Geometry JSON (version 2, 2D)

Like the geometry sequence of a CAD or FEM tool: each step creates one named
object, from numbers and parameter expressions or from earlier objects.

```json
{
  "version": 2,
  "parameters": { "w": 0.04, "d": 0.004, "t": 0.001 },
  "steps": [
    { "kind": "rectangle", "name": "box", "x": "-w", "y": "-w", "width": "2*w", "height": "2*w" },
    { "kind": "circle", "name": "slot", "cx": 0, "cy": "-w/2", "r": "d" },
    { "kind": "difference", "name": "air", "objects": ["box"], "tools": ["slot"] },
    { "kind": "rectangle", "name": "top", "x": "-w/2", "y": "d/2", "width": "w", "height": "t", "corner_radius": "t/4" },
    { "kind": "mirror", "name": "bottom", "objects": ["top"], "angle": 0, "keep": true },
    { "kind": "polyline", "name": "guard", "points": [["-w/2", 0], ["w/2", 0]] }
  ],
  "holes": ["top", "bottom"],
  "selections": [{ "kind": "points", "name": "left", "points": [["-w", 0]] }],
  "mesh": {
    "size": "w/8",
    "controls": [
      { "target": "top", "size": "d/6" },
      { "target": "guard", "divisions": 40, "grading": 2 }
    ]
  }
}
```

### Steps

| Kind | Creates | Fields |
|---|---|---|
| `rectangle` | surface | `x, y` (lower-left corner), `width, height`, `rotation` (° about the corner), `corner_radius` |
| `circle` | surface | `cx, cy, r` |
| `ellipse` | surface | `cx, cy, rx, ry, rotation` |
| `sector` | surface | `cx, cy, r, start, end` (°, counter-clockwise), `r_inner` (annular sector; 0…360 = ring) |
| `polygon` | surface | `points` |
| `polyline` | curve | `points`, `closed` |
| `arc` | curve | `cx, cy, r, start, end` |
| `spline` | curve | `points` (smooth curve through them) |
| `point` | point | `x, y` |
| `surface` | surface | `curves`: curve objects forming one closed loop, in any order (consumed) |
| `union`, `intersection` | like inputs | `objects` (≥ 2, all surfaces or all curves), `keep` |
| `difference` | like `objects` | `objects`, `tools` (subtracted), `keep` |
| `move` / `rotate` / `scale` / `mirror` | — or a copy | `objects`; `dx, dy` / `cx, cy, angle` / `cx, cy, factor, factor_y` / `x, y, angle` (mirror line). In place, or with `keep` the copies become a new object `name` |
| `array` / `polar_array` | one object | `objects`, `count` (original included); `dx, dy` / `cx, cy, angle` (between copies) |

Every number may be an expression of `parameters` (`+ - * / **`, `pi`, `sqrt`,
`sin`, `cos`, `tan`, `atan2`, `abs`, `min`, `max`); parameters may use earlier
ones. Angles are in degrees. Booleans and arrays consume their inputs (unless
`keep`); step names are unique. An object listed after it was consumed is an error.

### From objects to domains and boundaries

- **Overlaps**: all remaining objects are fragmented together, so the mesh is
  conforming and interfaces share nodes. Where surfaces overlap, the object
  created **later** wins.
- **Domains** are the surface objects, named after them.
- **Holes** are cut out and not meshed (e.g. the inside of an electrode), whatever their order.
- **Curve objects** become named lines inside the domains (thin electrodes, lines
  that guide the mesh); a part outside every domain is dropped with a warning.
  **Point objects** become mesh nodes (local size, probes).
- **Boundaries** get automatic names that partition the boundary: `outer`, the
  hole's name around a hole, and `a|b` between domains `a` and `b`.
- **Selections** add names and may overlap them: `box` (all curves fully inside
  the box), `points` (the curve nearest to each point: what a click stores) and
  `boundary_of` (all boundary curves of the given `domains`).

### Mesh

- `size` (maximum element size), `min_size`, `order` 1 or 2, `elements_per_circle`
  (resolution of curved boundaries), `algorithm` (`frontal-delaunay`, `delaunay`,
  `meshadapt`), `smoothing` (passes).
- `controls`, one per target:
  - `size`: inside a domain; along a boundary/curve or at a point, graded back
    to `size` over 4 × `size`;
  - `divisions`: number of elements along a boundary or curve (shared by its
    curves in proportion to their length), with `grading` = last/first element;
  - `structured`: a regular (mapped) mesh in a domain with 3 or 4 sides.
- `mesh_geometry(…, max_elements=N)` refuses meshes estimated to be larger,
  before meshing.

Version 1 models (a flat list of `shapes`, `domain_sizes`/`boundary_sizes`) are
upgraded on load and mesh exactly as before.

## Output

- `Mesh`: nodes, triangles (3 corners, or 3 corners + midpoints of edges 01, 12, 20),
  domain per triangle, boundary edges and named boundaries (curve objects included);
  counter-clockwise triangles; quality q = 4√3·A / Σl² (1 = equilateral) and statistics.
- `.msh`: MSH 2.2 ASCII with physical names = domain/boundary names, the format
  and version openCFS reads (its regions take the physical names).
- `.vtu`: ParaView, with domain and quality as cell data.

Licence: links Gmsh (GPL); fine for the hosted service, see ROADMAP.md before
distributing binaries.
