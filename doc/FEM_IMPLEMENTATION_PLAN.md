# FEM Solver Implementation Plan — Revised

## OpenCFS Reimplementation as Cloud-Native Python Microservices

**Date**: 2026-04-09 (v2 — major frontend redesign)
**Branch**: `feature/fem-solver`
**Reference codebase**: OpenCFS (`C:\Users\knue\Documents\cfs-master`)
**Target**: Reimplement as Python/NumPy/SciPy microservices within AntennaEducator

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Design Principles](#3-design-principles)
4. [Frontend UX — Detailed Design](#4-frontend-ux--detailed-design)
5. [OpenCFS Analysis & Mapping](#5-opencfs-analysis--mapping)
6. [Phase 1 — Core FEM + Electrostatic (DETAILED)](#6-phase-1--core-fem--electrostatic)
7. [Phase 2 — Static Current Flow (DETAILED)](#7-phase-2--static-current-flow)
8. [Phase 3 — Magnetostatic](#8-phase-3--magnetostatic)
9. [Phase 4 — Eddy Current](#9-phase-4--eddy-current)
10. [Phase 5 — Structural Mechanics](#10-phase-5--structural-mechanics)
11. [Phase 6 — Acoustic Field](#11-phase-6--acoustic-field)
12. [Phase 7 — Coupled Fields](#12-phase-7--coupled-fields)
13. [Phase 8 — 3D Extension](#13-phase-8--3d-extension)
14. [Infrastructure & Deployment](#14-infrastructure--deployment)
15. [Cost & Scaling Strategy](#15-cost--scaling-strategy)
16. [File Inventory](#16-file-inventory)
17. [Verification & Validation](#17-verification--validation)
18. [Open Decisions](#18-open-decisions)

---

## Progress Tracker

> **Last updated**: 2026-04-09    **Branch**: `feature/fem-solver`

### Phase 1 — Core FEM + Electrostatic

| Step | Title | Status | Commit | Tests |
|------|-------|--------|--------|-------|
| **1.1** | FEM Common Models | **DONE** | Inc 1–4 | 110+ model tests |
| **1.2** | FEM Preprocessor Service | **DONE** | Inc 6, 9 | 9 service + 7 gmsh + 14 extractor + 11 discretization |
| **1.3** | FEM Solver Core | **DONE** | Inc 3–5 | 23 shape/quad/jac + 18 assembly + 9 boundary + 6 electrostatic |
| **1.4** | FEM Postprocessor Service | **DONE** | Inc 9 | 9 service + 10 module tests |
| **1.5** | Frontend: FEM Feature | **DONE** | Inc 7–8, 10 | 76 frontend tests (6 files) |
| **1.6** | Infrastructure | **DONE** | Inc 12 | docker-compose + nginx + .env |
| **1.7** | Electrostatic Validation | **DONE** | Inc 11 | 11 validation + 10 E2E pipeline |

**Totals**: 313 backend FEM tests, 76 frontend FEM tests — all passing.

### Commit History (feature/fem-solver)

| # | Hash | Description |
|---|------|-------------|
| 1 | — | FEM common models (mesh, materials, BCs, config, results, geometry) |
| 2 | — | Geometry primitives and translator |
| 3 | — | Shape functions (Tri3, Tri6, Quad4) + quadrature + Jacobian |
| 4 | — | Assembly + boundary conditions + linear solvers |
| 5 | — | Electrostatic PDE solver + parallel plate validation |
| 6 | — | Gmsh mesher + mesh extractor + discretization |
| 7 | — | Frontend types, Redux slices, API clients, routing |
| 8 | — | Frontend components (FEMDesignPage, GeometryCanvas, ModelTree, PropertiesPanel, RibbonMenu, DrawingToolbar) |
| 9 | `3e0f744` | FastAPI services (preprocessor/8004, solver/8005, postprocessor/8006) |
| 10 | `ed6b539` | Frontend physics/solver/results UI (color maps, solve thunks, dialogs, results canvas, line plots, export) |
| 11 | `f20b8f1` | E2E validation (coaxial, L-shape, mesh convergence, ε_r sweep, frontend E2E pipeline) |
| 12 | — | Infrastructure: docker-compose, nginx, requirements.txt |

---

## 1. Executive Summary

Reimplement the OpenCFS FEM framework as a UX-first, cloud-native Python microservice suite.
Three new backend services, a full CAD-like geometry editor with integrated meshing, a physics
setup workflow, solver with parameter sweeps, and rich postprocessing — all in the browser.

### Key Architectural Changes (v2)

| Area | v1 Plan | v2 Plan (This Document) |
|------|---------|------------------------|
| **Geometry** | Built-in meshers only (rect/circle/L-shape) | Full 2D CAD: draw points, lines, arcs, basic shapes, boolean operations (union/subtract/intersect) |
| **Geometry + Mesh tabs** | Separate tabs | **Combined Geometry & Mesh tab** — draw geometry, set discretization, mesh, import — all in one place |
| **Model tree** | Simple mesh/region list | **Full hierarchical tree**: Bodies → Surfaces → Edges, with physics assignments shown in Physics tab |
| **Physics tab** | Separate Materials and Boundary tabs | **Unified Physics tab**: PDE type, materials, BCs, excitations, all with variable support |
| **Solver tab** | Basic solve button | **Solver tab with parameter sweep**, integral quantity requests, derived field selection |
| **Results tab** | Combined with solver | **Separate Results tab**: field visualization, integral quantities, line plots, contour plots, point probes |
| **Variables** | Centralized only | **Inline + centralized**: type expressions in any numeric field + manage in variable panel |
| **Geometry kernel** | None (meshers only) | **Parametric operation history** + polygon-clipping library (upgrade path to OpenCascade.js for 3D) |
| **Meshing engine** | Custom Python meshers | **Gmsh Python API** on backend — full unstructured meshing, size fields, transfinite |
| **Discretization** | Global only | **Full control**: global + per-body + per-edge element sizing, growth rates, boundary layers |
| **Canvas** | Unspecified | **Three.js orthographic** — upgradeable to 3D in Phase 8 |
| **Interaction** | Dialog-based | **Modal toolbar tools** (Gmsh-style): Add Point, Add Line, Add Arc, Add Shape — click on canvas |
| **Snap system** | None | **Full snap**: grid, endpoint, midpoint, intersection |
| **Result invalidation** | Not described | **Same as PEEC**: free tab navigation, auto-invalidate results on geometry/physics changes |

Physics modules added incrementally:
```
Electrostatic → Current Flow → Magnetostatic → Eddy Current
    → Mechanics → Acoustics → Coupled Fields → 3D Extension
```

---

## 2. Architecture Overview

### 2.1 Service Map

| Service | Port (local) | Lambda name (staging) | Purpose |
|---|---|---|---|
| **fem-preprocessor** | 8004 | `antenna-simulator-fem-preprocessor-staging` | Geometry → Gmsh meshing, mesh import, validation |
| **fem-solver** | 8005 | `antenna-simulator-fem-solver-staging` | FEM assembly, solve, field recovery, integrals |
| **fem-postprocessor** | 8006 | `antenna-simulator-fem-postprocessor-staging` | Visualization data, exports, additional integrals |

Existing PEEC services unchanged. Projects service modified to add `project_type` field.

### 2.2 Data Flow

```
┌───────────────────────────────────────────────────────────────────────┐
│                          Frontend (React)                             │
│                                                                       │
│  FEMDesignPage                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  Geometry & Mesh tab  │  Physics tab  │  Solver tab │ Results  │  │
│  │  ┌──────────────┐     │               │             │  tab     │  │
│  │  │ 2D CAD Editor│     │  PDE type     │  Config     │  Contour │  │
│  │  │ point/line/  │     │  Materials    │  Sweep      │  Vector  │  │
│  │  │ arc/shape    │     │  BCs          │  Integrals  │  Line    │  │
│  │  │ booleans     │     │  Excitations  │  Fields     │  Table   │  │
│  │  │ ── mesh ──   │     │  Variables    │  Variables  │          │  │
│  │  │ discretize   │     │               │             │          │  │
│  │  │ generate     │     │               │             │          │  │
│  │  │ import       │     │               │             │          │  │
│  │  └──────┬───────┘     └───────┬───────┘ └─────┬─────┘          │  │
│  └─────────┼─────────────────────┼───────────────┼────────────────┘  │
│            │                     │               │                    │
│  ┌─────────┴─────────┐          │    ┌──────────┴──────────┐        │
│  │  Model Tree       │          │    │  Variable Panel     │        │
│  │  Bodies→Surf→Edge │          │    │  (centralized +     │        │
│  │                   │          │    │   inline in fields)  │        │
│  └───────────────────┘          │    └─────────────────────┘        │
└─────────────────────────────────┼────────────────────────────────────┘
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
     ┌────────────────┐  ┌────────────────┐  ┌────────────────┐
     │ FEM            │  │ FEM Solver     │  │ FEM            │
     │ Preprocessor   │  │   :8005        │  │ Postprocessor  │
     │   :8004        │  │                │  │   :8006        │
     │                │  │ assembly.py    │  │                │
     │ geometry→gmsh  │  │ boundary.py   │  │ visualization  │
     │ mesh import    │  │ solver.py     │  │ integrals      │
     │ validation     │  │ postprocess/  │  │ export         │
     └────────────────┘  └────────────────┘  └────────────────┘
```

### 2.3 Project Type

Users select project type at creation:
- **"PEEC Antenna"** → existing DesignPage
- **"FEM Simulation"** → new FEMDesignPage

Both share: DynamoDB storage, auth, variable editor, S3 for large results.

---

## 3. Design Principles

### 3.1 UX First (Primary Principle)

- **Seamless workflow**: Four tabs that flow naturally but are freely navigable
- **Draw, don't configure**: Geometry is drawn on canvas, not entered in forms (forms for precision only)
- **Instant feedback**: Mesh generates in seconds, solve results appear immediately
- **Result invalidation**: Change geometry or physics → results auto-marked stale (yellow warning banner, same as PEEC)
- **Sensible defaults**: 3-click solve: draw rectangle → default material → auto-BCs → solve
- **Low entry threshold**: Students should produce first result in < 2 minutes
- **Gmsh-style interaction**: Modal toolbar tools for drawing — familiar to anyone who's used CAD or Gmsh
- **Parameter study built-in**: Same capability as PEEC solver — sweep any variable, see results

### 3.2 Architecture

- **Parametric geometry**: Operation history (add rect, subtract circle, etc.) — enables undo/redo, expression-driven dimensions
- **Gmsh backend meshing**: Full Gmsh Python API via `pip install gmsh` — unstructured triangulation, size fields, transfinite
- **Polygon-clipping for booleans**: Lightweight 2D library for Phase 1; upgrade path to OpenCascade.js for 3D phases
- **Three.js orthographic**: Same renderer for 2D geometry editor AND later 3D extension
- **Variables everywhere**: Any numeric input can be a variable expression (`2*a+1`); evaluated via existing expression engine

### 3.3 Code Architecture

- **SOLID + TDD**: Tests first, single-responsibility PDE classes, open for extension
- **No double implementation**: Shared models in `backend/common/models/fem/`
- **Same deployment patterns**: Lambda (Mangum), Docker (uvicorn), same as PEEC services
- **Microservices**: Each FEM service independently deployable and scalable

---

## 4. Frontend UX — Detailed Design

This section defines the complete user experience — the most critical part of the plan.

### 4.1 Tab Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│  [ Geometry & Mesh ]  [ Physics ]  [ Solver ]  [ Results ]          │
│  ───────────────────  ──────────  ──────────  ──────────           │
│        active            ○            ○           ○ (disabled)      │
└─────────────────────────────────────────────────────────────────────┘
```

- **All tabs freely navigable** (no wizard lockout)
- **Results tab disabled** when no results exist (same as PEEC postprocessing tab)
- **Stale indicator**: If geometry or physics changes after a solve, a yellow banner appears:
  "Results are outdated. Re-solve to update." (same pattern as `resultsStale` in PEEC)
- **Variable panel** visible across all tabs (bottom of left panel, same as PEEC)

### 4.2 Geometry & Mesh Tab (Combined)

This is the primary workspace tab — where users spend most of their time.

#### 4.2.1 Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ TOOLBAR                                                              │
│ ┌────┬────┬────┬────┬────┐ ┌──────┬──────┬───────┐ ┌──────┬───────┐ │
│ │ Pt │Line│ Arc│Rect│Elli│ │Union │Subtr │Inters │ │ Mesh │Import │ │
│ └────┴────┴────┴────┴────┘ └──────┴──────┴───────┘ └──────┴───────┘ │
│  Drawing Tools               Body Operations         Meshing         │
├──────────┬───────────────────────────────────────────┬───────────────┤
│  MODEL   │              CANVAS (Three.js)            │  PROPERTIES   │
│  TREE    │                                           │               │
│          │    ← 2D orthographic view →               │  Selected:    │
│ ▾ Bodies │                                           │  Rectangle_1  │
│   ▾ Rect │    Grid + snap indicators                 │               │
│     ─ E1 │    Geometry wireframe                     │  Width: 2.0   │
│     ─ E2 │    Mesh overlay (when generated)          │  Height: 1.0  │
│     ─ E3 │    Selected entity highlight              │  Origin: 0,0  │
│     ─ E4 │                                           │               │
│   ▾ Circ │    ┌──────────────────────────┐           │ ─────────────│
│     ─ E5 │    │  Status bar:             │           │ Discretize:   │
│     ...  │    │  "22 nodes, 30 elems,    │           │               │
│          │    │   quality: 0.87"         │           │  Edge E1:     │
│ ─────── │    └──────────────────────────┘           │  nElem: 10    │
│ Variables│                                           │  grading: 1.0 │
│ ┌───────┐│                                           │               │
│ │ a = 1 ││                                           │  Edge E2:     │
│ │ b = 2 ││                                           │  nElem: 8     │
│ └───────┘│                                           │  grading: 1.2 │
└──────────┴───────────────────────────────────────────┴───────────────┘
```

#### 4.2.2 Drawing Tools (Modal Toolbar)

Each tool is a mode — click toolbar button to enter mode, click/drag on canvas to create.
**ESC** or right-click to exit current mode and return to **Select** mode.

| Tool | Icon | Interaction | Created Entity |
|------|------|-------------|----------------|
| **Select** (default) | Arrow | Click to select, drag to move, box-select | — |
| **Point** | Dot | Click on canvas → place point | `GeoPoint` |
| **Line** | Slash | Click start point, click end point | `GeoLine` (edge) |
| **Arc** | Curved line | Click start, click center-or-midpoint, click end | `GeoArc` (edge) |
| **Rectangle** | Square | Click corner, drag to opposite corner (or enter dimensions) | `GeoBody` (4 edges) |
| **Ellipse** | Oval | Click center, drag radii (or enter rx, ry) | `GeoBody` (arc edges) |
| **Circle** | Circle | Click center, drag radius | `GeoBody` (arc edges) |
| **Polygon** | Pentagon | Click points sequentially, double-click to close | `GeoBody` (line edges) |

**Precision entry**: While a tool is active, a floating input panel shows coordinates.
User can type exact values instead of clicking (e.g., `x: 0.5, y: 1.0`).
Variable expressions supported: `x: a/2, y: b*sin(pi/4)`.

#### 4.2.3 Body Operations

Boolean operations on 2D bodies (polygonal/curved regions):

| Operation | Icon | Behavior |
|-----------|------|----------|
| **Union** (Fuse) | ∪ | Select 2+ bodies → merge into one | 
| **Subtract** (Cut) | − | Select object body, then tool body → remove tool from object |
| **Intersect** | ∩ | Select 2 bodies → keep only overlap |
| **Fragment** | Grid | Select 2+ bodies → conformal split (both kept, shared boundaries) |

**Implementation (Phase 1)**: Use `polygon-clipping` npm library for 2D polygon booleans.
Arcs are discretized into polylines for boolean ops, then re-fitted as arcs where possible.

**Upgrade path (Phase 8 / 3D)**: Replace with OpenCascade.js (OCCT compiled to WASM) for full
B-Rep boolean operations, fillets, chamfers, and 3D support.

#### 4.2.4 Snap System

| Snap Type | Visual Indicator | Priority |
|-----------|-----------------|----------|
| **Grid** | Faint grid lines, snap dot | Lowest |
| **Endpoint** | Small square marker | High |
| **Midpoint** | Triangle marker | Medium |
| **Intersection** | X marker | High |
| **On-edge** | Circle marker on nearest edge point | Medium |
| **Perpendicular** | ⊥ symbol | Low |

Snap tolerance: configurable (default 10px screen space).
Grid spacing: configurable (default 0.1 units), shown as dots or lines.
**Ctrl** held = temporarily disable snap (free positioning).

#### 4.2.5 Geometry Data Model (Parametric Operation History)

The geometry is stored as a **list of operations** — enabling undo/redo and parametric editing:

```typescript
// frontend/src/types/femGeometry.ts

type GeoOperation =
  | { type: 'add_point'; id: string; x: string; y: string }  // string = expression
  | { type: 'add_line'; id: string; startPointId: string; endPointId: string }
  | { type: 'add_arc'; id: string; startPointId: string; centerPointId: string; endPointId: string }
  | { type: 'add_rectangle'; id: string; x: string; y: string; width: string; height: string }
  | { type: 'add_ellipse'; id: string; cx: string; cy: string; rx: string; ry: string }
  | { type: 'add_circle'; id: string; cx: string; cy: string; radius: string }
  | { type: 'add_polygon'; id: string; pointIds: string[] }
  | { type: 'boolean_union'; id: string; bodyIds: string[] }
  | { type: 'boolean_subtract'; id: string; objectId: string; toolId: string }
  | { type: 'boolean_intersect'; id: string; bodyIds: string[] }
  | { type: 'boolean_fragment'; id: string; bodyIds: string[] }
  | { type: 'delete'; targetId: string }
  | { type: 'transform_translate'; targetId: string; dx: string; dy: string }
  | { type: 'transform_rotate'; targetId: string; cx: string; cy: string; angle: string }
  | { type: 'transform_mirror'; targetId: string; axisPointId: string; axisAngle: string }
  | { type: 'transform_copy'; sourceId: string; newId: string; dx: string; dy: string };

// Evaluated geometry state (after replaying operations with current variable values)
interface EvaluatedGeometry {
  points: Map<string, { x: number; y: number }>;
  edges: Map<string, GeoEdge>;            // lines and arcs
  bodies: Map<string, GeoBody>;           // closed regions
  boundaryGroups: Map<string, string[]>;  // group name → edge IDs
}

interface GeoEdge {
  id: string;
  type: 'line' | 'arc';
  pointIds: string[];         // 2 for line, 3 for arc (start, center, end)
  parentBodyId: string | null;
  name: string;               // user-editable label
}

interface GeoBody {
  id: string;
  edgeIds: string[];          // ordered boundary edges (CCW)
  name: string;               // user-editable label (e.g., "dielectric", "air")
  innerLoops: string[][];     // holes (edge ID lists for inner boundaries)
}
```

All dimension values are **strings** (expressions). When variables change, the entire operation
history is replayed to produce the evaluated geometry. This is what makes the model **parametric**.

#### 4.2.6 Discretization Controls

Discretization settings live in the Geometry & Mesh tab, shown in the **Properties panel** when
an edge, body, or the mesh root node is selected in the tree.

**Global settings** (shown when "Mesh" node selected in tree):

| Setting | Default | Description |
|---------|---------|-------------|
| Element type | Tri3 | `Tri3`, `Tri6`, `Quad4` |
| Global element size | auto | Maximum element edge length |
| Min element size | auto | Minimum element edge length |
| Growth rate | 1.2 | Max ratio between adjacent element sizes |
| Mesh algorithm | Frontal-Delaunay | Gmsh 2D algorithm |
| Optimize mesh | true | Gmsh Laplacian smoothing |
| Polynomial order | 1 | 1 = linear, 2 = quadratic (generates Tri6/Quad8) |
| Recombine to quads | false | Post-meshing recombination to quadrilaterals |

**Per-body settings** (shown when a body is selected):

| Setting | Default | Description |
|---------|---------|-------------|
| Element size override | (global) | Override element size for this body |
| Transfinite | false | Use structured mesh for this body |

**Per-edge settings** (shown when an edge is selected):

| Setting | Default | Description |
|---------|---------|-------------|
| Number of elements | (auto) | Fixed element count on this edge |
| Grading ratio | 1.0 | Geometric progression (1.0 = uniform) |
| Grading direction | forward | Which end is finer |
| Boundary layer | false | Generate structured layers from this edge |
| BL thickness | — | First layer thickness |
| BL layers | — | Number of boundary layer rows |
| BL growth rate | — | Layer thickness growth factor |

**Refinement boxes/fields** (future enhancement):
- Distance-based: refine near a point or edge
- Box-based: refine inside a rectangular region
- Math expression: arbitrary sizing function `f(x,y)`

#### 4.2.7 Meshing Workflow

1. User creates geometry (draw shapes, boolean ops, set names)
2. User selects discretization settings (or accepts defaults)
3. User clicks **"Generate Mesh"** button in toolbar
4. Frontend sends geometry + discretization settings to `fem-preprocessor` API
5. Backend translates to Gmsh API calls → generates mesh → returns `FEMMesh` JSON
6. Frontend renders mesh overlay on canvas (wireframe + optional element fill)
7. **Mesh statistics** shown in status bar: nodes, elements, min/max quality
8. User can **refine** (regenerate with different settings) or proceed to Physics tab

**Mesh import** (alternative path):
1. User clicks **"Import Mesh"** button in toolbar → file dialog
2. Accepts `.msh` (Gmsh v2) or `.vtu` (VTK) files
3. Frontend uploads file to `fem-preprocessor` → returns parsed `FEMMesh`
4. Imported mesh displayed on canvas; regions/boundaries auto-detected from physical groups
5. No geometry editing available for imported meshes (mesh-only workflow)

#### 4.2.8 Canvas Interaction Details

**View controls** (Three.js OrthographicCamera):
- **Pan**: Middle mouse drag or Shift+Left drag
- **Zoom**: Scroll wheel (centered on cursor)
- **Fit all**: Double-click middle mouse or "Fit" button
- **Reset view**: Home key

**Selection**:
- **Click**: Select nearest entity (point/edge/body) — highlighted in blue
- **Shift+Click**: Add to selection
- **Box select**: Click+drag in Select mode → select all entities in box
- **Selection feedback**: Selected entity's properties shown in right panel

**Entity highlighting**:
- **Hover**: Light highlight (pale blue outline)
- **Selected**: Strong highlight (blue fill/outline)
- **Body fill**: Semi-transparent fill showing body regions
- **Mesh overlay**: Gray wireframe when mesh is generated

### 4.3 Model Tree (Left Panel)

The model tree shows the complete geometric hierarchy. It appears across all tabs
but highlights different information per tab context.

#### 4.3.1 Tree Structure

```
▾ 📐 Geometry
  ▾ 🔷 Body: Dielectric
    ─ ── Edge: E1 (bottom)          ← click to select on canvas
    ─ ── Edge: E2 (right)
    ─ ── Edge: E3 (top)
    ─ ── Edge: E4 (left)
  ▾ 🔷 Body: Air
    ─ ── Edge: E5 (outer_bottom)
    ─ ── Edge: E6 (outer_right)
    ─ ── Edge: E7 (outer_top)
    ─ ── Edge: E8 (outer_left)
  ▸ 📍 Points (12)
▾ 🔺 Mesh                           ← only visible after mesh generation
  ─ Nodes: 847
  ─ Elements: 1,560  (Tri3)
  ─ Quality: 0.92 (min 0.45)
──────────────────────
▾ 📊 Variables
  ┌─────────────────────┐
  │ a    = 1.0           │
  │ b    = 0.5           │
  │ eps_r = 11.7         │
  └─────────────────────┘
```

#### 4.3.2 Tree in Physics Tab Context

When Physics tab is active, the tree shows physics assignments as inline annotations:

```
▾ 📐 Geometry
  ▾ 🔷 Body: Dielectric      [ε_r = 11.7]
    ─ ── Edge: E1 (bottom)    [φ = 0 V]
    ─ ── Edge: E2 (right)     [∂φ/∂n = 0]
    ─ ── Edge: E3 (top)       [φ = 100 V]
    ─ ── Edge: E4 (left)      [∂φ/∂n = 0]
  ▾ 🔷 Body: Air             [ε_r = 1.0]
    ...
```

Clicking a body or edge in the tree while in Physics tab opens the material/BC editor
in the Properties panel.

#### 4.3.3 Tree Interactions

- **Click**: Select entity → highlight on canvas + show properties
- **Double-click**: Rename entity (inline editing)
- **Right-click**: Context menu (rename, delete, duplicate, assign material, assign BC)
- **Drag**: Reorder (bodies only, for rendering z-order)
- **Visibility toggle**: Eye icon per body — hide/show on canvas

### 4.4 Physics Tab

The Physics tab is where users define the physical problem: PDE type, materials, BCs, excitations.

#### 4.4.1 Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ TOOLBAR                                                              │
│ PDE: [Electrostatic ▼]    [+ Material]  [+ Boundary Cond]  [+ Src] │
├──────────┬───────────────────────────────────────────────────────────┤
│  MODEL   │              CANVAS (same as Geometry tab)                │
│  TREE    │                                                           │
│  (with   │    Bodies colored by material assignment                  │
│  physics │    Edges colored by BC type:                              │
│  annot.) │      Blue = Dirichlet                                    │
│          │      Green = Neumann                                      │
│          │      Orange = Robin                                       │
│          │      Gray = unassigned (natural BC)                       │
│          │                                                           │
│          │    Click body → assign material in Properties             │
│          │    Click edge → assign BC in Properties                   │
├──────────┤                                                           │
│ Variables│                                                           │
│ ┌───────┐│                                                           │
│ │ ...   ││                                                           │
│ └───────┘│                                                           │
└──────────┴───────────────────────────────────────────────────────────┘
```

#### 4.4.2 PDE Type Selector

Dropdown in toolbar — determines which fields are available:

| PDE Type | Material Property | Primary Unknown | Available BCs |
|----------|------------------|-----------------|---------------|
| Electrostatic | Rel. permittivity ε_r | Potential φ | Dirichlet (φ), Neumann (D·n), Robin |
| Current Flow | Conductivity σ | Potential φ | Dirichlet (φ), Neumann (J·n), Robin |
| Magnetostatic | Rel. permeability μ_r | Vector potential A_z | Dirichlet (A), Neumann (H×n) |
| Eddy Current | σ, μ_r | A_z (complex) | Same + impedance BC |
| Mechanics | E, ν, ρ | Displacement u | Dirichlet (u), Neumann (traction), Spring |
| Acoustics | c, ρ | Pressure p (complex) | Dirichlet (p), Neumann (v·n), Impedance |

Changing PDE type clears material and BC assignments (with confirmation dialog).

#### 4.4.3 Material Assignment

- Click body in tree or canvas → Properties panel shows material editor
- **Material library**: Dropdown with common materials (Air, Vacuum, Silicon, Copper, FR-4, ...)
- **Custom material**: Enter property value directly (supports variable expressions)
- **Multiple bodies**: Multi-select bodies → assign same material
- Material values can use variables: `eps_r = a * 11.7` — updates when `a` changes

#### 4.4.4 Boundary Condition Assignment

- Click edge in tree or canvas → Properties panel shows BC editor
- **BC type dropdown**: Dirichlet | Neumann | Robin
- **Value field**: Supports variable expressions (`phi_0 = V_app * sin(pi/4)`)
- **Multi-select edges**: Assign same BC to multiple edges at once
- **Unassigned edges**: Natural (homogeneous Neumann) by default — shown in gray
- **Visual feedback on canvas**: Edges colored by BC type (see 4.4.1)

#### 4.4.5 Excitation/Source Assignment

- Click body → "Add Source" in context menu or toolbar button
- Volume source type depends on PDE:
  - Electrostatic: charge density ρ_v (C/m³)
  - Current Flow: current source density (A/m²)
  - Mechanics: body force (N/m³)
- Value supports variable expressions

### 4.5 Solver Tab

Configure and run the FEM solve, including parameter sweeps and output requests.

#### 4.5.1 Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ TOOLBAR                                                              │
│ [▶ Solve]  [⟳ Re-solve]  [📊 Parameter Study]   Solver: [Direct ▼] │
├──────────┬───────────────────────────────────────────────────────────┤
│  SOLVER  │              CANVAS (mesh + results preview)              │
│  CONFIG  │                                                           │
│          │    After solve: quick preview of primary field            │
│ Solver   │    (potential contour for electrostatic)                  │
│  type:   │                                                           │
│  Direct  │    During solve: progress indicator                      │
│  tol:    │    "Assembling... 45%"                                   │
│  1e-10   │    "Solving... (1,200 DOFs)"                             │
│          │    "Postprocessing..."                                    │
│ ──────── │                                                           │
│ Output   │                                                           │
│ Requests │                                                           │
│          │                                                           │
│ ☑ E-field│                                                           │
│ ☑ D-field│                                                           │
│ ☑ Energy │                                                           │
│ ☑ Charge │                                                           │
│ ☐ Capac. │                                                           │
│          │                                                           │
│ ──────── │                                                           │
│ Parameter│                                                           │
│ Study    │   ┌──────────────────────────────────────┐               │
│ ▸ Config │   │  Parameter study results plot        │               │
│          │   │  (appears after sweep completes)      │               │
├──────────┤   └──────────────────────────────────────┘               │
│ Variables│                                                           │
└──────────┴───────────────────────────────────────────────────────────┘
```

#### 4.5.2 Solver Configuration

| Setting | Default | Options |
|---------|---------|---------|
| Solver type | Direct | Direct (spsolve), CG, GMRES |
| Tolerance | 1e-10 | For iterative solvers |
| Max iterations | 1000 | For iterative solvers |
| Polynomial order | (from mesh) | 1 or 2 (overrides mesh setting if different) |

#### 4.5.3 Output Requests

**Integral quantities** — checkboxes for what to compute:

| Quantity | PDE Types | Formula |
|----------|----------|---------|
| Electric energy | Electrostatic | W = ½ ∫ ε|E|² dΩ |
| Total charge | Electrostatic | Q = ∮ D·n dΓ (per boundary) |
| Capacitance | Electrostatic | C = Q / ΔV |
| Power dissipation | Current Flow | P = ∫ σ|∇φ|² dΩ |
| Total current | Current Flow | I = ∫ J·n dΓ (per boundary) |
| Resistance | Current Flow | R = V / I |
| Magnetic energy | Magnetostatic | W = ½ ∫ ν|B|² dΩ |
| Inductance | Magnetostatic | L = 2W / I² |
| von Mises max | Mechanics | max(σ_vM) |
| Compliance | Mechanics | C = ∫ f·u dΩ |

**Derived fields** — checkboxes for what fields to compute:

| Field | PDE Type | Formula |
|-------|----------|---------|
| E-field | Electrostatic / Current | E = −∇φ |
| D-field | Electrostatic | D = εE |
| J-field | Current Flow | J = σE |
| Energy density | Electrostatic | u = ½ε|E|² |
| B-field | Magnetostatic | B = ∇×A |
| H-field | Magnetostatic | H = νB |
| Stress tensor | Mechanics | σ = C:ε |
| von Mises stress | Mechanics | σ_vM = √(3/2 s:s) |

#### 4.5.4 Parameter Study

Reuses the existing parameter study infrastructure from PEEC:

- **"Parameter Study" button** → opens `FEMParameterStudyDialog`
- **1-2 sweep variables**: Select from defined variables, set min/max/steps/spacing
- **Sweep engine**: Same pattern as PEEC `runParameterStudy` thunk:
  1. Build cartesian grid of variable values
  2. For each grid point: override variables → re-evaluate geometry → remesh if geometry changed → solve
  3. Collect integral quantities per point
- **Key optimization**: If only a material/BC variable changes (no geometry change) → skip remesh
- **Results**: Plot integral quantities vs. sweep variable (line chart, like PEEC parameter study)

### 4.6 Results Tab

Dedicated tab for viewing all solve results — both field visualizations and scalar quantities.

#### 4.6.1 Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ TOOLBAR                                                              │
│ Field: [Potential ▼]  Display: [Contour ▼]  [ColorMap ▼]  [Export]  │
├──────────┬───────────────────────────────────────────────────────────┤
│ RESULTS  │              CANVAS (field visualization)                 │
│ TREE     │                                                           │
│          │    ┌─────────────────────────────────────┐               │
│ ▾ Fields │    │                                     │               │
│   φ pot. │    │  Scalar contour / vector arrows     │               │
│   E-field│    │  on mesh geometry                   │               │
│   D-field│    │                                     │               │
│   u_dens │    │  Color bar on right edge            │               │
│          │    │                                     │               │
│ ▾ Integr.│    └─────────────────────────────────────┘               │
│   Energy │                                                           │
│   Charge │    ┌─────────────────────────────────────┐               │
│   Capac. │    │  Line plot / table panel (bottom)   │               │
│          │    │  (integral quantities, line plots)   │               │
│ ▾ Line   │    │                                     │               │
│   Plots  │    └─────────────────────────────────────┘               │
│   + Add  │                                                           │
├──────────┤                                                           │
│ Variables│                                                           │
└──────────┴───────────────────────────────────────────────────────────┘
```

#### 4.6.2 Field Visualization Options

**Scalar field display modes**:
- **Filled contour**: Vertex-colored mesh triangles with interpolated colors (default)
- **Contour lines**: Iso-lines at configurable intervals
- **Both**: Filled + contour lines overlay

**Vector field display modes**:
- **Arrows**: Scaled arrows at element centers (downsampled for readability)
- **Streamlines**: Tangent lines following field direction (future enhancement)

**Color maps**: Viridis (default), Jet, Coolwarm, Turbo, Grayscale — with user-defined range
**Mesh overlay**: Toggle wireframe visibility over field display

#### 4.6.3 Integral Quantities Panel

Table showing all computed integral quantities:

| Quantity | Value | Unit | Region |
|----------|-------|------|--------|
| Electric Energy | 4.425e-11 | J | entire domain |
| Total Charge (top) | 8.854e-10 | C | top boundary |
| Total Charge (bottom) | -8.854e-10 | C | bottom boundary |
| Capacitance | 8.854e-12 | F | — |

Integral quantities are also available as **parameter study Y-axis** in the Solver tab.

#### 4.6.4 Line Plots

- **Add line plot**: Click "+" → define start point and end point (or click on canvas)
- **Plotted fields**: Select which field to plot along the line (potential, E-magnitude, etc.)
- **Display**: Recharts line chart in bottom panel — x-axis = arc length, y-axis = field value
- **Multiple lines**: Stack/overlay multiple line plots

#### 4.6.5 Point Probes

- **Add probe**: Click on canvas → show field values at that point
- **Display**: Floating tooltip with interpolated field values
- **Table**: All probe values shown in a probe table in the bottom panel

#### 4.6.6 Export

- **VTK export**: Download `.vtu` file with all fields (for ParaView)
- **CSV export**: Download integral quantities as CSV
- **Image export**: Download current canvas view as PNG/SVG
- **Report**: Generate summary report (mesh info + settings + results table)

### 4.7 Variable Integration

#### 4.7.1 Centralized Variable Panel

Reuses existing `VariablePanel` component from PEEC. Visible at the bottom of the left panel
across all tabs. Users define variables here: name, expression, unit, description.

Variables auto-include built-in constants: `C_0`, `MU_0`, `EPSILON_0`, `Z_0`, `pi`.

#### 4.7.2 Inline Variable Expressions

Every numeric input field in the FEM UI supports variable expressions:

- **Geometry**: `width: 2*a`, `radius: R_outer - t_shell`
- **Discretization**: `nElem: n_base * 2`, `elemSize: lambda/10`
- **Materials**: `eps_r: eps_substrate`, `sigma: sigma_0 * (1 + alpha*T)`
- **BCs**: `phi: V_applied`, `flux: q_0 * sin(theta)`
- **Solver**: sweep variable min/max

**UX pattern**: Input field shows the expression as typed. A small "= value" chip shows the
evaluated numeric result next to the field. If evaluation fails (undefined variable, syntax error),
the chip shows "= ?" in red.

```
Width: [ 2*a        ]  = 2.0
Height: [ b + 0.5   ]  = 1.0  
ε_r:   [ eps_sub    ]  = 11.7
φ:     [ V_app      ]  = 100
```

#### 4.7.3 Variable Change → Result Invalidation

When a variable value changes:
1. Frontend replays geometry operation history → updates evaluated geometry
2. If geometry changed: mesh is invalidated (must re-mesh)
3. If physics values changed: results are invalidated (must re-solve)
4. Yellow banner: "Geometry has changed. Re-mesh and re-solve required."
   or: "Physics values changed. Re-solve required."

### 4.8 Result Invalidation Rules

Same pattern as PEEC (`designSlice.isSolved` + `solverSlice.resultsStale`):

| Change | Effect |
|--------|--------|
| Geometry operation (add/edit/delete shape) | Mesh invalid + results invalid |
| Discretization setting change | Mesh invalid + results invalid |
| Variable change affecting geometry | Mesh invalid + results invalid |
| Variable change affecting material/BC only | Results invalid (mesh still valid) |
| Material reassignment | Results invalid |
| BC change | Results invalid |
| PDE type change | All physics + results cleared |
| Solver config change | Results invalid |

---

## 5. OpenCFS Analysis & Mapping

### 5.1 OpenCFS Architecture (Reference)

```
BasePDE (abstract)
  └─ StdPDE (assembly coordination)
      └─ SinglePDE (single-field driver)
          ├─ ElecPDE          → Electrostatic     ∇·(ε∇φ) = −ρ
          ├─ ElecCurrentPDE   → Current flow       ∇·(σ∇φ) = 0
          ├─ MagneticPDE      → Magnetostatic      ∇×(ν∇×A) = J
          ├─ MechPDE          → Linear elasticity   ∇·σ(ε) = f
          ├─ AcousticPDE      → Helmholtz           ∇²p + k²p = 0
          └─ ...
```

Key patterns:
- Each PDE implements `DefineIntegrators()` → creates `BDBInt<>` bilinear forms
- Material tensors via `GetTensorCoefFnc(MaterialType::...)`
- FE space: `FeSpaceH1Nodal` for H¹-conforming scalar problems
- Quadrature: `IntScheme` with Gauss rules per element type

### 5.2 Python Reimplementation Mapping

| OpenCFS (C++) | Python Reimplementation | Notes |
|---|---|---|
| `BasePDE` / `SinglePDE` | `AbstractPDE` ABC | No `StdPDE` intermediate |
| `ElecPDE` | `ElectrostaticPDE(AbstractPDE)` | Same weak form |
| `ElecCurrentPDE` | `CurrentFlowPDE(AbstractPDE)` | σ instead of ε |
| `BDBInt<>` template | `assemble_stiffness()` function | Polymorphism via material tensor |
| `GradientOperator<FeH1>` | `shape_functions.py` gradient | Pre-computed at Gauss points |
| `FeSpaceH1Nodal` | Implicit—DOFs = node count | No separate FeSpace class initially |
| `IntScheme` | `quadrature.py` pre-tabulated | Dunavant for tri, tensor-product for quad |
| `Grid` / `GridCFS` | `FEMMesh` Pydantic model | JSON-serializable, validation built in |
| `BaseMaterial` | `Material` Pydantic model | Typed subclasses per physics |
| `ParamNode` (XML tree) | FastAPI request schemas | Pydantic validation replaces XML |
| `PostProc` | `postprocess/` module | Same integrals, per-element |
| `AlgebraicSys` (OLAS) | `scipy.sparse` | CSR matrices, direct/iterative |
| `SimInputGmsh` | Gmsh Python API (direct) | Backend uses `import gmsh` |
| `DirectCoupledPDE` | Phase 7: `CoupledPDE` | Block system assembly |

### 5.3 Physics Timeline

| Phase | Physics | Weak Form | DOFs/Node | Status |
|---|---|---|---|---|
| **1** | Electrostatic | ∫ ε∇φ·∇ψ dΩ = ∫ ρψ dΩ | 1 (φ) | **Detailed** |
| **2** | Current Flow | ∫ σ∇φ·∇ψ dΩ = 0 | 1 (φ) | **Detailed** |
| **3** | Magnetostatic | ∫ ν∇A·∇ψ dΩ = ∫ Jψ dΩ | 1 (A_z) | Rough |
| **4** | Eddy Current | (jωσ + ∇×ν∇×)A = J | 1 (complex) | Rough |
| **5** | Mechanics | ∫ σ:ε(v) dΩ = ∫ f·v dΩ | 2 (u_x, u_y) | Rough |
| **6** | Acoustics | ∫ ∇p·∇q dΩ − k² ∫ pq dΩ = 0 | 1 (p, complex) | Rough |
| **7** | Coupled | Block system | varies | Rough |
| **8** | 3D Extension | All extended to 3D | varies | Rough |

### 5.4 Explicitly Out of Scope

Topology/shape optimization, fluid flow (Navier-Stokes), Lattice Boltzmann, water waves,
Darwin approximation, nonlinear hysteresis (Phase 3+ optional), MPI parallelism,
multiharmonic analysis, p-FEM (arbitrary order).

---

## 6. Phase 1 — Core FEM + Electrostatic

**Goal**: Complete end-to-end workflow: draw 2D geometry → mesh → assign materials & BCs →
solve electrostatic → visualize potential, E-field, energy, capacitance.

### 6.1 Step 1.1 — FEM Common Models

**Location**: `backend/common/models/fem/`
**Dependencies**: None

Shared Pydantic v2 models used by all FEM services.

#### Mesh Models (`mesh.py`)

```python
class ElementType(str, Enum):
    TRI3 = "tri3"       # Linear triangle (3 nodes)
    TRI6 = "tri6"       # Quadratic triangle (6 nodes)
    QUAD4 = "quad4"     # Bilinear quadrilateral (4 nodes)

class FEMNode(BaseModel):
    id: int                      # 0-based node index
    coords: list[float]          # [x, y] for 2D

class FEMElement(BaseModel):
    id: int
    element_type: ElementType
    node_ids: list[int]
    region_id: int               # Which region this element belongs to

class Region(BaseModel):
    id: int
    name: str                    # e.g., "dielectric", "air"
    material_id: str | None = None

class BoundaryEdge(BaseModel):
    id: int
    node_ids: list[int]          # 2 nodes (linear) or 3 nodes (quadratic)
    region_name: str             # e.g., "top", "outer", "electrode"

class FEMMesh(BaseModel):
    dimension: int = 2
    nodes: list[FEMNode]
    elements: list[FEMElement]
    regions: list[Region]
    boundary_edges: list[BoundaryEdge]
    element_type: ElementType
    metadata: dict = {}
```

#### Material Models (`materials.py`)

```python
class MaterialProperty(BaseModel):
    name: str
    value: float | list[list[float]]  # Scalar or 2×2/3×3 tensor
    is_tensor: bool = False
    unit: str = ""

class Material(BaseModel):
    id: str
    name: str
    properties: dict[str, MaterialProperty]

class ElectrostaticMaterial(BaseModel):
    id: str
    name: str
    relative_permittivity: float | list[list[float]]

class ConductionMaterial(BaseModel):
    id: str
    name: str
    conductivity: float | list[list[float]]
```

#### Boundary Conditions (`boundary_conditions.py`)

```python
class BCType(str, Enum):
    DIRICHLET = "dirichlet"
    NEUMANN = "neumann"
    ROBIN = "robin"

class BoundaryCondition(BaseModel):
    bc_type: BCType
    boundary_name: str
    value: float | str          # Number or variable expression
    alpha: float | None = None  # Robin
    beta: float | None = None   # Robin

class Excitation(BaseModel):
    region_name: str
    excitation_type: str        # "charge_density", "current_density"
    value: float | str
```

#### Results (`results.py`)

```python
class ScalarFieldResult(BaseModel):
    field_name: str
    node_values: list[float]
    unit: str = ""
    min_value: float = 0.0
    max_value: float = 0.0

class VectorFieldResult(BaseModel):
    field_name: str
    element_values: list[list[float]]
    unit: str = ""
    max_magnitude: float = 0.0

class IntegralQuantity(BaseModel):
    name: str
    value: float
    unit: str
    region: str | None = None

class FEMSolverResult(BaseModel):
    scalar_fields: dict[str, ScalarFieldResult]
    vector_fields: dict[str, VectorFieldResult]
    integrals: list[IntegralQuantity]
    n_dofs: int
    n_elements: int
    solve_time: float
    solver_info: dict = {}
```

#### Config (`config.py`)

```python
class PDEType(str, Enum):
    ELECTROSTATIC = "electrostatic"
    CURRENT_FLOW = "current_flow"
    MAGNETOSTATIC = "magnetostatic"
    EDDY_CURRENT = "eddy_current"
    MECHANICS = "mechanics"
    ACOUSTIC = "acoustic"

class AnalysisType(str, Enum):
    STATIC = "static"
    HARMONIC = "harmonic"
    TRANSIENT = "transient"
    EIGENFREQUENCY = "eigenfrequency"

class LinearSolverType(str, Enum):
    DIRECT = "direct"
    CG = "cg"
    GMRES = "gmres"

class FEMSolverConfig(BaseModel):
    pde_type: PDEType
    analysis_type: AnalysisType = AnalysisType.STATIC
    polynomial_order: int = 1
    gauss_order: int | None = None
    solver_type: LinearSolverType = LinearSolverType.DIRECT
    tolerance: float = 1e-10
    max_iterations: int = 1000
    frequency: float | None = None
    compute_gradient: bool = True
    compute_flux: bool = True
    compute_energy: bool = True
```

#### Geometry Models (`geometry.py`) — NEW for v2

```python
class GeoPointDef(BaseModel):
    """A geometric point with expression coordinates."""
    id: str
    x: str          # Expression string
    y: str          # Expression string

class GeoEdgeDef(BaseModel):
    """A geometric edge (line or arc)."""
    id: str
    edge_type: Literal["line", "arc"]
    point_ids: list[str]   # 2 for line, 3 for arc (start, center, end)

class GeoBodyDef(BaseModel):
    """A closed 2D body (surface region)."""
    id: str
    name: str
    edge_ids: list[str]           # Ordered boundary edges (CCW)
    inner_loops: list[list[str]]  # Holes (inner edge ID loops)

class GeoOperation(BaseModel):
    """A single parametric geometry operation."""
    type: str               # "add_point", "add_line", "add_rectangle", "boolean_subtract", ...
    params: dict            # Operation-specific parameters

class FEMGeometry(BaseModel):
    """Complete parametric geometry definition."""
    operations: list[GeoOperation]
    # Evaluated state (computed by replaying operations with variable context):
    points: list[GeoPointDef] | None = None
    edges: list[GeoEdgeDef] | None = None
    bodies: list[GeoBodyDef] | None = None

class DiscretizationSettings(BaseModel):
    """Mesh discretization configuration."""
    element_type: ElementType = ElementType.TRI3
    global_element_size: float | str = "auto"
    min_element_size: float | str = "auto"
    growth_rate: float = 1.2
    algorithm: str = "frontal_delaunay"
    optimize: bool = True
    polynomial_order: int = 1
    recombine_to_quads: bool = False
    # Per-body overrides:
    body_sizes: dict[str, float | str] = {}
    # Per-edge overrides:
    edge_divisions: dict[str, int] = {}
    edge_gradings: dict[str, float] = {}
    edge_grading_directions: dict[str, str] = {}
    # Boundary layers:
    boundary_layers: dict[str, BoundaryLayerSpec] = {}

class BoundaryLayerSpec(BaseModel):
    edge_id: str
    first_layer_thickness: float | str
    num_layers: int
    growth_rate: float = 1.5
```

**Tests**: Unit tests for all models — serialization round-trips, validation edge cases.

---

### 6.2 Step 1.2 — FEM Preprocessor Service (Geometry + Meshing)

**Location**: `backend/fem_preprocessor/`
**Dependencies**: Step 1.1

This service receives geometry + discretization settings, uses the **Gmsh Python API**
to generate the mesh, and returns a `FEMMesh`.

#### Service Structure

```
backend/fem_preprocessor/
├── __init__.py
├── main.py                  # FastAPI app
├── config.py                # FEM_PREPROCESSOR_ prefix, port 8004
├── schemas.py               # Request/response schemas
├── lambda_handler.py        # Mangum wrapper
├── Dockerfile.lambda
├── geometry/
│   ├── __init__.py
│   ├── translator.py        # FEMGeometry → Gmsh API calls
│   ├── booleans.py          # Boolean operation handling
│   └── evaluator.py         # Evaluate expression coordinates with variable context
├── mesher/
│   ├── __init__.py
│   ├── gmsh_mesher.py       # Gmsh Python API wrapper for mesh generation
│   ├── discretization.py    # Apply discretization settings to Gmsh model
│   └── extractor.py         # Extract FEMMesh from Gmsh model
├── importers/
│   ├── __init__.py
│   ├── gmsh_importer.py     # Parse .msh v2 files
│   └── vtk_importer.py      # Parse .vtu files
└── validators.py            # Mesh quality checks
```

#### API Endpoints

| Method | Path | Input | Output |
|--------|------|-------|--------|
| POST | `/api/fem/mesh/generate` | `MeshGenerateRequest` | `FEMMesh` |
| POST | `/api/fem/mesh/import` | Multipart file upload | `FEMMesh` |
| POST | `/api/fem/mesh/validate` | `FEMMesh` | `MeshValidationResult` |
| GET | `/health` | — | `{"status": "ok"}` |

```python
class MeshGenerateRequest(BaseModel):
    """Generate mesh from geometry + discretization settings."""
    geometry: FEMGeometry
    discretization: DiscretizationSettings
    variable_context: dict[str, float] | None = None
```

#### Geometry → Gmsh Translation (`geometry/translator.py`)

The translator replays the operation history using the Gmsh OCC (OpenCASCADE) kernel:

```python
class GmshGeometryTranslator:
    """Translate FEMGeometry operations to Gmsh OCC API calls."""

    def translate(self, geometry: FEMGeometry, variables: dict[str, float]) -> None:
        """Replay geometry operations using gmsh.model.occ.* API.

        Mapping:
          add_point       → gmsh.model.occ.addPoint(x, y, 0)
          add_line        → gmsh.model.occ.addLine(p1, p2)
          add_arc         → gmsh.model.occ.addCircleArc(start, center, end)
          add_rectangle   → gmsh.model.occ.addRectangle(x, y, 0, w, h)
          add_ellipse     → gmsh.model.occ.addEllipse(cx, cy, 0, rx, ry)
          add_circle      → gmsh.model.occ.addDisk(cx, cy, 0, r, r)
          add_polygon      → addLine per edge → addCurveLoop → addPlaneSurface
          boolean_union   → gmsh.model.occ.fuse(obj, tool)
          boolean_subtract → gmsh.model.occ.cut(obj, tool)
          boolean_intersect → gmsh.model.occ.intersect(obj, tool)
          boolean_fragment → gmsh.model.occ.fragment(obj, tool)
          transform_*     → gmsh.model.occ.translate/rotate/mirror/copy

        After all operations: gmsh.model.occ.synchronize()
        """
```

#### Discretization → Gmsh Settings (`mesher/discretization.py`)

```python
class GmshDiscretizationApplier:
    """Apply discretization settings to Gmsh model."""

    def apply(self, settings: DiscretizationSettings, body_map: dict, edge_map: dict):
        """
        1. Set global mesh size: gmsh.option.setNumber("Mesh.MeshSizeMax", ...)
        2. Set growth rate: gmsh.option.setNumber("Mesh.MeshSizeFromCurvature", ...)
        3. Set algorithm: gmsh.option.setNumber("Mesh.Algorithm", ...)
        4. Per-body sizes: gmsh.model.mesh.setSize() on body boundary points
        5. Per-edge divisions: gmsh.model.mesh.setTransfiniteCurve(tag, nElem, "Progression", ratio)
        6. Boundary layers: create Distance + Threshold fields
        7. Recombine: gmsh.model.mesh.setRecombine(2, surface_tag)
        """
```

#### Mesh Extraction (`mesher/extractor.py`)

```python
class GmshMeshExtractor:
    """Extract FEMMesh from Gmsh model after mesh generation."""

    def extract(self) -> FEMMesh:
        """
        1. gmsh.model.mesh.getNodes() → FEMNode list
        2. gmsh.model.mesh.getElements() → FEMElement list
        3. Physical groups → Region list
        4. Boundary elements (dim=1) → BoundaryEdge list
        5. Return FEMMesh with all data
        """
```

#### Mesh Import

**Gmsh importer**: Same as v1 plan — parse `.msh` v2 ASCII/binary.
**VTK importer**: Same as v1 plan — parse `.vtu` XML.
Both import paths return `FEMMesh`.

#### Gmsh Lambda Deployment

The `gmsh` Python package includes precompiled binaries. For Lambda:
- Include `gmsh` in the Docker image (already includes `.so` / `.dll`)
- Gmsh runs headless — no OpenGL/FLTK needed
- Typical mesh generation: < 1 second for < 10k elements
- Lambda memory: 512 MB sufficient for moderate meshes

#### Tests

```
tests/unit/fem/
├── test_geometry_translator.py   # Operation → Gmsh API calls
├── test_gmsh_mesher.py           # Rectangle, circle, L-shape via Gmsh
├── test_discretization.py        # Per-edge/body sizing
├── test_mesh_extractor.py        # Gmsh → FEMMesh extraction
├── test_gmsh_importer.py         # .msh v2 parsing
├── test_vtk_importer.py          # .vtu parsing
├── test_mesh_validator.py        # Quality checks
└── test_boolean_operations.py    # Union, subtract, intersect
```

Key test cases:
- Rectangle geometry → Gmsh generates mesh → correct node/element counts
- Boolean subtract (rectangle − circle) → mesh conforms to both boundaries
- Per-edge grading → verify non-uniform element sizes
- Imported .msh file → round-trip: export from Gmsh → import → verify identical
- Degenerate input rejected: zero-area body, self-intersecting polygon

---

### 6.3 Step 1.3 — FEM Solver Core

**Location**: `backend/fem_solver/`
**Dependencies**: Step 1.1

Same architecture as v1 plan — the solver core is unchanged.

#### Service Structure

```
backend/fem_solver/
├── __init__.py
├── main.py
├── config.py                    # FEM_SOLVER_ prefix, port 8005
├── schemas.py
├── lambda_handler.py
├── Dockerfile.lambda
├── core/
│   ├── __init__.py
│   ├── shape_functions.py       # Tri3, Tri6, Quad4 shape functions + gradients
│   ├── quadrature.py            # Dunavant (tri) + Gauss-Legendre (quad)
│   ├── jacobian.py              # Isoparametric mapping
│   ├── assembly.py              # Global K, f assembly (COO → CSR)
│   ├── boundary.py              # Dirichlet elimination, Neumann RHS, Robin
│   └── solver.py                # SolverBackend ABC: Direct, CG, GMRES
├── pde/
│   ├── __init__.py
│   ├── base.py                  # AbstractPDE interface
│   ├── electrostatic.py         # ∇·(ε∇φ) = −ρ_v
│   └── current_flow.py          # ∇·(σ∇φ) = 0  (Phase 2)
├── postprocess/
│   ├── __init__.py
│   ├── field_recovery.py        # E = −∇φ (element gradient)
│   ├── integrals.py             # Energy, charge, capacitance, power
│   └── derived_fields.py        # D = εE, J = σE, energy density
└── utils/
    └── sparse_utils.py          # COO/CSR helpers
```

#### API Endpoints

| Method | Path | Input | Output |
|--------|------|-------|--------|
| POST | `/api/fem/solve` | `FEMSolveRequest` | `FEMSolverResult` |
| POST | `/api/fem/solve/estimate` | `FEMSolveRequest` | `SolveEstimate` |
| GET | `/health` | — | `{"status": "ok"}` |

```python
class FEMSolveRequest(BaseModel):
    mesh: FEMMesh
    materials: dict[str, Material]           # region_name → Material
    boundary_conditions: list[BoundaryCondition]
    excitations: list[Excitation] = []
    config: FEMSolverConfig
    # Output control:
    requested_integrals: list[str] = []      # ["energy", "charge", "capacitance"]
    requested_fields: list[str] = []         # ["e_field", "d_field", "energy_density"]
    variable_context: dict[str, float] | None = None
```

#### Shape Functions (`core/shape_functions.py`)

Pure functions, fully vectorized with NumPy:

**Tri3** — reference domain {(0,0), (1,0), (0,1)}:
- N₁ = 1−ξ−η, N₂ = ξ, N₃ = η
- ∂N/∂ξ = [−1, 1, 0], ∂N/∂η = [−1, 0, 1]

**Tri6** — same domain, 6 nodes:
- N₁ = (1−ξ−η)(1−2ξ−2η), N₂ = ξ(2ξ−1), N₃ = η(2η−1)
- N₄ = 4ξ(1−ξ−η), N₅ = 4ξη, N₆ = 4η(1−ξ−η)

**Quad4** — reference domain {(−1,−1), (1,−1), (1,1), (−1,1)}:
- Nᵢ = ¼(1+ξᵢξ)(1+ηᵢη)

All return `(N: ndarray[n], dN_dxi: ndarray[n,2])`.

#### Gauss Quadrature (`core/quadrature.py`)

Pre-tabulated rules:

| Element | Order | Points | Exact degree |
|---------|-------|--------|--------------|
| Triangle | 1 | 1 | 1 (centroid) |
| Triangle | 2 | 3 | 2 |
| Triangle | 3 | 4 | 3 |
| Triangle | 5 | 7 | 5 |
| Quad | 2 | 2×2=4 | 3 |
| Quad | 3 | 3×3=9 | 5 |

#### Assembly (`core/assembly.py`)

Core FEM assembly — same BDBInt pattern from OpenCFS:

```python
def assemble_stiffness(mesh, material_map, gauss_order) -> csr_matrix:
    """K_ij = ∫ ∇Nᵢ · D · ∇Nⱼ dΩ
    
    1. Pre-compute shape function derivatives at Gauss points
    2. Per element: get nodes, material D tensor
    3. Per Gauss point: J, det_J, inv_J, dN_dx = inv_J^T @ dN_dξ
    4. K_e += w * dN_dx^T @ D @ dN_dx * det_J
    5. Scatter to COO → convert to CSR
    """

def assemble_load_vector(mesh, excitations, gauss_order) -> ndarray:
    """f_i = ∫ Nᵢ ρ_v dΩ"""

def assemble_mass(mesh, material_map, gauss_order) -> csr_matrix:
    """M_ij = ∫ c Nᵢ Nⱼ dΩ  (needed for Phase 4+ only)"""
```

#### Boundary Conditions (`core/boundary.py`)

- **Dirichlet**: Elimination method (zero rows/cols, K[i,i]=1, f[i]=φ₀, preserve symmetry)
- **Neumann**: ∫ N^T q_n dl added to RHS
- **Robin**: αφ + β∂φ/∂n = g → adds to K and f

#### Linear Solver (`core/solver.py`)

`SolverBackend` ABC with implementations:
- `DirectSolver`: `scipy.sparse.linalg.spsolve`
- `IterativeCGSolver`: `scipy.sparse.linalg.cg` (for SPD)
- `IterativeGMRESSolver`: `scipy.sparse.linalg.gmres` (for non-symmetric)

#### Electrostatic PDE (`pde/electrostatic.py`)

```python
class ElectrostaticPDE(AbstractPDE):
    """
    ∇·(ε∇φ) = −ρ_v    in Ω
    φ = φ₀             on Γ_D
    ε ∂φ/∂n = q_n      on Γ_N

    Pipeline:
    1. Build material map: region → ε₀·ε_r·I₂
    2. Assemble K = ∫ B^T ε B dΩ
    3. Assemble f = ∫ N^T ρ_v dΩ
    4. Apply Neumann BCs → f
    5. Apply Dirichlet BCs → K, f
    6. Solve K·u = f → potential φ
    7. Postprocess: E = −∇φ, D = εE, W = ½∫ε|E|²dΩ, Q = ∮D·ndΓ, C = Q/V
    """
```

#### Postprocessing (`postprocess/`)

- **field_recovery.py**: `compute_element_gradient(mesh, u)` → E-field per element
- **integrals.py**: Electric energy, surface charge, capacitance
- **derived_fields.py**: D = εE, energy density u = ½ε|E|²

#### Tests

```
tests/unit/fem/
├── test_shape_functions.py       # Partition of unity, Kronecker delta, derivative consistency
├── test_quadrature.py            # Polynomial exactness
├── test_jacobian.py              # Unit triangle, scaled, distorted
├── test_assembly.py              # Single element, 2×2 patch, symmetry, row sums
├── test_boundary.py              # Dirichlet elimination, Neumann RHS
├── test_solver.py                # Direct + CG on small SPD system
├── test_electrostatic_pde.py     # Full pipeline with simple geometry
├── test_field_recovery.py        # Gradient of linear field is constant
├── test_integrals.py             # Energy, charge analytical checks
└── test_electrostatic_validation.py  # Parallel plate + coaxial capacitor
```

**Validation test cases:**

1. **Parallel plate capacitor** (rectangle, uniform field):
   - φ=0 bottom, φ=100 top, Neumann sides
   - Analytical: φ(y) = 100y, E = (0,−100), C = ε₀A/d
   - Verify exact for Tri3 (linear elements solve linear problem exactly)

2. **Coaxial capacitor** (annular domain):
   - φ(R₁)=100, φ(R₂)=0
   - Analytical: φ(r) = 100 ln(R₂/r) / ln(R₂/R₁)
   - Verify O(h²) convergence for Tri3, O(h³) for Tri6

---

### 6.4 Step 1.4 — FEM Postprocessor Service

**Location**: `backend/fem_postprocessor/`
**Dependencies**: Step 1.1

#### Service Structure

```
backend/fem_postprocessor/
├── __init__.py
├── main.py
├── config.py                # FEM_POSTPROCESSOR_ prefix, port 8006
├── schemas.py
├── lambda_handler.py
├── Dockerfile.lambda
├── visualization.py         # Prepare field data for Three.js rendering
├── line_evaluation.py       # Interpolate field along line/path
├── integrals.py             # Additional integral evaluations
└── export.py                # VTK/CSV export
```

#### API Endpoints

| Method | Path | Input | Output |
|--------|------|-------|--------|
| POST | `/api/fem/postprocess/field` | `FieldRequest` | `FieldVisualizationData` |
| POST | `/api/fem/postprocess/line-plot` | `LinePlotRequest` | `LinePlotData` |
| POST | `/api/fem/postprocess/point-probe` | `PointProbeRequest` | `PointProbeResult` |
| POST | `/api/fem/postprocess/export/vtk` | `ExportRequest` | binary `.vtu` |
| POST | `/api/fem/postprocess/export/csv` | `ExportRequest` | CSV text |
| GET | `/health` | — | `{"status": "ok"}` |

#### Visualization Data

```python
class FieldVisualizationData(BaseModel):
    node_positions: list[list[float]]     # [[x,y], ...]
    element_connectivity: list[list[int]] # Triangulated for WebGL
    scalar_values: list[float] | None     # Per-node scalar field
    color_map_range: list[float] | None   # [min, max]
    arrow_positions: list[list[float]] | None
    arrow_directions: list[list[float]] | None
    arrow_magnitudes: list[float] | None
    contour_lines: list[ContourLine] | None  # Iso-lines (optional)

class ContourLine(BaseModel):
    value: float
    segments: list[list[list[float]]]  # [[[x1,y1],[x2,y2]], ...]

class LinePlotData(BaseModel):
    distances: list[float]
    values: list[float]
    x_coords: list[float]
    y_coords: list[float]

class PointProbeResult(BaseModel):
    x: float
    y: float
    fields: dict[str, float]  # field_name → interpolated value
```

---

### 6.5 Step 1.5 — Frontend: FEM Feature

**Dependencies**: Step 1.1 (types); parallel with Steps 1.2–1.4
**Effort**: Large — this is the most complex part of Phase 1

#### File Structure

```
frontend/src/
├── features/
│   └── fem/
│       ├── index.ts
│       ├── FEMDesignPage.tsx              # Main workspace layout
│       ├── FEMRibbonMenu.tsx              # Tab navigation + context tools
│       ├── tabs/
│       │   ├── GeometryMeshTab.tsx         # Combined geometry + mesh tab
│       │   ├── PhysicsTab.tsx              # PDE, materials, BCs, excitations
│       │   ├── SolverTab.tsx               # Config, run, parameter study
│       │   └── ResultsTab.tsx              # Field viz, integrals, line plots
│       ├── geometry/                       # Geometry editor components
│       │   ├── GeometryCanvas.tsx          # Three.js orthographic 2D canvas
│       │   ├── DrawingToolbar.tsx          # Modal drawing tools
│       │   ├── SnapEngine.ts              # Grid + endpoint + midpoint snapping
│       │   ├── GeometryRenderer.ts        # Render geometry wireframe/fills
│       │   ├── MeshRenderer.ts            # Render mesh wireframe/fills
│       │   ├── SelectionManager.ts        # Entity selection logic
│       │   ├── tools/
│       │   │   ├── SelectTool.ts          # Default select/move mode
│       │   │   ├── PointTool.ts           # Place point on canvas
│       │   │   ├── LineTool.ts            # Draw line between 2 points
│       │   │   ├── ArcTool.ts             # Draw arc (3 points)
│       │   │   ├── RectangleTool.ts       # Draw rectangle (corner+drag or dimensions)
│       │   │   ├── EllipseTool.ts         # Draw ellipse (center+radii)
│       │   │   ├── CircleTool.ts          # Draw circle (center+radius)
│       │   │   └── PolygonTool.ts         # Draw polygon (sequential clicks)
│       │   └── BooleanToolbar.tsx          # Union/subtract/intersect/fragment buttons
│       ├── components/
│       │   ├── ModelTree.tsx               # Hierarchical model tree (left panel)
│       │   ├── PropertiesPanel.tsx         # Right panel: entity/mesh/material/BC properties
│       │   ├── ContourOverlay.tsx          # Scalar field contour on Three.js canvas
│       │   ├── VectorOverlay.tsx           # Arrow vector field overlay
│       │   ├── LinePlotPanel.tsx           # 1D field plot (Recharts)
│       │   ├── IntegralTable.tsx           # Table of integral quantities
│       │   ├── MeshStatisticsBar.tsx       # Status bar with mesh stats
│       │   ├── MaterialDialog.tsx          # Material property editor dialog
│       │   ├── MaterialLibrary.tsx         # Built-in material selector
│       │   ├── BCEditor.tsx               # Boundary condition editor
│       │   ├── ExcitationEditor.tsx        # Volume source editor
│       │   ├── MeshImportDialog.tsx        # File upload for .msh/.vtu
│       │   ├── DiscretizationPanel.tsx     # Mesh settings (global/per-body/per-edge)
│       │   ├── ColorBar.tsx               # Color map legend
│       │   ├── PointProbePanel.tsx         # Point probe display
│       │   ├── FEMParameterStudyDialog.tsx # Parameter study configuration
│       │   └── CoordinateInput.tsx         # Floating precision entry (x, y fields)
│       └── hooks/
│           ├── useGeometryOperations.ts   # Geometry operation dispatch
│           ├── useDrawingTool.ts          # Active tool state management
│           ├── useSnapEngine.ts           # Snap computation
│           ├── useFEMMesh.ts              # Mesh state management
│           └── useFEMSolver.ts            # Solver dispatch helpers
├── store/
│   ├── femDesignSlice.ts                  # Geometry ops + mesh + materials + BCs
│   ├── femSolverSlice.ts                  # Solver config + results + parameter study
│   └── femPostprocessingSlice.ts          # View configs, selected field, color map
├── api/
│   ├── femPreprocessorApi.ts              # Mesh generation + import
│   ├── femSolverApi.ts                    # Solve
│   └── femPostprocessorApi.ts             # Visualization data + export
└── types/
    ├── femGeometry.ts                     # GeoOperation, EvaluatedGeometry, etc.
    ├── femMesh.ts                         # FEMMesh, FEMElement, etc. (mirrors backend)
    ├── femPhysics.ts                      # Materials, BCs, excitations
    ├── femSolver.ts                       # SolverConfig, SolverResult
    └── femResults.ts                      # Visualization data types
```

#### Redux State Design

**femDesignSlice** — the core FEM state:

```typescript
interface FEMDesignState {
  // Geometry (parametric)
  geometryOperations: GeoOperation[];
  evaluatedGeometry: EvaluatedGeometry | null;
  selectedEntityId: string | null;
  selectedEntityType: 'point' | 'edge' | 'body' | null;

  // Active drawing tool
  activeTool: ToolType;  // 'select' | 'point' | 'line' | 'arc' | 'rectangle' | ...
  toolState: ToolState;  // tool-specific transient state (e.g., "placing second point")

  // Discretization
  discretization: DiscretizationSettings;

  // Mesh (generated or imported)
  mesh: FEMMesh | null;
  meshStatus: 'none' | 'generating' | 'ready' | 'stale';
  meshStatistics: MeshStatistics | null;

  // Physics
  pdeType: PDEType;
  materialAssignments: Record<string, MaterialAssignment>; // bodyId → material
  bcAssignments: Record<string, BCAssignment>;             // edgeId → BC
  excitations: Excitation[];

  // Validity tracking
  isMeshed: boolean;
  isSolved: boolean;
  meshStale: boolean;    // geometry changed since last mesh
  resultsStale: boolean; // mesh/physics changed since last solve
}
```

**femSolverSlice**:

```typescript
interface FEMSolverState {
  config: FEMSolverConfig;
  requestedIntegrals: string[];
  requestedFields: string[];

  // Solve status
  solveStatus: 'idle' | 'solving' | 'done' | 'error';
  solveProgress: string;  // "Assembling...", "Solving (1,200 DOFs)..."
  result: FEMSolverResult | null;
  error: string | null;

  // Parameter study
  parameterStudyConfig: ParameterStudyConfig | null;
  parameterStudyResult: FEMParameterStudyResult | null;
  parameterStudyStatus: 'idle' | 'running' | 'done';
}
```

**femPostprocessingSlice**:

```typescript
interface FEMPostprocessingState {
  // Field display
  selectedField: string | null;      // "electric_potential", "e_field", etc.
  displayMode: 'contour' | 'contour_lines' | 'both';
  colorMap: string;                   // "viridis", "jet", "coolwarm"
  colorRange: [number, number] | 'auto';
  showMeshOverlay: boolean;
  showVectors: boolean;
  vectorScale: number;

  // Line plots
  linePlots: LinePlotConfig[];
  linePlotData: Record<string, LinePlotData>;

  // Point probes
  probes: PointProbe[];
  probeResults: Record<string, PointProbeResult>;
}
```

#### FEMDesignPage Layout

```typescript
// FEMDesignPage.tsx — main workspace
const FEMDesignPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'geometry' | 'physics' | 'solver' | 'results'>('geometry');
  const resultsAvailable = useAppSelector(selectResultsAvailable);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Tab bar */}
      <FEMTabBar activeTab={activeTab} onChange={setActiveTab} resultsDisabled={!resultsAvailable} />

      {/* Main content */}
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left panel: Model tree + variables */}
        <ModelTree activeTab={activeTab} />

        {/* Center: Canvas */}
        <GeometryCanvas activeTab={activeTab} />

        {/* Right panel: Properties */}
        <PropertiesPanel activeTab={activeTab} />
      </Box>

      {/* Bottom panel: Line plots / integral table (Results tab) */}
      {activeTab === 'results' && <BottomResultsPanel />}

      {/* Stale results banner */}
      <StaleResultsBanner />
    </Box>
  );
};
```

#### Geometry Canvas (Three.js Orthographic)

```typescript
// geometry/GeometryCanvas.tsx
// Uses Three.js with OrthographicCamera for 2D rendering
// Renders: grid, geometry wireframe, body fills, mesh wireframe, field contours, vectors

// Layers:
// 1. Grid (configurable spacing)
// 2. Geometry edges (lines, arcs)
// 3. Body fills (semi-transparent)
// 4. Mesh wireframe (when generated)
// 5. Field contour / vector overlay (Results tab)
// 6. Selection highlights
// 7. Snap indicators
// 8. Active tool preview (e.g., rubber-band line being drawn)

// Event handling:
// - Mouse events → routed to active tool
// - Tool decides snap behavior, entity creation, preview rendering
// - Tool emits GeoOperation → dispatched to femDesignSlice
```

#### Tests

```
frontend/src/features/fem/__tests__/
├── GeometryOperations.test.ts     # GeoOperation replay, evaluate geometry
├── SnapEngine.test.ts             # Grid/endpoint/midpoint snap calculations
├── femDesignSlice.test.ts         # Redux actions, invalidation logic
├── femSolverSlice.test.ts         # Solve thunks, status transitions
├── femPostprocessingSlice.test.ts # View config actions
├── ModelTree.test.tsx             # Tree render, selection
├── DrawingTools.test.ts           # Tool state machine transitions
```

---

### 6.6 Step 1.6 — Infrastructure

- **docker-compose.yml**: Add `fem-preprocessor`, `fem-solver`, `fem-postprocessor` services
  - `fem-preprocessor` needs `gmsh` package in container
- **nginx proxy**: Add `/api/fem/*` routes
- **Lambda**: `Dockerfile.lambda` for each FEM service
  - `fem-preprocessor` Dockerfile includes `pip install gmsh`
- **Terraform**: New Lambda functions, Function URLs, IAM roles
- **Frontend envs**: Add `VITE_FEM_PREPROCESSOR_URL`, `VITE_FEM_SOLVER_URL`, `VITE_FEM_POSTPROCESSOR_URL`
- **CI**: Add FEM tests to `buildspec-test.yml`

### 6.7 Step 1.7 — Electrostatic Validation

1. **Parallel plate capacitor**: Rectangle, V=0 bottom, V=100 top → linear potential, uniform E, C = ε₀A/d
2. **Coaxial capacitor**: Annular mesh → logarithmic potential, O(h²) for Tri3
3. **L-shaped domain**: Reentrant corner field singularity → verify qualitative field enhancement
4. **Mesh convergence**: 3 mesh densities → verify convergence order
5. **Frontend E2E**: Draw rectangle → mesh → assign ε → set BCs → solve → see contour + E vectors + energy table
6. **Parameter study**: Sweep ε_r from 1 to 100 → verify capacitance scales linearly

---

## 7. Phase 2 — Static Current Flow

*Same infrastructure, add new PDE + material type*

### 7.1 CurrentFlowPDE (`pde/current_flow.py`)

Same weak form as electrostatic with conductivity σ instead of ε:
- ∇·(σ∇φ) = 0
- Material: `ConductionMaterial(conductivity: float | tensor)`
- Additional postprocessing:
  - J = −σ∇φ (current density vector field)
  - P = ∫ σ|∇φ|² dΩ (power dissipation)
  - I = ∫ J·n dΓ (current through boundary)
  - R = V/I (resistance)

### 7.2 Frontend Updates

- Add `CURRENT_FLOW` to PDE type selector
- Material dialog: conductivity (S/m) input field with material library
- Results tab: J-field visualization, power density contour
- Integral table: current, power, resistance

### 7.3 Validation

- **Ohm's Law**: Rod → R = l/(σA), reference from OpenCFS
- **Current through bend**: L-shape → current density concentration at corner

---

## 8. Phase 3 — Magnetostatic (Rough)

- New PDE: 2D scalar potential A_z: ∇·(ν∇A_z) = J_source
  - Same assembly structure as electrostatic (Laplacian with ν = 1/μ)
- Material: permeability μ (linear first)
- Postprocessing: B = curl(A) = (∂A/∂y, −∂A/∂x), H = νB, magnetic energy, inductance, flux
- Frontend: Add `MAGNETOSTATIC` PDE type, permeability material, B/H field visualization
- **Decision**: Scalar A_z approach keeps same H¹ framework; edge elements (Nédélec) deferred to 3D

---

## 9. Phase 4 — Eddy Current (Rough)

- Complex-valued harmonic analysis: (jωσ + ∇·ν∇)A = J_ext
- Frequency domain solve — complex K, f, u
- Mass matrix needed: M = ∫ σ N^T N dΩ
- System: (K + jωM)u = f → complex `spsolve`
- Joule losses, skin effect, shielding effectiveness
- Frontend: frequency input, complex field visualization (magnitude + phase)

---

## 10. Phase 5 — Structural Mechanics (Rough)

- Vector PDE: 2 DOF/node (u_x, u_y)
- Constitutive: σ = C:ε, ε = ½(∇u + ∇u^T)
- C is 3×3 (plane stress) or 3×3 (plane strain) in Voigt notation
- Assembly: B matrix is 3×(2×n_nodes), D = C (constitutive tensor)
- Materials: Young's modulus E, Poisson ratio ν, density ρ
- BCs: displacement (Dirichlet), traction (Neumann), spring support
- Postprocessing: stress/strain tensors, von Mises stress, displacement
- Frontend: 2D deformed mesh overlay, stress contour, displacement arrows

---

## 11. Phase 6 — Acoustic Field (Rough)

- Helmholtz: ∇²p + k²p = 0, k = ω/c
- Frequency domain: K_acoustic − k²·M = f
- Complex-valued pressure field
- Materials: speed of sound c, density ρ
- Absorbing BCs (Robin/impedance), radiation conditions
- Postprocessing: SPL, particle velocity, acoustic intensity, directivity
- Frontend: pressure magnitude/phase contour, SPL color map

---

## 12. Phase 7 — Coupled Fields (Rough)

- **Piezoelectric**: Electrostatic + Mechanics (coupling via piezo tensor d)
- **Electro-mechanical**: Electrostatic force → displacement
- **Acoustic-structural**: Pressure → displacement → re-radiation
- Direct coupled systems (block matrix) or iterative coupling
- Reuse OpenCFS `DirectCoupledPDE`/`IterCoupledPDE` patterns
- Frontend: coupled PDE type selector, multi-field results

---

## 13. Phase 8 — 3D Extension (Rough)

- Extend all physics to 3D: Tet4, Tet10, Hex8
- 3D mesh generation via Gmsh (already supports 3D)
- **OpenCascade.js** for 3D geometry editor (replaces polygon-clipping)
- 3D shape functions and quadrature (tabulated for tet/hex)
- Three.js perspective camera mode (reuse geometry canvas infrastructure)
- Iso-surface, slice-plane, volume rendering for field visualization
- Fargate routing for large 3D problems (Lambda too small)

---

## 14. Infrastructure & Deployment

### 14.1 Local Development (Docker Compose)

```yaml
# New services added to docker-compose.yml
fem-preprocessor:
  build: { context: ., dockerfile: backend/fem_preprocessor/Dockerfile.lambda }
  ports: ["8004:8004"]
  environment: { USE_DYNAMODB: "true", ... }

fem-solver:
  build: { context: ., dockerfile: backend/fem_solver/Dockerfile.lambda }
  ports: ["8005:8005"]

fem-postprocessor:
  build: { context: ., dockerfile: backend/fem_postprocessor/Dockerfile.lambda }
  ports: ["8006:8006"]
```

### 14.2 AWS Lambda

- Same deployment pattern as PEEC services
- Container images via ECR
- `fem-preprocessor` image includes `gmsh` Python package (~80MB)
- Function URLs with CORS for frontend access
- Memory: 512 MB default (1024 MB for solver if needed)

### 14.3 Frontend Deployment

- Same S3 + CloudFront as existing frontend
- No additional infrastructure needed
- Environment variables for FEM service URLs in `.env.production`

---

## 15. Cost & Scaling Strategy

- **Pay-as-you-go**: Lambda billing per 100ms — zero idle cost
- **Typical solve**: < 10k DOFs → < 2 seconds → ~$0.001 per solve
- **Mesh generation**: Gmsh < 1 second for moderate meshes → ~$0.0005
- **S3**: Large field results stored with presigned URLs
- **Fargate** (Phase 8): For 3D problems > Lambda limits (> 10GB RAM, > 15min)

---

## 16. File Inventory

### New Files (Phase 1)

**Backend:**
- `backend/common/models/fem/` — `__init__.py`, `mesh.py`, `materials.py`, `boundary_conditions.py`, `results.py`, `config.py`, `geometry.py`
- `backend/fem_preprocessor/` — Full service (~15 files)
- `backend/fem_solver/` — Full service (~20 files)
- `backend/fem_postprocessor/` — Full service (~10 files)

**Frontend:**
- `frontend/src/features/fem/` — Full feature module (~45 files)
- `frontend/src/store/femDesignSlice.ts`, `femSolverSlice.ts`, `femPostprocessingSlice.ts`
- `frontend/src/api/femPreprocessorApi.ts`, `femSolverApi.ts`, `femPostprocessorApi.ts`
- `frontend/src/types/femGeometry.ts`, `femMesh.ts`, `femPhysics.ts`, `femSolver.ts`, `femResults.ts`

**Tests:**
- `tests/unit/fem/` — ~20 backend test files
- `frontend/src/features/fem/__tests__/` — ~10 frontend test files

### Modified Files

- `frontend/src/features/projects/NewProjectDialog.tsx` — Add project type selector
- `frontend/src/api/client.ts` — Add FEM API clients
- `frontend/src/App.tsx` or router — Add FEM routes
- `docker-compose.yml` — Add FEM services
- `frontend/.env.development` / `.env.production` — FEM service URLs
- `buildspec-test.yml` — Add FEM test commands

---

## 17. Verification & Validation

### Phase 1 Checklist

- [x] All backend unit tests pass: `pytest tests/unit/fem/ -x -q` — **313 passed**
- [x] Parallel plate capacitor: φ linear, E uniform, C = ε₀A/d (exact for linear elements)
- [x] Coaxial capacitor: O(h²) convergence for Tri3
- [x] Mesh convergence: log(error) vs log(h) shows correct slope
- [x] Frontend compiles: `npx tsc --noEmit`
- [x] Frontend tests: `npx vitest run src/features/fem/` — **76 passed (6 files)**
- [x] Linting clean: `black --check && isort --check-only && ruff check`
- [x] Docker-compose: FEM services added, health checks pass
- [x] E2E: geometry → mesh → materials → BCs → solve → visualize → export (Redux pipeline test)
- [x] Parameter study: sweep ε_r → capacitance varies linearly (test_electrostatic_validation.py)

### Phase 2 Checklist

- [ ] Ohm's Law: R = l/(σA) within 0.1%
- [ ] Power: P = V²/R within 0.1%
- [ ] J-field visualization correct
- [ ] Current integral through boundary = V/R

---

## 18. Open Decisions

| Decision | Options | When to Decide |
|----------|---------|----------------|
| Fargate threshold | Lambda limits vs. premium tier | Phase 8 (3D) |
| Edge elements (Nédélec) | Needed for 3D magnetostatic | Phase 3 or Phase 8 |
| Nonlinear solver (B-H curves) | Newton-Raphson on K(u) | Phase 3 optional |
| 3D geometry kernel | OpenCascade.js or custom | Phase 8 |
| WebSocket for progress | Polling vs. WS for long solves | Phase 4+ |
| Node numbering order | Cuthill-McKee reordering for sparse efficiency | Phase 4+ |
| Adaptive mesh refinement | Error estimator → auto-refine | Phase 3+ |
| Contour line algorithm | Marching squares variant | Phase 1 Results tab |
| SVG export | Canvas → SVG conversion for print quality | Phase 1 Results tab |
# FEM Solver Implementation Plan

## OpenCFS Reimplementation as Cloud-Native Python Microservices

**Date**: 2026-04-08
**Branch**: `feature/fem-solver`
**Reference codebase**: OpenCFS (`C:\Users\knue\Documents\cfs-master`) — C++/Fortran FEM framework
**Target**: Reimplement as Python/NumPy/SciPy microservices within the AntennaEducator platform
