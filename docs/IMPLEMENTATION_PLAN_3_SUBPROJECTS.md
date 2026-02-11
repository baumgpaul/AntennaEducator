# Implementation Plan — Three Parallel Subprojects

**Date**: 2026-02-11 (Updated: 2026-02-11)  
**Scope**: 1–2 month horizon (detailed), 3–6 month roadmap (high-level)  
**Decisions finalized**: All clarifying questions resolved.

---

## Table of Contents

1. [Design Decisions (Resolved)](#design-decisions-resolved)
2. [Subproject I — Markdown Editor per Project](#subproject-i--markdown-editor-per-project)
3. [Subproject II — Field Views & Visualization Fixes](#subproject-ii--field-views--visualization-fixes)
4. [Subproject III — FEM Solver Integration (OpenCFS)](#subproject-iii--fem-solver-integration-opencfs)
5. [Month 1–2 Sprint Plan](#month-12-sprint-plan)
6. [Data Model Evolution](#data-model-evolution)

---

## Design Decisions (Resolved)

| # | Question | Decision | Rationale |
|---|----------|----------|-----------|
| 1 | Image storage | **S3 with presigned URLs** | Base64 is simpler but a single screenshot easily exceeds 1MB. With multiple images the DynamoDB 400KB item limit would be hit almost instantly — the project already stores `design_state`, `simulation_config`, `simulation_results`, and `ui_state` in the same item. S3 keeps Markdown text small (<50KB) and images unlimited. |
| 2 | Editor library | **TipTap** (ProseMirror-based) | Best WYSIWYG edit mode experience with seamless toggle. Extensible plugin architecture for KaTeX math blocks and S3 image uploads. Serializes to Markdown via `tiptap-markdown`. More mature ecosystem than MDXEditor. Good MUI compatibility. |
| 3 | CFS build | **Use existing local build** | Pre-built CFS binary available — copy into Docker runtime image instead of building from source. Drastically reduces Docker image build time. |
| 4 | Mesh format | **Gmsh `.msh` only** initially | CFS natively supports `.msh`; `meshio` can extract regions. Other formats (STEP, IGES) added later. |
| 5 | Compute backend | **Lambda only** initially with size restrictions | Keep it simple. Enforce max element count (e.g., ~50K) on Lambda. Later extend via Step Functions + SQS queues → Fargate → Batch. |
| 6 | Physics roadmap | **Electrostatics → current flow → eddy currents → multi-physics** | Natural CFS progression matching PDE complexity and coupling capabilities. |
| 7 | Bug priority | **All field views first** (scalar, vector, all cases) | Field visualization is the core postprocessing capability. LineViewPanel charts are secondary — fix after all 3D field views work correctly. |
| 8 | Branding | **Keep "Antenna Educator"** | Rebrand later when FEM is mature enough to be a general simulation platform. |

---

## Subproject I — Markdown Editor per Project

### Current State Analysis

- Projects have 4 JSON blob fields: `design_state`, `simulation_config`, `simulation_results`, `ui_state`
- The `description` field exists but is plain text only
- DynamoDB single-table design with **400KB item limit** (already partially consumed by simulation blobs)
- Frontend has a `ProjectsPage` (list) and `DesignPage` (workspace) — no dedicated documentation panel

### Architecture Decision: S3 for Images, DynamoDB for Markdown

**Why not base64 in DynamoDB?**
A single pasted screenshot is typically 200KB–2MB as base64. With the project item already containing `design_state` (~5–20KB), `simulation_results` (~50–200KB), `ui_state` (~5–10KB), and `simulation_config` (~2–5KB), even one or two images would push past DynamoDB's 400KB item limit. S3 adds a small amount of complexity (presigned URLs, upload endpoint) but eliminates the size constraint entirely.

```
Project {
  ...existing fields...
  documentation: {
    content: string,          // Markdown/HTML text (typically 10-100KB)
    version: number,          // Schema version
    images: [                 // Image manifest for S3 cleanup
      { key: "img_abc123.png", s3_key: "projects/{pid}/images/img_abc123.png" }
    ],
    last_edited: ISO8601,
    last_edited_by: string
  }
}
```

### Implementation Plan

#### Phase 1: Backend (3–4 days)

**1.1 S3 Image Bucket** (Terraform)
```
Module: terraform/modules/s3-project-assets/
- Bucket: antenna-simulator-project-assets-{env}
- CORS: allow frontend origin
- Lifecycle: delete orphaned images after 30 days
- IAM: Projects Lambda gets s3:PutObject, s3:GetObject, s3:DeleteObject
```

**1.2 Projects Service Extension**
```python
# backend/projects/schemas.py — new fields
class ImageMetadata(BaseModel):
    key: str
    s3_key: str
    content_type: str = "image/png"
    size_bytes: int | None = None

class Documentation(BaseModel):
    content: str = ""
    version: int = 1
    images: list[ImageMetadata] = []
    last_edited: str | None = None
    last_edited_by: str | None = None

class ProjectCreate/ProjectUpdate:
    ...
    documentation: dict | None = None    # New field
```

**1.3 Image Upload Endpoint**
```python
# backend/projects/main.py — new endpoints
POST /api/projects/{project_id}/images
  - Accept: multipart/form-data
  - Upload image to S3, return presigned GET URL + key
  - Max 5MB per image, accept png/jpg/gif/svg/webp

DELETE /api/projects/{project_id}/images/{image_key}
  - Remove from S3

GET /api/projects/{project_id}/images/{image_key}
  - Return presigned URL (redirect or JSON)
```

**1.4 Repository Update**
```python
# backend/common/repositories/dynamodb_repository.py
# Add 'documentation' to the persist/retrieve cycle
# Same pattern as design_state, simulation_config, etc.
```

#### Phase 2: Frontend Editor (5–7 days)

**2.1 Install Dependencies**
```json
{
  "@tiptap/react": "^2.x",
  "@tiptap/starter-kit": "^2.x",
  "@tiptap/extension-image": "^2.x",
  "@tiptap/extension-mathematics": "^2.x",
  "tiptap-markdown": "^0.8.x",
  "katex": "^0.16.x"
}
```

**2.2 Documentation Panel Component**
```
frontend/src/features/design/DocumentationPanel.tsx
├── TipTap Editor instance with WYSIWYG mode
├── Toolbar: Bold, Italic, Headers, Lists, Links, Images, Math, Code, Tables
├── Image upload handler → POST /api/projects/{pid}/images → presigned URL
├── Math blocks: KaTeX rendering via @tiptap/extension-mathematics
│   - Inline: $E = mc^2$ via dollar-sign syntax
│   - Block: $$\nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0}$$ via fence
├── Auto-save (debounced 2s) → dispatch updateProject({ documentation })
├── Edit/View mode toggle (pencil icon)
└── Serialization: TipTap JSON ↔ Markdown via tiptap-markdown
```

**Why TipTap?**
- ProseMirror foundation = battle-tested rich text editing
- Clean edit mode with floating toolbar and slash commands
- `@tiptap/extension-mathematics` provides native KaTeX block/inline support
- `@tiptap/extension-image` handles paste, drag-drop, and upload with custom handlers
- Serializes to Markdown for storage (compact) and renders back to rich WYSIWYG
- Extensible for future needs (collaborative editing, comments, version diff)

**2.3 Integration into DesignPage**
- Add as a collapsible right-side panel (toggle via ribbon button or icon)
- Available across all 3 tabs (designer/solver/postprocessing) — persistent panel
- Resizable split pane (default 30% width when open, remembers user preference)
- Panel state saved in `ui_state` per project

**2.4 Project List Enhancement**
- Show documentation preview (first 100 chars) on project cards
- "Has documentation" badge/icon

#### Phase 3: Polish (2–3 days)

- Image paste from clipboard (Ctrl+V) → auto-upload to S3
- Drag-and-drop image upload
- Export documentation as standalone PDF/HTML
- Formula toolbar with common templates (Maxwell's equations, integral, matrix, Greek letters)

### Data Flow

```
User types in TipTap → editor state → debounce 2s → serialize to Markdown →
  Redux dispatch updateProject({ documentation: { content, images } }) →
  PUT /api/projects/{id} → DynamoDB update → 200 OK

User pastes image → Blob extracted → POST /api/projects/{id}/images →
  S3 upload → presigned GET URL returned → inserted as ![](presigned_url)
  → image key added to documentation.images manifest
```

---

## Subproject II — Field Views & Visualization Fixes

**Priority**: Make all 3D field views work correctly first — scalar fields, vector plots, all field cases, all components. LineViewPanel charts are secondary.

### Issues Identified (Ordered by Priority)

| Priority | Issue | File | Severity |
|----------|-------|------|----------|
| **P0** | **VectorRenderer creates new ArrowHelper per render** — GC pressure, potential crashes with many field points | `VectorRenderer.tsx:101` | **High (perf)** |
| **P0** | **VectorRenderer** — verify all field vector types work: E-field, H-field, Poynting, per-component views | `VectorRenderer.tsx` | **High (feature)** |
| **P0** | **FieldRenderer** — verify all field magnitude types: E-mag, H-mag, components (Ex, Ey, Ez, Hx, Hy, Hz), all region shapes (plane, circle, sphere, cube) | `FieldRenderer.tsx`, `FieldVisualization.tsx` | **High (feature)** |
| **P1** | **CurrentRenderer ignores frequency selection** — only uses `state.solver.results`, not frequency-indexed sweep data | `CurrentRenderer.tsx:46` | Medium |
| **P1** | **VoltageRenderer ignores frequency selection** — same issue | `VoltageRenderer.tsx:30` | Medium |
| **P1** | **AntennaRenderer doesn't filter by type** for `antenna-system` vs `single-antenna` | `AntennaRenderer.tsx:26` | Medium |
| **P2** | **Debug console.log in production** — ~30 log statements in CurrentRenderer alone, scattered across other renderers | Multiple files | Low |
| **P2** | **Camera projection switch is a no-op** — `setCameraProjection()` logs but doesn't swap | `Scene3D.tsx:161` | Low |
| **P3** | **LineViewPanel never renders plots** — `renderPlot()` returns "not yet implemented" despite coded components | `LineViewPanel.tsx:46` | Medium (deferred) |
| **P3** | **RibbonMenu plot buttons don't pre-select type** | `RibbonMenu.tsx:186` | Low (deferred) |

### Fix Plan

#### P0: VectorRenderer — Complete Overhaul (2–3 days)

**Current problem**: Creates `new ArrowHelper(...)` on every render as `<primitive object={...}>`. With 500+ field points this causes massive GC pressure and potential WebGL context issues.

**Fix approach**:
1. **Replace ArrowHelper with InstancedMesh** — use `THREE.InstancedMesh` with cone+cylinder merged geometry for arrows. Set per-instance transforms and colors via `setMatrixAt()` / `setColorAt()`. O(1) draw calls regardless of arrow count.
2. **Memoize field data processing** — `useMemo` on arrow positions, directions, magnitudes to avoid recomputation on unrelated re-renders.
3. **Verify all vector field types work end-to-end**:
   - `field-vector` (E-field vector, H-field vector, Poynting vector)
   - `field-vector-component` (single component: Ex, Ey, Ez, Hx, Hy, Hz)
   - Verify that complex field data is handled correctly (real part for direction)
   - Verify color mapping by magnitude works for all types
   - Test with 2D plane, 3D cube, circle, sphere field regions

```tsx
// Optimized VectorRenderer concept
const VectorRenderer = ({ item, viewConfig }) => {
  const fieldData = useFieldData(item.fieldId, viewConfig.selectedFrequencyHz);

  // Single instanced mesh for all arrows
  const { meshRef, count } = useMemo(() => {
    if (!fieldData) return { meshRef: null, count: 0 };
    const positions = fieldData.points;
    const vectors = getVectorComponent(fieldData, item.type, item.component);
    // Build instance matrices: position + rotation from vector direction + scale from magnitude
    return buildArrowInstances(positions, vectors, item.arrowSize);
  }, [fieldData, item.type, item.component, item.arrowSize]);

  return (
    <instancedMesh ref={meshRef} args={[arrowGeometry, arrowMaterial, count]}>
      {/* Per-instance color via vertex attribute */}
    </instancedMesh>
  );
};
```

#### P0: FieldRenderer — Verify All Cases (2 days)

Systematically test and fix:

| Field Type | Item Type | Data Source | Geometry | Status |
|-----------|-----------|------------|----------|--------|
| E-field magnitude | `field-magnitude` | `fieldData[id][freq].E_mag` | Plane/Circle/Sphere/Cube | Verify |
| H-field magnitude | `field-magnitude` | `fieldData[id][freq].H_mag` | Plane/Circle/Sphere/Cube | Verify |
| E-field component (Ex) | `field-magnitude-component` | `fieldData[id][freq].E_vectors` → extract component | Plane/Circle/Sphere/Cube | Verify |
| H-field component (Hx) | `field-magnitude-component` | `fieldData[id][freq].H_vectors` → extract component | Plane/Circle/Sphere/Cube | Verify |
| Poynting magnitude | `field-magnitude` | Derived: `Re(E×H*)` | Plane/Circle/Sphere/Cube | Verify |

**Key checks**:
- Component extraction: does `item.component` (x/y/z) correctly index into vector arrays?
- Does `FieldVisualization.tsx` correctly handle non-square plane regions?
- Does the CubeField case work (it repurposes `radial`/`angular` for box segments)?
- Are value ranges (auto/manual) working correctly for all field types?
- Is the colorbar correctly labeled for each field type/component?

#### P1: Frequency-Aware Current/Voltage Renderers (1.5 days)

**CurrentRenderer fix**: Look up currents from `state.solver.frequencySweep` using `selectedFrequencyHz` from the active `ViewConfiguration`.

```tsx
// CurrentRenderer.tsx
const frequencySweep = useAppSelector(state => state.solver.frequencySweep);
const selectedFreq = viewConfig?.selectedFrequencyHz;

const currents = selectedFreq && frequencySweep
  ? frequencySweep.solutions.find(s => s.frequency === selectedFreq)?.branch_currents
  : results?.branch_currents;
```

Same pattern for **VoltageRenderer**.

#### P1: AntennaRenderer Filtering (0.5 day)

- `antenna-system`: render all elements
- `single-antenna`: render only the element matching `item.antennaId`

#### P2: Console.log Cleanup + Camera Fix (1 day)

- Gate all debug logs behind `import.meta.env.DEV` across all renderer files
- Implement `setCameraProjection()` using `useThree().set({ camera })` to actually swap perspective/orthographic

#### P3: LineViewPanel (Deferred — after P0–P2)

Wire up the existing `ImpedancePlot`, `VoltagePlot`, `CurrentPlot` components in `renderPlot()`. Transform `FrequencySweepResult` → plot component props. This is functional code that just needs plumbing — lower urgency because the 3D views are the primary postprocessing output.

### Total Effort: ~8 days (P0–P2), ~2 days later for P3

---

## Subproject III — FEM Solver Integration (OpenCFS)

### OpenCFS Analysis Summary

**What OpenCFS is**: A mature C++ FEM multi-physics solver (~20 years, MIT license) supporting:
- **Physics**: Electrostatics, current flow, magnetostatics, eddy currents, acoustics, mechanics, heat, flow, piezoelectric coupling, and more
- **Elements**: Nodal H1 (Lagrange), Edge (Nedelec), p-FEM up to arbitrary order
- **Mesh formats**: Gmsh `.msh`, HDF5 `.h5` (native), plus Abaqus `.inp`, COMSOL converters
- **Solvers**: Direct LU, Pardiso (MKL or Schenk), iterative CG/GMRES with preconditioners
- **Drivers**: Static, transient, harmonic, eigenfrequency, multi-harmonic
- **Output**: HDF5 (native), Gmsh `.msh`, XDMF, text
- **Input**: XML simulation file + XML material file + mesh file
- **Build**: CMake, requires GCC/gfortran + Boost + HDF5 + MKL + Xerces-C++ + many more
- **Docker**: Has CI Dockerfile for development (Ubuntu/Fedora base images)

**CFS Electrostatic Input Structure** (from `Cube3d.xml`):
```xml
<cfsSimulation>
  <fileFormats>
    <input><hdf5 fileName="mesh.h5"/></input>
    <output><hdf5/></output>
    <materialData file="mat.xml" format="xml"/>
  </fileFormats>
  <domain geometryType="3d">
    <regionList><region name="vol" material="dielectric"/></regionList>
    <nodeList><nodes name="gnd"/><nodes name="electrode"/></nodeList>
  </domain>
  <sequenceStep>
    <analysis><static/></analysis>
    <pdeList>
      <electrostatic>
        <regionList><region name="vol" integId="gauss6"/></regionList>
        <bcsAndLoads>
          <ground name="gnd"/>
          <potential name="electrode" value="1.0"/>
        </bcsAndLoads>
        <storeResults>
          <nodeResult type="elecPotential"><allRegions/></nodeResult>
          <elemResult type="elecFieldIntensity"><allRegions/></elemResult>
          <regionResult type="elecEnergy"><allRegions/></regionResult>
        </storeResults>
      </electrostatic>
    </pdeList>
    <linearSystems><system><solverList><directLU/></solverList></system></linearSystems>
  </sequenceStep>
</cfsSimulation>
```

**Material DB format** (from `mat.xml`):
```xml
<cfsMaterialDataBase>
  <material name="silizium">
    <electric>
      <permittivity><linear>
        <tensor dim1="3" dim2="3"><real>ε_xx 0 0  0 ε_yy 0  0 0 ε_zz</real></tensor>
      </linear></permittivity>
    </electric>
  </material>
</cfsMaterialDataBase>
```

### Architecture: Two-Step Integration

```
Step 1: Lift & Shift — Lambda with CFS in Docker layer (Month 1–2)
┌──────────────────────────────────────────────────────────────────┐
│ Lambda-Based CFS Wrapper (size-restricted)                       │
│                                                                  │
│  Frontend ──► FEM Preprocessor ──► FEM Solver Lambda ──►        │
│               (FastAPI/Lambda)     (CFS binary in Docker layer)  │
│               - Mesh upload       - XML generation               │
│               - BC assignment     - CFS execution via subprocess │
│               - Material select   - HDF5 result parse            │
│                                                         ──►     │
│                               FEM Postprocessor                  │
│                               (FastAPI/Lambda)                   │
│                               - VTU generation                   │
│                               - Field extraction                 │
│                               - Integral quantities              │
│                                                                  │
│  Constraint: max ~50K elements (Lambda 15min timeout, 10GB mem)  │
└──────────────────────────────────────────────────────────────────┘

Step 2: Scalable Backend via Step Functions (Month 3–6)
┌──────────────────────────────────────────────────────────────────┐
│ Step Functions + SQS Orchestrator                                │
│                                                                  │
│  Decision Logic (added incrementally):                           │
│  ├── <50K elements → Lambda (CFS binary, ~30-300s)               │
│  ├── <500K elements → Fargate (Docker CFS, ~5min)               │
│  └── >500K elements → AWS Batch (Docker CFS + MPI, ~hours)      │
│                                                                  │
│  SQS Queues for decoupling:                                      │
│  ├── solve-request-queue → triggers solver                       │
│  ├── result-notification-queue → notifies frontend via WS/poll   │
│  └── DLQ for failed jobs                                        │
│                                                                  │
│  Shared Interface:                                               │
│  ├── Input: S3 mesh + JSON config                                │
│  ├── Output: S3 results (HDF5/VTU)                              │
│  └── Status: DynamoDB job tracking                               │
└──────────────────────────────────────────────────────────────────┘
```

### Detailed Data Models

#### New: Solver Method Abstraction

```python
# backend/common/models/solver_method.py

class SolverMethod(str, Enum):
    PEEC = "peec"         # Existing — wire antennas
    FEM = "fem"           # New — volume element method
    # Future: MOM = "mom", FDTD = "fdtd", BEM = "bem"

class PhysicsType(str, Enum):
    ELECTROMAGNETIC_ANTENNA = "em_antenna"  # PEEC
    ELECTROSTATIC = "electrostatic"          # FEM first target
    CURRENT_FLOW = "current_flow"            # FEM next
    MAGNETOSTATIC = "magnetostatic"          # FEM later
    # Future: EDDY_CURRENT, ACOUSTIC, MECHANICAL, HEAT

class FEMSimulationConfig(BaseModel):
    """Configuration for a FEM simulation."""
    solver_method: SolverMethod = SolverMethod.FEM
    physics_type: PhysicsType

    # Mesh
    mesh_file_key: str           # S3 key to uploaded .msh mesh
    mesh_format: str = "gmsh"    # "gmsh" only initially; "hdf5" later
    geometry_type: str = "3d"    # "2d" | "axi" | "3d"

    # Regions
    regions: list[RegionConfig]  # volume regions with materials

    # Boundary Conditions
    boundary_conditions: list[BoundaryCondition]

    # Solver
    analysis_type: str = "static"  # "static" | "harmonic" | "transient" | "eigenfrequency"
    linear_solver: str = "direct"  # "direct" | "cg" | "gmres"

    # Requested Results
    requested_results: list[ResultRequest]

    # Integration
    integration_order: int = 6

class RegionConfig(BaseModel):
    name: str
    material_name: str
    material_properties: dict  # e.g., {"permittivity": 8.854e-12}

class BoundaryCondition(BaseModel):
    type: str           # "ground" | "potential" | "charge" | "neumann" | "periodic"
    region_name: str    # mesh region/node group name
    value: float | None = None
    # For complex BCs
    parameters: dict | None = None

class ResultRequest(BaseModel):
    result_type: str    # "potential" | "field_intensity" | "energy" | "charge" | "force"
    scope: str = "all"  # "all" | specific region name
    output_format: str = "json"  # "json" | "vtu" | "hdf5"
```

#### Updated Project Model

```python
# Extended project to support multiple solver types
class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    solver_method: SolverMethod = SolverMethod.PEEC  # NEW

    # Existing PEEC fields (kept for backward compat)
    design_state: dict | None = None
    simulation_config: dict | None = None
    simulation_results: dict | None = None
    ui_state: dict | None = None

    # New FEM fields
    fem_config: dict | None = None         # FEMSimulationConfig as JSON
    fem_results: dict | None = None        # FEM results as JSON

    # New documentation field (Subproject I)
    documentation: dict | None = None
```

### Step 1 Implementation: Lambda-Based CFS Wrapper (Month 1–2)

#### 1.1 CFS Lambda Docker Image (Week 1–2)

**Goal**: A Lambda-compatible Docker image containing the CFS binary, runnable via subprocess.

Since a working CFS build already exists locally, we skip compiling from source and instead package the pre-built binaries into a Lambda container image.

```dockerfile
# backend/fem_solver/Dockerfile.lambda
FROM public.ecr.aws/lambda/python:3.11

# Install CFS runtime dependencies only (no build tools)
RUN yum install -y \
    libgfortran5 libgomp \
    hdf5 boost-filesystem \
    xerces-c \
    && yum clean all

# Copy pre-built CFS binary and required shared libraries
COPY cfs-binaries/cfs /usr/local/bin/cfs
COPY cfs-binaries/lib/ /usr/local/lib/
ENV LD_LIBRARY_PATH=/usr/local/lib:$LD_LIBRARY_PATH

# Install Python dependencies
COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy service code
COPY backend/fem_solver/ ${LAMBDA_TASK_ROOT}/
COPY backend/common/ ${LAMBDA_TASK_ROOT}/common/

CMD ["lambda_handler.handler"]
```

**Size consideration**: Lambda container images can be up to 10GB. CFS binary + shared libs typically ~200-500MB depending on linked libraries. Well within limits.

**Memory**: Lambda supports up to 10GB RAM. Electrostatic problems with <50K elements typically need <2GB.

**Timeout**: Lambda max 15 minutes. Electrostatic solve on 50K elements typically completes in <5 minutes.

**Validation steps**:
1. Package existing CFS binary + runtime libs into Docker image
2. Test with `Cube3d` electrostatic example inside the container
3. Run additional test cases from `Testsuite/TESTSUIT/Singlefield/Electrostatics/`
4. Verify HDF5 output is readable by Python h5py
5. Test as Lambda locally with SAM/docker-lambda

#### 1.2 FEM Preprocessor Service (Week 2–3)

```
backend/fem_preprocessor/
├── __init__.py
├── main.py              # FastAPI app, port 8004
├── config.py            # FEM_PREPROCESSOR_ env prefix
├── schemas.py           # Request/response models
├── mesh_handler.py      # Gmsh .msh upload, validation, region extraction
├── xml_generator.py     # Generate CFS simulation.xml from JSON config
├── material_db.py       # Material database (JSON → CFS mat.xml)
├── Dockerfile.lambda    # For AWS deployment
└── lambda_handler.py
```

**API Endpoints**:
```
POST /api/fem/mesh/upload          → Upload .msh file to S3, extract regions via meshio
GET  /api/fem/mesh/{id}/regions    → List mesh physical groups (volumes + surfaces)
POST /api/fem/mesh/{id}/validate   → Validate mesh (element types, quality metrics)

GET  /api/fem/physics              → List available physics types
GET  /api/fem/physics/{type}/bcs   → Available BC types for this physics
GET  /api/fem/physics/{type}/results → Available result types
GET  /api/fem/materials            → Material database (built-in library)
POST /api/fem/materials/custom     → Create custom material

POST /api/fem/config/generate-xml  → Generate CFS simulation.xml + mat.xml from JSON
POST /api/fem/config/validate      → Validate configuration completeness
```

**Key module: `mesh_handler.py`** (Gmsh .msh only)
```python
import meshio  # Python library for mesh I/O

def extract_regions(mesh_path: str) -> dict:
    """Read a Gmsh .msh file and extract physical groups."""
    mesh = meshio.read(mesh_path)
    regions = {}
    for cell_block in mesh.cells:
        for key, data in mesh.cell_sets_dict.items():
            if cell_block.type in data:
                regions[key] = {
                    "name": key,
                    "element_type": cell_block.type,
                    "num_elements": len(data[cell_block.type]),
                    "dimension": _element_dim(cell_block.type)
                }
    return regions

def validate_for_cfs(mesh_path: str) -> dict:
    """Check mesh compatibility with CFS."""
    mesh = meshio.read(mesh_path)
    supported_types = {"triangle", "triangle6", "tetra", "tetra10",
                       "hexahedron", "hexahedron27", "wedge", "pyramid"}
    issues = []
    for cb in mesh.cells:
        if cb.type not in supported_types:
            issues.append(f"Unsupported element type: {cb.type}")
    num_elements = sum(len(cb.data) for cb in mesh.cells)
    return {
        "valid": len(issues) == 0,
        "issues": issues,
        "num_elements": num_elements,
        "num_nodes": len(mesh.points),
        "within_lambda_limit": num_elements <= 50000
    }
```

#### 1.3 FEM Solver Service (Week 3–4)

```
backend/fem_solver/
├── __init__.py
├── main.py              # FastAPI app, port 8005
├── config.py
├── schemas.py
├── runner.py            # CFS execution via subprocess (locally or in Lambda)
├── xml_generator.py     # Generate CFS simulation.xml from JSON config
├── result_parser.py     # Parse HDF5 output → JSON
├── Dockerfile.lambda    # Contains CFS binary + Python runtime
└── lambda_handler.py
```

**API Endpoints**:
```
POST /api/fem/solve              → Submit FEM solve job (sync for Lambda)
GET  /api/fem/solve/{job_id}     → Get job status
GET  /api/fem/solve/{job_id}/results → Get results from S3
DELETE /api/fem/solve/{job_id}   → Cancel job
POST /api/fem/estimate           → Estimate solve time based on mesh size
```

**Key module: `runner.py`** (subprocess-based, Lambda-compatible)
```python
import subprocess
import tempfile
import h5py
from pathlib import Path

class CFSSolverRunner:
    """Runs CFS via subprocess — works both locally and in Lambda container."""

    def __init__(self, cfs_binary: str = "/usr/local/bin/cfs"):
        self.cfs_binary = cfs_binary

    async def run_simulation(self, job_id: str, config: FEMSimulationConfig) -> dict:
        """Run CFS as a subprocess."""
        work_dir = Path(tempfile.mkdtemp(prefix=f"cfs-{job_id}-"))

        try:
            # 1. Download mesh from S3 to work_dir
            mesh_path = await self._download_mesh(config.mesh_file_key, work_dir)

            # 2. Generate simulation.xml
            sim_xml = generate_cfs_xml(config)
            (work_dir / "simulation.xml").write_text(sim_xml)

            # 3. Generate mat.xml
            mat_xml = generate_material_xml(config.regions)
            (work_dir / "mat.xml").write_text(mat_xml)

            # 4. Run CFS via subprocess
            result = subprocess.run(
                [self.cfs_binary, "simulation.xml"],
                cwd=str(work_dir),
                capture_output=True,
                text=True,
                timeout=600  # 10 min max for Lambda safety
            )

            if result.returncode != 0:
                raise RuntimeError(f"CFS failed: {result.stderr}")

            # 5. Parse HDF5 results
            h5_files = list(work_dir.glob("*.h5"))
            output_file = next(f for f in h5_files if "output" in f.name or f != mesh_path)
            results = parse_hdf5_results(output_file, config)

            # 6. Upload results to S3
            result_key = await self._upload_results(job_id, results, work_dir)

            return {"job_id": job_id, "status": "completed", "result_key": result_key}
        finally:
            # Cleanup temp dir (important in Lambda to avoid /tmp exhaustion)
            shutil.rmtree(work_dir, ignore_errors=True)
```

**Size restriction enforcement**:
```python
# In the solve endpoint
@app.post("/api/fem/solve")
async def solve(request: FEMSolveRequest):
    # Validate mesh size for Lambda
    mesh_info = await get_mesh_info(request.mesh_file_key)
    if mesh_info["num_elements"] > 50000:
        raise HTTPException(
            status_code=413,
            detail=f"Mesh has {mesh_info['num_elements']} elements. "
                   f"Lambda limit is 50,000. Larger meshes will be supported "
                   f"via Fargate/Batch in a future release."
        )
    # Proceed with solve...
```

#### 1.4 FEM Postprocessor Service (Week 4–5)

```
backend/fem_postprocessor/
├── __init__.py
├── main.py              # FastAPI app, port 8006
├── config.py
├── schemas.py
├── field_extractor.py   # Extract fields from HDF5
├── vtu_converter.py     # HDF5 → VTU for frontend rendering
├── integrator.py        # Compute integral quantities (energy, charge, force)
├── line_sampler.py      # Sample fields along a line for plots
├── Dockerfile.lambda
└── lambda_handler.py
```

**API Endpoints**:
```
POST /api/fem/postprocess/fields          → Extract field data at points
POST /api/fem/postprocess/vtu             → Convert results to VTU
POST /api/fem/postprocess/line-sample     → Sample field along a line/curve
POST /api/fem/postprocess/integral        → Compute integral quantities
GET  /api/fem/postprocess/available/{job} → Available result types for job
```

**Key module: `field_extractor.py`**
```python
import h5py
import numpy as np

def extract_field(h5_path: str, field_type: str, region: str = None) -> dict:
    """Extract a field from CFS HDF5 output."""
    with h5py.File(h5_path, "r") as f:
        # CFS stores results in /Results/Mesh/Step_1/...
        step_group = f["Results"]["Mesh"]["Step_1"]

        if field_type == "elecPotential":
            data = step_group["elecPotential"][:]  # (N_nodes,)
            return {"type": "scalar", "values": data.tolist(), "at": "nodes"}

        elif field_type == "elecFieldIntensity":
            data = step_group["elecFieldIntensity"][:]  # (N_elements, 3)
            return {"type": "vector", "values": data.tolist(), "at": "elements"}

        elif field_type == "elecEnergy":
            data = step_group["elecEnergy"][:]
            return {"type": "scalar", "values": data.tolist(), "at": "elements"}
```

**Key module: `integrator.py`**
```python
def compute_total_energy(field_data: dict, mesh: dict) -> float:
    """Integrate energy density over the volume."""
    # Sum element energies weighted by element volume
    return float(np.sum(field_data["values"]))

def compute_charge_on_surface(field_data: dict, mesh: dict, surface: str) -> float:
    """Integrate D·n over a surface to get total charge."""
    # Extract surface elements, compute flux integral
    ...

def compute_capacitance(energy: float, voltage: float) -> float:
    """C = 2*W / V^2"""
    return 2 * energy / (voltage ** 2)
```

#### 1.5 Frontend: FEM-Aware Design Page (Week 5–8)

**Key change: Solver-Dependent GUI**

```tsx
// frontend/src/features/design/DesignPage.tsx
// Route: /project/:projectId/design

const DesignPage = () => {
  const solverMethod = useAppSelector(s => s.projects.currentProject?.solver_method ?? 'peec');

  if (solverMethod === 'peec') {
    return <PEECDesignPage />;  // Current DesignPage content
  }
  if (solverMethod === 'fem') {
    return <FEMDesignPage />;   // New FEM-specific page
  }
};
```

**FEM Design Page — 3 tabs:**

```
┌────────────────────────────────────────────────────────────────┐
│  [Preprocessor]  [Solver]  [Postprocessor]                    │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  PREPROCESSOR TAB:                                             │
│  ┌──────────┬──────────────────────────────┬──────────────┐   │
│  │ TreeView │   3D Mesh Viewer             │ Properties   │   │
│  │          │   (Three.js mesh rendering)  │              │   │
│  │ Regions  │                              │ Region:      │   │
│  │ ├ vol1   │                              │  Material:   │   │
│  │ ├ vol2   │                              │  [dropdown]  │   │
│  │ NodeGrps │                              │              │   │
│  │ ├ gnd    │                              │ BC:          │   │
│  │ ├ elec   │                              │  [ground]    │   │
│  │          │                              │  Value: 1.0  │   │
│  └──────────┴──────────────────────────────┴──────────────┘   │
│                                                                │
│  SOLVER TAB:                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Physics: [Electrostatic ▼]                               │  │
│  │ Analysis: [Static ▼]                                     │  │
│  │ Solver: [Direct LU ▼] [CG + precond ▼]                  │  │
│  │ Integration Order: [6 ▼]                                 │  │
│  │                                                          │  │
│  │ Requested Results:                                       │  │
│  │ ☑ Electric Potential   ☑ Electric Field                  │  │
│  │ ☑ Electric Energy      ☐ Charge on surfaces             │  │
│  │ ☐ Force                                                  │  │
│  │                                                          │  │
│  │ [▶ Solve]  [Status: Completed ✓]  [Est. ~15s]           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  POSTPROCESSOR TAB:                                            │
│  ┌──────────┬──────────────────────────────┬──────────────┐   │
│  │ Results  │   3D Field Viewer            │ Properties   │   │
│  │ ├ φ(x)   │   (VTU mesh + field colors)  │              │   │
│  │ ├ E(x)   │                              │ Colormap:    │   │
│  │ ├ W      │   OR                         │ Range:       │   │
│  │          │                              │ Component:   │   │
│  │ Plots    │   Line Diagram               │              │   │
│  │ ├ Energy │   (Recharts)                 │ Line style:  │   │
│  │ ├ Cap    │                              │ Export:      │   │
│  │          │                              │              │   │
│  └──────────┴──────────────────────────────┴──────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

**New frontend components**:
```
frontend/src/features/fem/
├── FEMDesignPage.tsx           # Orchestrator with 3 tabs
├── FEMPreprocessorTab.tsx      # Mesh upload, region/BC assignment
├── FEMSolverTab.tsx            # Physics/solver config, solve button
├── FEMPostprocessorTab.tsx     # Field visualization, line plots
├── components/
│   ├── MeshUploader.tsx        # Drag-drop .msh upload
│   ├── MeshViewer.tsx          # Three.js mesh renderer (triangles/tets)
│   ├── RegionTree.tsx          # Tree of mesh regions + node groups
│   ├── MaterialSelector.tsx    # Material library dropdown
│   ├── BCEditor.tsx            # Boundary condition editor
│   ├── PhysicsSelector.tsx     # Physics type dropdown
│   ├── SolverConfig.tsx        # Solver method selection
│   ├── ResultSelector.tsx      # Checkboxes for result types
│   ├── FEMFieldRenderer.tsx    # VTU-based field rendering
│   └── IntegralPlot.tsx        # Line diagrams for integral quantities
├── api/
│   ├── femPreprocessor.ts      # API client for FEM preprocessor
│   ├── femSolver.ts            # API client for FEM solver
│   └── femPostprocessor.ts     # API client for FEM postprocessor
└── store/
    └── femSlice.ts             # Redux slice for FEM state
```

**New Redux slice: `femSlice`**
```typescript
interface FEMState {
  // Mesh
  meshId: string | null;
  meshInfo: MeshInfo | null;       // regions, node groups, element counts
  meshUploading: boolean;

  // Configuration
  physicsType: PhysicsType | null;
  regions: RegionConfig[];
  boundaryConditions: BoundaryCondition[];
  solverConfig: {
    analysisType: 'static' | 'harmonic' | 'transient' | 'eigenfrequency';
    linearSolver: 'direct' | 'cg' | 'gmres';
    integrationOrder: number;
  };
  requestedResults: ResultRequest[];

  // Solve
  jobId: string | null;
  jobStatus: 'idle' | 'submitted' | 'running' | 'completed' | 'failed';
  jobProgress: number;
  solveError: string | null;

  // Results
  availableResults: string[];
  fieldData: Record<string, FieldData>;    // resultType → data
  integralResults: Record<string, number>; // energy, charge, capacitance

  // Visualization
  activeResultType: string | null;
  colorMap: string;
  valueRange: [number, number] | 'auto';
}
```

### Step 2 Roadmap: Scalable Backend + Physics Expansion (Month 3–6)

#### 2.1 Step Functions + SQS Architecture (Month 3)

Decouple the synchronous Lambda solve into an asynchronous pipeline:

```
Frontend → API Gateway → SQS (solve-request-queue) → Step Functions
                                                       │
                                                       ├── EstimateProblemSize (Lambda)
                                                       │
                                                       ├── ChooseBackend (Choice)
                                                       │   ├── <50K  → SolveLambda (existing)
                                                       │   ├── <500K → SolveFargate (ECS task)
                                                       │   └── >500K → SolveBatch (AWS Batch)
                                                       │
                                                       ├── ParseResults (Lambda)
                                                       │
                                                       └── NotifyComplete → SQS (result-queue) → WebSocket/Poll
```

**DLQ**: Failed jobs go to `solve-dlq` for retry or manual inspection.

**Job polling**: Frontend polls `GET /api/fem/solve/{job_id}` every 2s while status is `running`. Future: WebSocket push via API Gateway WebSocket API.

#### 2.2 Python FEM Microkernel for Lambda (Month 3–4)

Reimplement basic FEM in Python for small problems — pure Lambda, no CFS binary needed:

```python
# backend/fem/
├── mesh.py              # Mesh data structures, Gmsh .msh reader
├── fe_space.py          # H1 nodal finite element space
├── quadrature.py        # Gauss quadrature rules
├── operators.py         # Gradient, divergence operators
├── assembler.py         # Global matrix assembly (scipy.sparse)
├── pdes/
│   ├── base.py          # Abstract PDE interface
│   ├── electrostatic.py # ∇·(ε∇φ) = -ρ
│   └── current_flow.py  # ∇·(σ∇φ) = 0
├── solvers/
│   ├── direct.py        # scipy.sparse.linalg.spsolve
│   └── iterative.py     # CG, GMRES with preconditioners
├── postprocess.py       # Field recovery, energy computation
└── driver.py            # Orchestrate mesh → assemble → solve → postprocess
```

This enables:
- Lambda execution for small problems (<10K elements, ~30s solve)
- No CFS binary dependency — pure Python + NumPy/SciPy
- Smaller Lambda image (~100MB vs ~500MB with CFS)
- Same API interface as the CFS-based solver

#### 2.3 Physics Expansion (Month 4–6)

| Month | Physics | CFS XML PDE Tag | Key Additions |
|-------|---------|-----------------|---------------|
| 4 | **Current flow** | `<elecCurrent>` | Conductivity materials, current density BCs, Joule losses |
| 5 | **Eddy currents** | `<magneticEdge>` | A-V formulation, complex harmonic, skin effect |
| 6 | **Multi-physics coupling** | `<sequenceStep>` nesting | Electrostatic → mechanical (piezo), joule heating → thermal |

Each physics addition requires:
1. Backend: New BC types, material properties, result types in `schemas.py`
2. Frontend: Updated `PhysicsSelector`, `BCEditor`, `ResultSelector` components3. XML generator: New PDE tag mapping in `xml_generator.py`
4. Postprocessor: New field types (current density J, magnetic flux B, etc.)

#### 2.4 Shared Solver Interface

#### 2.4 Shared Solver Interface

```python
# backend/common/models/solver_interface.py

class SolverInterface(ABC):
    """Unified interface for all solver backends."""

    @abstractmethod
    async def submit(self, config: SimulationConfig) -> str:
        """Submit a solve job, return job_id."""

    @abstractmethod
    async def status(self, job_id: str) -> JobStatus:
        """Check job status."""

    @abstractmethod
    async def results(self, job_id: str) -> SimulationResults:
        """Retrieve results."""

    @abstractmethod
    async def cancel(self, job_id: str) -> None:
        """Cancel a running job."""

class PEECSolver(SolverInterface): ...          # Existing (synchronous)
class CFSLambdaSolver(SolverInterface): ...     # CFS binary via subprocess in Lambda
class PythonFEMLambdaSolver(SolverInterface): ... # Pure Python FEM on Lambda (Month 3+)
class CFSFargateSolver(SolverInterface): ...    # CFS via Fargate ECS task (Month 4+)
class CFSBatchSolver(SolverInterface): ...      # CFS via AWS Batch for large problems (Month 5+)
```

---

## Month 1–2 Sprint Plan

### Week 1–2: Field Views + CFS Containerization

| Day | Sub | Task | Deliverable |
|-----|-----|------|-------------|
| 1 | II | Audit all FieldRenderer cases: scalar E-mag, H-mag, components, all region shapes | Checklist of what works / what's broken |
| 2 | II | Fix FieldRenderer issues: component extraction, cube geometry, value ranges, colorbars | All scalar field views working |
| 3 | II | VectorRenderer overhaul: replace ArrowHelper with InstancedMesh | Performant vector rendering |
| 4 | II | VectorRenderer: verify E-vector, H-vector, Poynting, per-component views | All vector field views working |
| 5 | II | Frequency-aware CurrentRenderer + VoltageRenderer | Sweep-aware 3D rendering |
| 6 | II | AntennaRenderer filtering + console.log cleanup + camera projection fix | P1–P2 bugs resolved |
| 7 | III | Package existing CFS binary into Docker image | CFS runs in container |
| 8 | III | Test CFS container with `Cube3d` + 2–3 more electrostatic test cases | Validated solver output |
| 9 | III | Test CFS as Lambda container image (SAM local) | Lambda-compatible CFS |
| 10 | III | Design FEM data models + schemas (review with stakeholder) | Models finalized |

### Week 3–4: FEM Preprocessor + Documentation Editor

| Day | Sub | Task | Deliverable |
|-----|-----|------|-------------|
| 11 | III | FEM Preprocessor service scaffold (FastAPI, /health, config) | Service running on port 8004 |
| 12 | III | Mesh upload endpoint + S3 storage + meshio region extraction | Upload .msh, see physical groups |
| 13 | III | XML generator: JSON config → CFS simulation.xml + mat.xml | Valid CFS XML from API |
| 14 | III | Material DB (built-in library) + physics/BC/result metadata endpoints | Frontend can query available options |
| 15 | I | Backend: Add `documentation` field to project schema + repository | API stores/retrieves markdown |
| 16 | I | Backend: Image upload endpoint + S3 bucket (local MinIO or S3) | Images uploadable via API |
| 17 | I | Frontend: Install TipTap, create DocumentationPanel with edit/view mode | Basic rich editor works |
| 18 | I | Frontend: Image upload handler (paste/drag) + KaTeX math blocks | Full editor functionality |
| 19 | I | Frontend: Integration into DesignPage as collapsible panel + auto-save | Editor integrated + persisted |
| 20 | — | Integration testing across all 3 subprojects | Stable checkpoint |

### Week 5–6: FEM Solver + Frontend

| Day | Sub | Task | Deliverable |
|-----|-----|------|-------------|
| 21 | III | FEM Solver service scaffold + subprocess-based CFS runner | CFS runs from API call |
| 22 | III | HDF5 result parser (h5py): potential, E-field, energy | Results extracted to JSON |
| 23 | III | FEM Postprocessor service: field extraction + VTU conversion | VTU files generated |
| 24 | III | Frontend: FEMDesignPage with 3-tab layout + `femSlice` | Page skeleton + Redux state |
| 25 | III | Frontend: MeshUploader (drag-drop .msh) + MeshViewer (Three.js triangles) | Mesh visualized in 3D |
| 26 | III | Frontend: RegionTree + MaterialSelector + BCEditor | Config UI works |
| 27 | III | Frontend: FEMSolverTab (physics, solver, results config, solve button) | Can configure and trigger solve |
| 28 | III | Frontend: FEMPostprocessorTab (scalar field rendering on mesh) | See potential, E-field on mesh |
| 29 | III | End-to-end test: Upload .msh → configure → solve → visualize | Full pipeline works |
| 30 | — | Bug fixes, demo preparation | Demo-ready milestone |

### Week 7–8: Integral Quantities + Polish + AWS Deploy

| Day | Sub | Task | Deliverable |
|-----|-----|------|-------------|
| 31 | III | Integrator module: energy, charge, capacitance from HDF5 results | Derived quantities computed |
| 32 | III | Line sampling: sample field along user-defined line → Recharts data | Line diagrams work |
| 33 | III | IntegralPlot component + line diagram view in FEM postprocessor | Charts in FEM postprocessor |
| 34 | III | Vector field rendering in FEM postprocessor (E-field arrows on mesh) | FEM vector visualization |
| 35 | III | docker-compose.yml update with FEM preprocessor + solver services | Full local stack works |
| 36 | III | Dockerfile.lambda for FEM preprocessor + solver | Lambda-deployable |
| 37 | I | Terraform: S3 bucket for project assets (images + meshes + results) | AWS infra deployed |
| 38 | II | LineViewPanel: wire up ImpedancePlot/VoltagePlot/CurrentPlot (P3) | Line charts work (PEEC) |
| 39 | — | Cross-project integration testing + error handling | Robust error paths |
| 40 | — | Performance testing, Lambda timeout/memory profiling | Know the limits |

---

## Data Model Evolution

### DynamoDB Table Changes

No new tables needed. Extended project item:

```
PK: USER#{user_id}
SK: PROJECT#{project_id}

Attributes (new/changed in bold):
- ProjectId (S)
- Name (S)
- Description (S)
- **SolverMethod** (S): "peec" | "fem"
- DesignState (M): { elements, version }
- SimulationConfig (M): { ... }
- SimulationResults (M): { ... }
- UiState (M): { view_configurations }
- **Documentation** (M): { content, version, images, last_edited }
- **FemConfig** (M): { physics_type, mesh_file_key, regions, boundary_conditions, ... }
- **FemResults** (M): { job_id, status, result_keys, integral_results }
- CreatedAt (S)
- UpdatedAt (S)
```

### New S3 Objects

```
s3://antenna-simulator-project-assets-staging/
├── projects/
│   └── {project_id}/
│       ├── images/                    # Documentation images
│       │   └── {image_key}.png
│       ├── meshes/                    # FEM mesh files
│       │   └── {mesh_id}.msh
│       ├── fem-config/               # Generated CFS XML
│       │   └── {job_id}/
│       │       ├── simulation.xml
│       │       └── mat.xml
│       └── fem-results/              # CFS output
│           └── {job_id}/
│               ├── output.h5
│               └── fields.vtu
```

### New DynamoDB Items (Job Tracking)

```
PK: JOB#{job_id}
SK: METADATA
GSI1PK: USER#{user_id}
GSI1SK: JOB#{created_at}

Attributes:
- JobId (S)
- UserId (S)
- ProjectId (S)
- SolverMethod (S): "peec" | "fem"
- PhysicsType (S): "electrostatic" | "current_flow" | ...
- Status (S): "submitted" | "running" | "completed" | "failed" | "cancelled"
- Backend (S): "lambda"  (initially; later: "fargate" | "batch")
- SubmittedAt (S)
- CompletedAt (S)
- InputKey (S): S3 key for input data
- ResultKey (S): S3 key for results
- ErrorMessage (S)
- Metadata (M): { num_elements, physics_type, estimated_time }
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| CFS binary has library deps that don't work in Lambda base image | Use custom Lambda container with matching distro; `ldd` to verify all shared libs; test early |
| Lambda 15-min timeout too short for some FEM problems | Enforce 50K element limit via mesh validation; fail fast with clear error; Step Functions + Fargate in Month 3 |
| DynamoDB 400KB limit for large FEM results | Store only metadata + S3 keys in DynamoDB; full field data always in S3 |
| meshio can't read all Gmsh physical group types | Test with CFS electrostatic test suite meshes; fall back to custom Gmsh reader if needed |
| HDF5 result format changes between CFS versions | Pin CFS version; document expected HDF5 structure; use `cfstool` for format inspection |
| Three.js can't handle large meshes (>100K elements) | Enforce Lambda element limit naturally restricts mesh size. Add LOD/decimation later for Fargate/Batch results |
| Lambda /tmp only 10GB (512MB ephemeral default) | Configure Lambda with max ephemeral storage; meshes + results typically <100MB for 50K elements |
| TipTap editor bundle size | Lazy-load TipTap only when documentation panel is opened |

---

## Summary

| Subproject | Effort | Key Deliverables (Month 1–2) |
|-----------|--------|------------------------------|
| **I. Markdown Editor** | ~10 days | TipTap WYSIWYG editor with images (S3), KaTeX formulas, auto-save per project |
| **II. Field Views & Visualization** | ~8 days | All scalar + vector field views working, InstancedMesh vectors, frequency-aware renderers |
| **III. FEM Integration** | ~25 days | CFS in Lambda container, FEM preprocessor/solver/postprocessor services, FEM GUI with mesh upload → configure → solve → visualize pipeline |
| **Total** | ~43 days | All three running in parallel across 8 weeks |

### Month 3–6 Roadmap (High-Level)

| Month | Focus |
|-------|-------|
| 3 | Step Functions + SQS for async solves; Fargate backend for larger meshes; Python FEM microkernel |
| 4 | Current flow physics; Fargate/Batch scaling; job queue dashboar |
| 5 | Eddy currents (harmonic analysis); multi-frequency FEM; A-V formulation |
| 6 | Multi-physics coupling; Batch for >500K elements; platform rebranding |
