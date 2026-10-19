# fem-solver

A transparent finite element solver for teaching, used by FEM Studio (preview).
Its internals — element matrices, assembly, sparsity, reactions — are meant to
be shown, not hidden. Meshes come from [`mesher/`](../mesher).

```sh
pip install -e "mesher[dev]" -e "femsolver[dev]"
pytest femsolver/tests
```

## 2D electrostatics, P1 triangles

−∇·(ε∇V) = ρ with `ground`, `potential` (may depend on x, y), `surface_charge_density`
(−D·n = σ) and the natural condition D·n = 0 on untouched boundaries; volume
`charge_density`; `depth` for the 2D plane.

```python
from fem_mesher import Geometry2D, mesh_geometry
from fem_solver import Electrostatics, solve, check

mesh = mesh_geometry(Geometry2D.model_validate(geometry_json)).mesh
problem = Electrostatics.model_validate({
    "materials": {"diel": {"name": "FR4", "relative_permittivity": 4}},
    "boundary_conditions": [
        {"type": "potential", "boundary": "top", "value": "U"},
        {"type": "ground", "boundary": "bottom"},
    ],
    "parameters": {"U": 1.0},
})
issues = check(problem, mesh.domain_names, list(mesh.boundaries))   # the model checklist
result = solve(problem, mesh)
result.capacitance   # {"from_charge", "from_energy", "voltage"} for two-electrode models
```

Results: potential, E and D per element, energy (total and per domain), charge
per electrode from the reactions K·u − f and, for comparison, from D·n of the
adjacent elements, capacitance two ways, and `info` (nodes, free/prescribed,
nonzeros, timings, residual) plus the global `stiffness` matrix.

`fem_solver.opencfs.export` writes `simulation.xml` + `mat.xml` for openCFS
(the mesh as Gmsh MSH 2.2 from the mesher); both validate against openCFS's
XML schemas.

## Test standard (every physics)

1. analytic benchmarks, 2. manufactured solutions with convergence rates,
3. consistency identities (Q = CΔV = 2W/ΔV, Gauss), 4. one test per boundary
condition, 5. invariance, 6. element-level closed forms. The element tests were
checked by mutation: deliberately broken quadrature, assembly or areas must fail.
