# fem-mesher

Geometry description → conforming triangle mesh (Gmsh/OpenCASCADE) with named
domains and boundaries. Solver-agnostic: no web or cloud dependencies. Used by
FEM Studio (preview, see `frontend/src/config/features.ts`).

```sh
pip install -e "mesher[dev]"
python -m fem_mesher geometry.json --msh model.msh --vtu model.vtu   # prints mesh statistics
pytest mesher/tests
```

## Geometry JSON (version 1, 2D)

```json
{
  "parameters": { "d": 0.01, "w": 0.04, "t": 0.002 },
  "shapes": [
    { "kind": "rectangle", "name": "air", "x": "-w", "y": "-w", "width": "2*w", "height": "2*w" },
    { "kind": "rectangle", "name": "dielectric", "x": "-w/2", "y": "-d/2", "width": "w", "height": "d" },
    { "kind": "rectangle", "name": "top", "x": "-w/2", "y": "d/2", "width": "w", "height": "t" },
    { "kind": "circle", "name": "wire", "cx": 0, "cy": "-0.03", "r": 0.002 }
  ],
  "holes": ["top", "wire"],
  "selections": [{ "name": "left", "xmin": "-w", "ymin": "-w", "xmax": "-w", "ymax": "w" }],
  "mesh": { "size": 0.004, "boundary_sizes": { "top": 0.0005 }, "order": 1 }
}
```

- **Shapes**: `rectangle` (x, y = lower-left corner), `circle`, `polygon` (`points`).
  Any number may be an expression of `parameters` (`+ - * / **`, `pi`, `sqrt`,
  `sin`, `cos`, `tan`, `atan2`, `abs`, `min`, `max`); parameters may use earlier ones.
- **Overlaps**: all shapes are fragmented together, so the mesh is conforming and
  interfaces share nodes. Where shapes overlap, the **later** shape wins.
- **Holes** are cut out and not meshed (e.g. the inside of an electrode), whatever their order.
- **Domains** are named after their shape.
- **Boundaries** get automatic names that partition the boundary: `outer`, the
  hole's name around a hole, and `a|b` between domains `a` and `b`. Box
  `selections` add names (all curves fully inside the box) and may overlap them.
- **Mesh**: `size` (maximum element size), `domain_sizes`, `boundary_sizes`
  (graded over 4 × size), `order` 1 or 2, `elements_per_circle`.

## Output

- `Mesh`: nodes, triangles (3 corners, or 3 corners + midpoints of edges 01, 12, 20),
  domain per triangle, boundary edges and named boundaries; counter-clockwise
  triangles; quality q = 4√3·A / Σl² (1 = equilateral) and statistics.
- `.msh`: MSH 2.2 ASCII with physical names = domain/boundary names, the format
  and version openCFS reads (its regions take the physical names).
- `.vtu`: ParaView, with domain and quality as cell data.

Licence: links Gmsh (GPL); fine for the hosted service, see ROADMAP.md before
distributing binaries.
