# FEM Solver Integration — Architecture & Action Plan

## Executive Summary

Integrate a Finite Element Method (FEM) solver into the Antenna Educator platform, reimplemented as a Python microservice architecture inspired by [openCFS](https://opencfs.org). The implementation follows a **physics-first, incremental approach**: start with **Electrostatics** (all flavors), then expand physics step-by-step. Every feature follows strict **TDD principles**.

**Target:** A modular, extensible FEM engine that mirrors openCFS's proven architecture (PDE → Operators → Forms → Assembly → Solve → Postprocess) but reimplemented in idiomatic Python with NumPy/SciPy, exposed as FastAPI microservices on the existing AWS infrastructure.

---

## 1. openCFS Architecture Analysis

### 1.1 Core Design Patterns Identified

After thorough investigation of the openCFS C++ codebase (`E:\cfs-master\cfs-master`), the following architectural layers were identified:

```
┌─────────────────────────────────────────────────────────────────┐
│                        Driver Layer                             │
│  StaticDriver │ HarmonicDriver │ TransientDriver │ EigenDriver  │
├─────────────────────────────────────────────────────────────────┤
│                      SolveStep Layer                            │
│  StdSolveStep │ SolveStepElec │ SolveStepHyst │ IterSolveStep  │
├─────────────────────────────────────────────────────────────────┤
│                      Assembly Layer                             │
│  Assemble: registers BiLinForms + LinForms, iterates elements,  │
│  computes element matrices, assembles into global system        │
├─────────────────────────────────────────────────────────────────┤
│                    PDE Definition Layer                          │
│  BasePDE → StdPDE → SinglePDE → ElecPDE / MagPDE / MechPDE     │
│  Each PDE defines: integrators, BCs, materials, postprocessing  │
├─────────────────────────────────────────────────────────────────┤
│                   Forms & Operators Layer                        │
│  BiLinearForms: BDBInt (∫ Bᵀ D B dΩ), BBInt (∫ αB·B dΩ)       │
│  LinearForms: BUInt (∫ B·U dΩ)                                 │
│  Operators: Gradient, Curl, Div, Identity, Strain               │
├─────────────────────────────────────────────────────────────────┤
│                   FE Basis / Space Layer                         │
│  FeSpace (H1, HCurl, HDiv, L2) → BaseFE → FeNodal / FeHi      │
│  Shape functions, equation numbering, DOF management            │
├─────────────────────────────────────────────────────────────────┤
│                     Material Layer                              │
│  BaseMaterial → ElectroStaticMaterial / MechanicMaterial / ...  │
│  CoefFunction hierarchy for material tensor evaluation          │
├─────────────────────────────────────────────────────────────────┤
│                   Domain / Mesh Layer                            │
│  Grid: nodes, elements, regions, coordinate systems             │
│  BCs: Dirichlet, Neumann, periodic, Nitsche coupling            │
│  Results: ResultInfo, ResultFunctor, WriteResults                │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Key openCFS Patterns for Electrostatics

The `ElecPDE` class (1884 lines) demonstrates the complete pattern:

| Method | Purpose | Python Equivalent |
|---|---|---|
| `CreateFeSpaces()` | Creates H1 FE space for electric potential (`ELEC_POTENTIAL`) | `ElectrostaticPDE.create_fe_spaces()` |
| `DefineIntegrators()` | Creates `BDBInt(GradientOperator, ε_tensor)` stiffness integrators per region | `ElectrostaticPDE.define_integrators()` |
| `DefineSurfaceIntegrators()` | Bloch periodic BCs, Nitsche coupling | Phase 2+ |
| `DefineRhsLoadIntegrators()` | Charge density, surface charge loads | `ElectrostaticPDE.define_rhs_integrators()` |
| `DefinePrimaryResults()` | Electric potential output | `ElectrostaticPDE.define_primary_results()` |
| `DefinePostProcResults()` | E-field, D-field, energy, charges, forces | `ElectrostaticPDE.define_postproc_results()` |
| `DefineSolveStep()` | Creates `StdSolveStep` or `SolveStepHyst` | `ElectrostaticPDE.define_solve_step()` |

**Critical formula — Electrostatic weak form:**
$$\int_\Omega \varepsilon \, \nabla \varphi \cdot \nabla \psi \, d\Omega = \int_\Omega \rho \, \psi \, d\Omega + \int_{\Gamma_N} q_s \, \psi \, d\Gamma$$

Where $\varphi$ is the electric potential (H1 scalar field), $\varepsilon$ is the permittivity tensor, $\rho$ is the volume charge density, and $q_s$ is the surface charge density.

**Stiffness matrix = BDBInt with B = GradientOperator, D = permittivity tensor ε**

### 1.3 Electrostatic Variants in openCFS

| Variant | openCFS Class | Key Difference |
|---|---|---|
| **Electrostatic (linear)** | `ElecPDE` | `BDBInt(Grad, ε_tensor)` — standard Laplace-type |
| **Electrostatic (nonlinear)** | `ElecPDE` + `NLELEC_PERMITTIVITY` | `BBInt(Grad, ε_NL(E))` — field-dependent permittivity |
| **Electrostatic (hysteresis)** | `ElecPDE` + `SolveStepHyst` | Preisach / Jiles-Atherton model, `CoefFunctionHyst` |
| **Electrostatic (multiharmonic)** | `ElecPDE` + `MultiHarmonicDriver` | `CoefFunctionHarmBalance`, Fourier-based nonlinear |
| **Electrostatic (PML)** | `ElecPDE` + `CoefFunctionPML` | Perfectly matched layer for open boundaries |
| **Electrostatic (Nitsche)** | `ElecPDE` + `SurfaceNitscheABInt` | Non-conforming mesh coupling |
| **Electrostatic (piezo-coupled)** | `ElecPDE` + `PiezoCoupling` | Sign flip on stiffness for coupled block |
| **Electric current flow** | `ElecCurrentPDE` | Conductivity σ instead of ε, Ohm's law |
| **Electro-quasistatic** | `ElecQuasistaticPDE` | σ + jωε combined (conduction + displacement current) |

---

## 2. Python Microservice Architecture

### 2.1 Service Topology

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        Frontend (React + Three.js)                           │
│  Existing: PEEC Antenna Design │ New: FEM Geometry Editor + Result Viewer    │
└────────────┬───────────────┬───────────────┬──────────────┬──────────────────┘
             │               │               │              │
     ┌───────▼──────┐ ┌─────▼──────┐ ┌──────▼─────┐ ┌─────▼──────────┐
     │  Projects    │ │ PEEC       │ │ FEM        │ │ FEM            │
     │  Service     │ │ Solver     │ │ Solver     │ │ Postprocessor  │
     │  (8010)      │ │ (8002)     │ │ (8020)     │ │ (8021)         │
     └──────────────┘ └────────────┘ └──────┬─────┘ └───────┬────────┘
                                            │               │
                                     ┌──────▼───────────────▼────────┐
                                     │     FEM Engine (shared lib)    │
                                     │  backend/fem/                  │
                                     │  ├── mesh/                     │
                                     │  ├── fe_spaces/                │
                                     │  ├── operators/                │
                                     │  ├── forms/                    │
                                     │  ├── assembly/                 │
                                     │  ├── materials/                │
                                     │  ├── pdes/                     │
                                     │  ├── drivers/                  │
                                     │  ├── solve_steps/              │
                                     │  └── postprocessing/           │
                                     └───────────────────────────────┘
```

### 2.2 Package Structure

```
backend/
├── fem/                          # FEM engine core library
│   ├── __init__.py
│   ├── constants.py              # Physical constants (reuse from common/)
│   │
│   ├── mesh/                     # Domain / Mesh layer
│   │   ├── __init__.py
│   │   ├── node.py               # Node class (coordinates, ID)
│   │   ├── element.py            # Element classes (Tri3, Tri6, Quad4, Tet4, Tet10, Hex8...)
│   │   ├── region.py             # Region (named group of elements + material)
│   │   ├── mesh.py               # Mesh container (nodes, elements, regions)
│   │   ├── boundary.py           # Boundary / surface element tracking
│   │   ├── generators.py         # Simple mesh generators (rectangle, box, cylinder)
│   │   └── io/
│   │       ├── __init__.py
│   │       ├── gmsh_reader.py    # Gmsh .msh format reader
│   │       └── mesh_export.py    # Export for visualization
│   │
│   ├── fe_spaces/                # FE Basis / Space layer
│   │   ├── __init__.py
│   │   ├── base_fe.py            # BaseFE: shape function evaluation interface
│   │   ├── lagrange.py           # Lagrange (nodal) shape functions (1D, 2D, 3D)
│   │   ├── fe_space.py           # FeSpace: DOF management, equation numbering
│   │   ├── h1_space.py           # H1 conforming space (for scalar potentials)
│   │   ├── hcurl_space.py        # H(curl) space (for edge elements — Phase 3+)
│   │   ├── fe_function.py        # FeFunction: solution vector + space binding
│   │   └── integration.py        # Gauss quadrature rules (1D, triangle, tet, quad, hex)
│   │
│   ├── operators/                # Differential operators
│   │   ├── __init__.py
│   │   ├── base_operator.py      # BaseBOperator interface
│   │   ├── gradient.py           # GradientOperator (∇φ) — key for electrostatics
│   │   ├── identity.py           # IdentityOperator (φ itself)
│   │   ├── curl.py               # CurlOperator (∇×A) — Phase 3+
│   │   ├── divergence.py         # DivOperator (∇·) — Phase 3+
│   │   └── strain.py             # StrainOperator (symmetric gradient) — Phase 5+
│   │
│   ├── forms/                    # Bilinear & linear forms (integrators)
│   │   ├── __init__.py
│   │   ├── bilinear_form.py      # BiLinearForm base class
│   │   ├── bdb_integrator.py     # BDBInt: ∫ Bᵀ D B dΩ (stiffness with material tensor)
│   │   ├── bb_integrator.py      # BBInt: ∫ α (Bφ)·(Bψ) dΩ (scalar coefficient)
│   │   ├── mass_integrator.py    # MassInt: ∫ ρ φ·ψ dΩ (for transient/eigenvalue)
│   │   ├── linear_form.py        # LinearForm base class
│   │   ├── bu_integrator.py      # BUInt: ∫ B·U dΩ (RHS load)
│   │   └── surface_integrator.py # Surface forms (Neumann, Robin BCs)
│   │
│   ├── materials/                # Material definitions
│   │   ├── __init__.py
│   │   ├── base_material.py      # BaseMaterial: coefficient function interface
│   │   ├── electrostatic.py      # Permittivity (scalar, tensor, isotropic, anisotropic)
│   │   ├── conduction.py         # Conductivity σ (for current flow — Phase 2)
│   │   ├── magnetic.py           # Permeability μ, reluctivity ν (Phase 3)
│   │   ├── mechanic.py           # Elasticity tensor C (Phase 5)
│   │   ├── acoustic.py           # Density ρ, speed c (Phase 6)
│   │   ├── nonlinear.py          # Nonlinear curve interpolation (B-H, ε-E)
│   │   └── coef_function.py      # CoefFunction: evaluated material at integration points
│   │
│   ├── assembly/                 # Global system assembly
│   │   ├── __init__.py
│   │   ├── assembler.py          # Assemble: iterate elements, compute & scatter elem matrices
│   │   ├── algebraic_system.py   # Global sparse matrix (CSR) + RHS vector
│   │   └── bc_handler.py         # Dirichlet, Neumann, periodic BC application
│   │
│   ├── pdes/                     # PDE definitions (physics)
│   │   ├── __init__.py
│   │   ├── base_pde.py           # BasePDE interface
│   │   ├── single_pde.py         # SinglePDE: single-field problem
│   │   ├── electrostatic.py      # ElectrostaticPDE (all variants)
│   │   ├── current_flow.py       # CurrentFlowPDE (Phase 2)
│   │   ├── magnetostatic.py      # MagnetostaticPDE (Phase 3)
│   │   ├── eddy_current.py       # EddyCurrentPDE (Phase 4)
│   │   ├── mechanic.py           # MechanicPDE (Phase 5)
│   │   ├── acoustic.py           # AcousticPDE (Phase 6)
│   │   └── coupled/              # Coupled PDEs (Phase 7+)
│   │       ├── __init__.py
│   │       ├── base_coupling.py
│   │       └── piezo_coupling.py
│   │
│   ├── drivers/                  # Analysis drivers
│   │   ├── __init__.py
│   │   ├── base_driver.py        # BaseDriver interface
│   │   ├── static_driver.py      # StaticDriver: single solve
│   │   ├── harmonic_driver.py    # HarmonicDriver: frequency sweep (Phase 2+)
│   │   ├── transient_driver.py   # TransientDriver: time stepping (Phase 3+)
│   │   └── eigenvalue_driver.py  # EigenvalueDriver: modal analysis (Phase 5+)
│   │
│   ├── solve_steps/              # Per-step solve logic
│   │   ├── __init__.py
│   │   ├── base_solve_step.py
│   │   ├── std_solve_step.py     # Standard linear solve
│   │   └── nonlinear_step.py     # Newton-Raphson iteration (Phase 1b)
│   │
│   ├── solvers/                  # Linear algebra solvers
│   │   ├── __init__.py
│   │   ├── direct.py             # scipy.sparse.linalg.spsolve (LU)
│   │   ├── iterative.py          # CG, GMRES with preconditioners
│   │   └── eigen.py              # Eigenvalue solvers (Phase 5+)
│   │
│   └── postprocessing/           # Result computation
│       ├── __init__.py
│       ├── field_evaluator.py    # Evaluate fields at integration points
│       ├── energy.py             # Energy density, total energy
│       ├── flux.py               # Flux density (D = εE)
│       ├── force.py              # Electrostatic force (Maxwell stress tensor)
│       └── charge.py             # Surface charge integration
│
├── fem_solver/                   # FEM Solver microservice (FastAPI)
│   ├── __init__.py
│   ├── main.py                   # FastAPI app, endpoints
│   ├── config.py                 # Pydantic settings (port 8020)
│   ├── schemas.py                # Request/response Pydantic models
│   ├── lambda_handler.py         # Mangum wrapper for AWS Lambda
│   ├── Dockerfile.lambda
│   └── services/
│       ├── __init__.py
│       ├── simulation.py         # Orchestrates mesh→assemble→solve→postprocess
│       └── mesh_service.py       # Mesh generation / import handling
│
├── fem_postprocessor/            # FEM Postprocessor microservice (FastAPI)
│   ├── __init__.py
│   ├── main.py                   # FastAPI app
│   ├── config.py                 # Pydantic settings (port 8021)
│   ├── schemas.py
│   ├── lambda_handler.py
│   └── Dockerfile.lambda
│
└── common/                       # Shared (existing)
    ├── constants.py              # MU_0, EPSILON_0, C_0 — already exists
    └── ...
```

### 2.3 Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| **Language** | Python 3.11+ | Matches existing backend; NumPy/SciPy for numerics |
| **Sparse matrices** | `scipy.sparse` (CSR) | Native sparse format, direct/iterative solvers |
| **Mesh format** | Gmsh `.msh` v4 | Industry standard, excellent Python API (`gmsh` package) |
| **Visualization** | VTK export + Three.js frontend | Consistent with existing 3D viewer |
| **Linear algebra** | `scipy.sparse.linalg` | `spsolve` (SuperLU/UMFPACK), `cg`, `gmres` |
| **Shape functions** | NumPy vectorized | Batch evaluation at all integration points |
| **Element types** | Tri3/6, Quad4/9, Tet4/10, Hex8/27 | Matches openCFS element zoo |
| **API style** | REST (FastAPI) | Consistent with existing PEEC services |
| **Deployment** | Lambda + Docker | Same as existing services |

### 2.4 Mapping openCFS C++ → Python

| openCFS C++ | Python Equivalent | Notes |
|---|---|---|
| `Grid` | `Mesh` class | Nodes, elements, regions |
| `Elem` (+ shape types) | `Element` subclasses | `Tri3`, `Tet4`, `Hex8`, etc. |
| `FeSpace` (H1/HCurl/HDiv) | `H1Space`, `HCurlSpace` | DOF management, equation numbering |
| `BaseFE` → `FeNodal` → `H1Elems` | `LagrangeBasis` | Shape function evaluation |
| `BaseBOperator` → `GradientOperator` | `GradientOperator` | B-matrix computation |
| `BDBInt<Double>` | `BDBIntegrator` | Element stiffness: ∫ Bᵀ D B dΩ |
| `BBInt<Double>` | `BBIntegrator` | Scalar coef: ∫ α B·B dΩ |
| `BUIntegrator` | `BUIntegrator` | RHS: ∫ B·f dΩ |
| `CoefFunction` | `CoefFunction` / material eval | Material tensor at integration points |
| `Assemble` | `Assembler` | Element loop, scatter to global |
| `AlgebraicSys` | `AlgebraicSystem` | CSR matrix + RHS vector |
| `BasePDE` → `SinglePDE` → `ElecPDE` | `ElectrostaticPDE` | Physics definition |
| `StaticDriver` | `StaticDriver` | Orchestrates assemble → solve → store |
| `StdSolveStep` | `StdSolveStep` | Single linear solve step |
| `ResultInfo` / `ResultFunctor` | `ResultDefinition` / `FieldEvaluator` | Postprocessing |
| `BaseMaterial` → `ElectroStaticMaterial` | `ElectrostaticMaterial` | ε tensor retrieval |

---

## 3. Electrostatic Implementation — Detailed Plan

### Phase 1a: Core FEM Infrastructure + Linear Electrostatics (Weeks 1–6)

This is the foundational phase. Every subsequent physics module builds on these components.

#### Week 1–2: Mesh & Element Infrastructure

**Goal:** Read/create meshes, define element types, compute Jacobians.

| # | Task | Tests First (TDD) | Files |
|---|---|---|---|
| 1.1 | `Node` class: ID, coordinates (2D/3D) | `test_node.py`: creation, distance | `fem/mesh/node.py` |
| 1.2 | `Element` base + `Tri3`, `Quad4` (2D) | `test_element.py`: connectivity, Jacobian, area | `fem/mesh/element.py` |
| 1.3 | `Tet4`, `Hex8` (3D) | `test_element_3d.py`: volume, Jacobian | `fem/mesh/element.py` |
| 1.4 | `Region` class: named group of elements + material ref | `test_region.py` | `fem/mesh/region.py` |
| 1.5 | `Mesh` container: add nodes/elements, region management | `test_mesh.py`: construction, queries | `fem/mesh/mesh.py` |
| 1.6 | `Boundary` detection: extract surface elements from volume mesh | `test_boundary.py` | `fem/mesh/boundary.py` |
| 1.7 | Simple mesh generators: `rectangle_mesh()`, `box_mesh()` | `test_generators.py`: node count, connectivity | `fem/mesh/generators.py` |
| 1.8 | Gmsh `.msh` reader (v4 format) | `test_gmsh_reader.py` with fixture files | `fem/mesh/io/gmsh_reader.py` |

**Gold standard test:** Generate a unit square mesh (2 triangles), verify node coordinates and element connectivity.

#### Week 2–3: FE Basis & Integration

**Goal:** Shape functions, quadrature rules, FE spaces with DOF numbering.

| # | Task | Tests First | Files |
|---|---|---|---|
| 2.1 | Gauss quadrature: 1D, triangle, quadrilateral, tetrahedron, hexahedron | `test_integration.py`: integrate polynomials exactly | `fem/fe_spaces/integration.py` |
| 2.2 | Lagrange shape functions: line (p=1,2), tri (p=1,2), quad (p=1,2), tet (p=1,2), hex (p=1,2) | `test_lagrange.py`: partition of unity, interpolation | `fem/fe_spaces/lagrange.py` |
| 2.3 | `BaseFE` interface: `evaluate(xi)` → shapes + derivatives | `test_base_fe.py` | `fem/fe_spaces/base_fe.py` |
| 2.4 | `H1Space`: equation numbering, Dirichlet BC marking, DOF count | `test_h1_space.py`: simple mesh numbering | `fem/fe_spaces/h1_space.py` |
| 2.5 | `FeFunction`: bind solution vector to space, evaluate at points | `test_fe_function.py` | `fem/fe_spaces/fe_function.py` |

**Gold standard test:** Integrate $f(x,y) = x^2 + y^2$ over unit triangle using Gauss quadrature with exact result $\frac{1}{6}$.

#### Week 3–4: Operators, Forms, Assembly

**Goal:** Compute element matrices via operator + material + integration, assemble into global sparse system.

| # | Task | Tests First | Files |
|---|---|---|---|
| 3.1 | `BaseBOperator` interface | `test_base_operator.py` | `fem/operators/base_operator.py` |
| 3.2 | `GradientOperator`: compute B-matrix (∇N) at integration points | `test_gradient.py`: verify against analytical ∇N for Tri3 | `fem/operators/gradient.py` |
| 3.3 | `IdentityOperator`: N itself (for mass matrices, loads) | `test_identity.py` | `fem/operators/identity.py` |
| 3.4 | `CoefFunction`: constant scalar, constant tensor, spatially varying | `test_coef_function.py` | `fem/materials/coef_function.py` |
| 3.5 | `ElectrostaticMaterial`: permittivity (scalar→diag tensor, full tensor) | `test_electrostatic_material.py` | `fem/materials/electrostatic.py` |
| 3.6 | `BDBIntegrator`: ∫ Bᵀ D B dΩ element matrix computation | `test_bdb_integrator.py`: Tri3 element stiffness vs analytical | `fem/forms/bdb_integrator.py` |
| 3.7 | `BBIntegrator`: ∫ α B·B dΩ (scalar coefficient variant) | `test_bb_integrator.py` | `fem/forms/bb_integrator.py` |
| 3.8 | `BUIntegrator`: ∫ B·f dΩ element RHS vector | `test_bu_integrator.py` | `fem/forms/bu_integrator.py` |
| 3.9 | `AlgebraicSystem`: sparse CSR matrix + RHS vector, DOF management | `test_algebraic_system.py` | `fem/assembly/algebraic_system.py` |
| 3.10 | `BCHandler`: Dirichlet (elimination + penalty), Neumann (RHS) | `test_bc_handler.py` | `fem/assembly/bc_handler.py` |
| 3.11 | `Assembler`: element loop, local→global scatter, BC application | `test_assembler.py`: 2-element mesh, verify global K | `fem/assembly/assembler.py` |

**Gold standard test:** Assemble stiffness matrix for 2×2 quad mesh with known analytical entries, verify symmetry and sparsity pattern.

#### Week 4–5: PDE, Driver, Solver

**Goal:** Complete end-to-end electrostatic solve for a simple capacitor problem.

| # | Task | Tests First | Files |
|---|---|---|---|
| 4.1 | `BasePDE` / `SinglePDE` interface | `test_base_pde.py` | `fem/pdes/base_pde.py`, `single_pde.py` |
| 4.2 | `ElectrostaticPDE`: define integrators, BCs, materials, results | `test_electrostatic_pde.py` | `fem/pdes/electrostatic.py` |
| 4.3 | `DirectSolver`: `scipy.sparse.linalg.spsolve` wrapper | `test_direct_solver.py`: solve known Ax=b | `fem/solvers/direct.py` |
| 4.4 | `StdSolveStep`: assemble → apply BCs → solve → extract solution | `test_std_solve_step.py` | `fem/solve_steps/std_solve_step.py` |
| 4.5 | `StaticDriver`: orchestrate init → solve → store results | `test_static_driver.py` | `fem/drivers/static_driver.py` |
| 4.6 | **End-to-end: Parallel plate capacitor (2D)** | `test_capacitor_2d.py`: V(x)=linear distribution, C=εA/d | Gold standard |
| 4.7 | **End-to-end: Cube capacitor (3D)** — matches openCFS `Cube3d` test | `test_cube3d.py`: compare potential, E-field, energy | Gold standard |

**Gold standard test — Parallel Plate Capacitor:**
- Unit square, ε = ε₀, ground on bottom, V=1 on top
- Expected: linear potential V(y) = y, uniform E-field = -ŷ
- Capacitance per unit depth: C = ε₀ · w / d

**Gold standard test — 3D Cube (openCFS Cube3d equivalent):**
- Unit cube, ε = 8.85419e-12 (silicon permittivity from openCFS mat.xml)
- Ground on z=0, potential=1.0 on z=1
- Expected: V(z) = z, E = (0, 0, -1), energy = ½εV²/d

#### Week 5–6: Postprocessing & Basic API

| # | Task | Tests First | Files |
|---|---|---|---|
| 5.1 | `FieldEvaluator`: compute E = -∇φ at element centers / nodes | `test_field_evaluator.py` | `fem/postprocessing/field_evaluator.py` |
| 5.2 | `FluxComputation`: D = ε·E at integration points | `test_flux.py` | `fem/postprocessing/flux.py` |
| 5.3 | `EnergyComputation`: w_e = ½ ε E·E (density + total) | `test_energy.py`: capacitor energy = ½CV² | `fem/postprocessing/energy.py` |
| 5.4 | `ChargeComputation`: Q = ∫ D·n dΓ (surface charge) | `test_charge.py` | `fem/postprocessing/charge.py` |
| 5.5 | VTK export for visualization | `test_vtk_export.py` | `fem/mesh/io/mesh_export.py` |
| 5.6 | FastAPI FEM Solver service: `/api/fem/solve` endpoint | `test_fem_api.py` | `backend/fem_solver/main.py` |
| 5.7 | Request/response schemas for electrostatic | | `backend/fem_solver/schemas.py` |

**Milestone checkpoint:** At this point, the platform can solve any linear electrostatic problem in 2D or 3D with Dirichlet BCs and compute E-field, D-field, energy, and surface charges.

---

### Phase 1b: Electrostatic Extensions (Weeks 7–10)

#### Week 7–8: Higher-Order Elements & Neumann BCs

| # | Task | Tests First | Files |
|---|---|---|---|
| 6.1 | `Tri6` (quadratic triangle), `Tet10` (quadratic tet) elements | `test_higher_order.py`: improved convergence rate | element.py extension |
| 6.2 | `Quad9`, `Hex27` higher-order elements | `test_quad9_hex27.py` | element.py extension |
| 6.3 | Neumann BC: surface charge density q_s on boundary | `test_neumann_bc.py`: analytical solution with mixed BCs | `bc_handler.py` extension |
| 6.4 | Robin BC (impedance/mixed boundary) | `test_robin_bc.py` | `bc_handler.py` extension |
| 6.5 | h-convergence study: error vs mesh size | `test_convergence.py`: expected convergence rates | integration test |
| 6.6 | Axisymmetric formulation (2D axi) | `test_axisymmetric.py`: cylindrical capacitor | New integrator variant |

**Gold standard test:** h-convergence for L-shaped domain (openCFS `LShapedDomain` equivalent) — verify expected convergence rate for singular solution.

#### Week 8–9: Nonlinear Electrostatics

| # | Task | Tests First | Files |
|---|---|---|---|
| 7.1 | `NonlinearMaterial`: ε(E) curve interpolation | `test_nonlinear_material.py` | `fem/materials/nonlinear.py` |
| 7.2 | `NewtonRaphsonStep`: tangent stiffness + residual iteration | `test_newton_step.py`: convergence for simple NL problem | `fem/solve_steps/nonlinear_step.py` |
| 7.3 | NL electrostatic: field-dependent permittivity ε(|E|) | `test_nl_electrostatic.py` | `fem/pdes/electrostatic.py` |
| 7.4 | Jiles-Atherton hysteresis model (scalar) | `test_jiles_atherton.py` | `fem/materials/hysteresis.py` |
| 7.5 | Preisach hysteresis model (scalar) | `test_preisach.py` | `fem/materials/hysteresis.py` |

**Gold standard test:** openCFS `UnitCubeNL` equivalent — nonlinear permittivity curve, verify convergence within tolerance.

#### Week 9–10: Multi-Region, Anisotropic Materials, Charge Excitation

| # | Task | Tests First | Files |
|---|---|---|---|
| 8.1 | Multi-region meshes: different materials per region | `test_multi_region.py`: layered dielectric | Assembler extension |
| 8.2 | Anisotropic permittivity tensor (full 3×3) | `test_anisotropic.py` | Material extension |
| 8.3 | Volume charge density excitation (ρ_v) | `test_charge_excitation.py` | RHS integrator |
| 8.4 | Point charge / delta function source | `test_point_source.py` | RHS integrator |
| 8.5 | Electrostatic force (Maxwell stress tensor) | `test_elec_force.py`: analytical for parallel plate | `fem/postprocessing/force.py` |
| 8.6 | Capacitance matrix extraction (multi-electrode) | `test_capacitance_matrix.py` | postprocessing utility |

**Milestone checkpoint:** Complete electrostatic solver with linear/nonlinear materials, all BC types, multi-region, charge excitation, and comprehensive postprocessing.

---

## 4. Physics Expansion Roadmap (Beyond Electrostatics)

### Phase 2: Static Current Flow (Weeks 11–13)

**PDE:** $\nabla \cdot (\sigma \nabla \phi) = 0$  
**Key difference from electrostatics:** conductivity σ replaces permittivity ε. Same H1 space, same gradient operator. RHS can include volume current sources.

| Task | Reuses | New |
|---|---|---|
| `ConductionMaterial` (σ tensor) | `BaseMaterial` | Conductivity tensor |
| `CurrentFlowPDE` | `ElectrostaticPDE` pattern | σ instead of ε |
| Current density J = σE | `FieldEvaluator` | New result type |
| Joule losses P = ∫ σE·E dΩ | `EnergyComputation` | Loss integral |
| Resistance computation R = V/I | `ChargeComputation` | Surface current integral |

**Gold standard:** Resistor with known R = ρL/A, verify against analytical.

### Phase 3: Magnetostatics (Weeks 14–18)

**PDE (scalar potential):** $\nabla \cdot (\mu \nabla \psi) = 0$  
**PDE (vector potential, 2D):** $\nabla \times (\nu \nabla \times A) = J$

| Task | Reuses | New |
|---|---|---|
| `MagneticMaterial` (μ, ν tensors) | `BaseMaterial` | Permeability/reluctivity |
| `MagnetostaticPDE` (scalar potential) | `ElectrostaticPDE` pattern | Same structure, different material |
| `CurlOperator` | `BaseBOperator` | ∇× for edge elements |
| `HCurlSpace` (Nédélec edge elements) | `FeSpace` pattern | New DOF type |
| B = ∇×A, H = νB | `FieldEvaluator` | New result types |
| Magnetic energy, inductance | `EnergyComputation` | New formulas |
| Nonlinear B-H curve (saturation) | `NonlinearMaterial` | Iron saturation |
| Coil current source (J excitation) | `BUIntegrator` | Prescribed current density |

**Gold standard:** Solenoid inductance L = μN²A/l, saturating iron core B-H curve.

### Phase 4: Eddy Currents / Time-Harmonic (Weeks 19–23)

**PDE:** $\nabla \times (\nu \nabla \times A) + j\omega\sigma A = J_s$

| Task | Reuses | New |
|---|---|---|
| `HarmonicDriver` | `BaseDriver` | Frequency sweep |
| Complex-valued assembly | `Assembler` | Complex CSR matrices |
| σ·jω mass matrix term | `MassIntegrator` | Damping matrix |
| `EddyCurrentPDE` | `MagnetostaticPDE` | + conductivity damping |
| Eddy current losses | `EnergyComputation` | Complex power |
| Skin depth verification | | Known analytical |

**Gold standard:** Conducting sphere in uniform AC field, verify eddy current distribution vs analytical Mie series.

### Phase 5: Mechanics (Weeks 24–28)

**PDE:** $\nabla \cdot (C : \varepsilon(u)) = f$

| Task | Reuses | New |
|---|---|---|
| `StrainOperator` (symmetric gradient) | `BaseBOperator` | 6-component Voigt form |
| `MechanicMaterial` (C tensor, Voigt notation) | `BaseMaterial` | Elasticity tensor |
| `MechanicPDE` (displacement-based) | `SinglePDE` pattern | Vector-valued unknown (2/3 DOF) |
| Stress σ = C:ε, von Mises | `FieldEvaluator` | Derived quantities |
| `EigenvalueDriver` (modal analysis) | `BaseDriver` | `scipy.sparse.linalg.eigsh` |
| Natural frequencies, mode shapes | | Modal results |

**Gold standard:** Cantilever beam — tip deflection, natural frequencies vs Euler-Bernoulli.

### Phase 6: Acoustics (Weeks 29–32)

**PDE:** $\nabla \cdot (\frac{1}{\rho} \nabla p) + \frac{\omega^2}{\rho c^2} p = 0$

| Task | Reuses | New |
|---|---|---|
| `AcousticMaterial` (ρ, c) | `BaseMaterial` | Density, speed of sound |
| `AcousticPDE` (pressure-based) | `SinglePDE` pattern | Helmholtz equation |
| Absorbing BC (radiation condition) | `SurfaceIntegrator` | Robin-type BC |
| Sound pressure level, particle velocity | `FieldEvaluator` | Acoustic quantities |

**Gold standard:** Plane wave in duct, resonance frequencies of rectangular cavity.

### Phase 7: Coupled Physics (Weeks 33–40+)

| Coupling | Mechanism | Priority |
|---|---|---|
| **Piezoelectric** (electrostatic + mechanic) | Off-diagonal coupling matrices | High — direct CFS pattern |
| **Electromechanical** (electrostatic + mechanic) | Maxwell stress tensor forcing | High |
| **Vibroacoustic** (mechanic + acoustic) | Velocity-pressure coupling at interface | Medium |
| **Magnetostrictive** (magnetic + mechanic) | Stress from B-field | Low |
| **Thermo-electric** (heat + current flow) | Joule heating → temperature → σ(T) | Medium |

---

## 5. Timeline Overview

```
Week  1-2   ████ Mesh, Elements, Boundary detection
Week  3     ██   FE Basis, Quadrature, Shape functions
Week  4     ██   Operators, Forms, Assembly
Week  5     ██   PDE, Driver, Direct Solver — FIRST END-TO-END SOLVE
Week  6     ██   Postprocessing, API service — ELECTROSTATIC MVP
Week  7-8   ████ Higher-order elements, Neumann BCs, convergence
Week  8-9   ████ Nonlinear electrostatics (Newton, hysteresis)
Week  9-10  ████ Multi-region, anisotropic, force, capacitance
─── ELECTROSTATIC COMPLETE ───────────────────────────────
Week 11-13  ██████ Static current flow
Week 14-18  ██████████ Magnetostatics (scalar + vector potential)
Week 19-23  ██████████ Eddy currents / harmonic
Week 24-28  ██████████ Mechanics + eigenvalue
Week 29-32  ████████ Acoustics
Week 33-40  ████████████████ Coupled physics
```

**Key milestones:**
- **Week 5:** First successful FEM solve (parallel plate capacitor)
- **Week 6:** FEM API service deployed alongside PEEC
- **Week 10:** Complete electrostatic solver (all flavors)
- **Week 13:** Current flow solver
- **Week 18:** Magnetostatic solver
- **Week 28:** Full multiphysics platform (single-field)
- **Week 40:** Coupled multiphysics

---

## 6. API Design (FEM Solver Service)

### 6.1 Endpoints

```
POST /api/fem/solve/electrostatic    # Full electrostatic simulation
POST /api/fem/mesh/generate          # Generate mesh from geometry
POST /api/fem/mesh/import            # Import mesh (gmsh format)
GET  /api/fem/results/{job_id}       # Retrieve results
GET  /api/fem/results/{job_id}/field # Get field data for visualization
GET  /health                         # Health check
```

### 6.2 Electrostatic Solve Request

```json
{
  "mesh": {
    "source": "generate",
    "geometry": {
      "type": "rectangle",
      "width": 1.0,
      "height": 1.0,
      "nx": 20,
      "ny": 20,
      "element_type": "tri"
    }
  },
  "physics": "electrostatic",
  "regions": [
    {
      "name": "dielectric",
      "material": {
        "permittivity": 8.854e-12,
        "type": "isotropic"
      }
    }
  ],
  "boundary_conditions": [
    {"type": "dirichlet", "boundary": "bottom", "value": 0.0},
    {"type": "dirichlet", "boundary": "top", "value": 1.0}
  ],
  "solver": {
    "type": "direct",
    "method": "lu"
  },
  "requested_results": [
    "potential", "electric_field", "flux_density", "energy"
  ]
}
```

### 6.3 Response

```json
{
  "job_id": "fem-abc123",
  "status": "completed",
  "mesh_info": {
    "num_nodes": 441,
    "num_elements": 800,
    "element_type": "Tri3",
    "dimension": 2
  },
  "results": {
    "potential": {
      "type": "nodal",
      "values": [0.0, 0.05, ...],
      "node_ids": [1, 2, ...]
    },
    "electric_field": {
      "type": "elemental",
      "values": [[0.0, -1.0], ...],
      "components": ["Ex", "Ey"]
    },
    "energy": {
      "total": 4.427e-12,
      "density": { "type": "elemental", "values": [...] }
    }
  }
}
```

---

## 7. Testing Strategy

### 7.1 Test Pyramid

```
                    ┌───────────┐
                    │ E2E/Gold  │   Capacitor, Cube3d (matches openCFS)
                   ┌┴───────────┴┐
                   │ Integration  │  Full PDE solve with known solutions
                  ┌┴─────────────┴┐
                  │   Component    │  Assembler, PDE, Driver integration
                 ┌┴───────────────┴┐
                 │    Unit Tests    │  Elements, shapes, quadrature, operators
                └───────────────────┘
```

### 7.2 Test File Structure

```
tests/
├── unit/
│   └── fem/
│       ├── test_node.py
│       ├── test_element.py
│       ├── test_lagrange.py
│       ├── test_integration.py
│       ├── test_gradient_operator.py
│       ├── test_bdb_integrator.py
│       ├── test_assembler.py
│       ├── test_bc_handler.py
│       ├── test_h1_space.py
│       └── test_electrostatic_material.py
├── integration/
│   └── fem/
│       ├── test_capacitor_2d.py          # Parallel plate capacitor
│       ├── test_cube3d.py                # openCFS Cube3d equivalent
│       ├── test_convergence.py           # h-convergence study
│       ├── test_nonlinear_electrostatic.py
│       └── test_multi_region.py
└── gold_standard/
    └── fem/
        ├── test_parallel_plate_gold.py   # Analytical: C = εA/d
        └── test_l_shaped_domain_gold.py  # Singular solution convergence
```

### 7.3 Verification Approach

For every physics module, we follow the **Method of Manufactured Solutions (MMS)** pattern:
1. Choose a known analytical solution $u_{exact}$
2. Compute the corresponding source term $f = \mathcal{L}(u_{exact})$
3. Solve with FEM, compare against $u_{exact}$
4. Verify expected convergence rate (p+1 for H1, p for L2)

Plus direct comparison against openCFS test suite reference results (e.g., `Cube3d.h5ref`).

---

## 8. Integration with Existing Platform

### 8.1 Project Data Model Extension

The existing `design_state` JSON blob in projects can be extended:

```json
{
  "simulation_method": "fem",  // or "peec"
  "fem_config": {
    "physics": "electrostatic",
    "mesh_source": "gmsh",
    "mesh_file_key": "s3://bucket/project-123/mesh.msh",
    "regions": [...],
    "boundary_conditions": [...],
    "solver_config": {...}
  }
}
```

### 8.2 Frontend Extensions (Parallel Development)

- **Geometry editor:** 2D/3D geometry definition (CAD-like)
- **Mesh viewer:** Display mesh in Three.js (colored by region)
- **Result viewer:** Scalar/vector field visualization on mesh
- **Convergence plots:** Error vs mesh size charts

### 8.3 AWS Deployment

- New Lambda: `antenna-simulator-fem-solver-staging`
- New Lambda: `antenna-simulator-fem-postprocessor-staging`
- Same pattern: `Dockerfile.lambda` + Mangum + Function URL
- S3 for mesh files and large result datasets

---

## 9. Risk Mitigation

| Risk | Mitigation |
|---|---|
| Performance (Python vs C++) | NumPy vectorization, sparse assembly, optional Numba JIT for element loops |
| Memory for large meshes | Sparse storage, streaming assembly, Lambda memory scaling (up to 10GB) |
| Complexity creep | Strict phase gates — each phase must pass all tests before next |
| openCFS license concerns | **Clean-room reimplementation** — inspired by architecture, not copied code |
| Frontend scope creep | FEM API first, frontend features added incrementally |

---

## 10. Dependencies & Technology Stack

### Python Packages

```
numpy>=1.24          # Array operations, linear algebra
scipy>=1.10          # Sparse matrices, solvers, quadrature
gmsh>=4.11           # Mesh generation and I/O
meshio>=5.3          # Multi-format mesh I/O
pydantic>=2.0        # Data validation (existing pattern)
fastapi>=0.100       # API framework (existing pattern)
uvicorn>=0.22        # ASGI server
mangum>=0.17         # Lambda adapter
pytest>=7.0          # Testing
vtk>=9.2             # VTK export (optional, for visualization)
```

### Optional Performance Extensions (later)

```
numba>=0.57          # JIT compilation for element loops
petsc4py>=3.19       # PETSc parallel solvers (for large problems)
slepc4py>=3.19       # SLEPc eigenvalue solvers
```

---

## 11. Getting Started Checklist

- [ ] Create `backend/fem/` package structure
- [ ] Add FEM dependencies to `requirements.txt`
- [ ] Write first test: `tests/unit/fem/test_node.py`
- [ ] Implement `Node` class — make test pass
- [ ] Write second test: `tests/unit/fem/test_element.py`
- [ ] Implement `Tri3` element — make test pass
- [ ] Continue TDD cycle through Phase 1a...
- [ ] First end-to-end solve at Week 5
- [ ] Deploy FEM service to AWS at Week 6
