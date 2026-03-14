# FDTD Implementation Plan

> Full technical plan for integrating an FDTD electromagnetic solver into the Antenna Educator platform. This document is the single source of truth for implementation scope, architecture, and task breakdown.

## Decisions & Constraints

| Decision | Choice | Rationale |
|---|---|---|
| Feature branch | `fdtd-integration` | All MRs merge here; merge to `main` when complete |
| Deployment subdomain | `fdtd-stage.nyakyagyawa.com` | Separate Terraform stack, isolated from main staging |
| FDTD dimensionality | 1D + 2D first, 3D-ready architecture | Educational progression, incremental complexity |
| Boundary conditions | Mur ABC first, PML later | Mur is simpler and educational; PML added as extension |
| GPU technology | CuPy with NumPy fallback | `xp = cupy if gpu else numpy` — zero code duplication |
| GPU compute | Fargate Spot (g4dn) | Cold-start, $0 idle, ~$0.50/hr when running |
| Microservices | 3 separate (preprocessor, solver, postprocessor) | Mirrors PEEC pattern, clear separation of concerns |
| Frontend routing | `/fdtd/:projectId/design` (separate from PEEC) | Fully decoupled, own Redux slices |
| Structure creation | Parametric templates + basic geometry editing | Waveguide, PCB, patch antenna dialogs + custom shapes |
| Material database | Built-in library + custom materials | FR-4, copper, air, biological tissues, etc. |
| Demo examples | 4 demos × 2 presets (Lambda-small + GPU-large) | Educational range: antenna, GPR, bio-EM, EMC |

---

## Phase 0: Foundation & Tooling ✅

### 0.1 Branch + Copilot instructions ✅

**Deliverables:**
- [x] Feature branch `fdtd-integration` created from `main`
- [x] `.github/copilot-instructions-fdtd.md` — TDD, SOLID, cost, deployment guide
- [x] `docs/FDTD_GUIDE.md` — high-level goals, progress tracker
- [x] `docs/FDTD_IMPLEMENTATION_PLAN.md` — this document

### 0.2 Project type infrastructure ✅

**Goal**: Enable project creation with PEEC or FDTD type selection.

**Backend changes:**
- Add `project_type: str = "peec"` field to `ProjectBase` in `backend/projects/schemas.py`
- Ensure DynamoDB repository persists and queries `project_type`
- Default to `"peec"` for backward compatibility with existing projects

**Frontend changes:**
- `NewProjectDialog.tsx` — add project type selector (card-based: PEEC / FDTD with icons and descriptions)
- `ProjectCard.tsx` — show project type badge (chip/icon)
- `App.tsx` — add route `/fdtd/:projectId/design` pointing to `FdtdDesignPage`
- `projectsSlice.ts` — update `Project` interface to include `project_type`

**Tests:**
- `tests/unit/test_project_type.py` — project creation with type, default type, query filtering
- `frontend/src/features/projects/__tests__/NewProjectDialog.test.tsx` — type selector renders

---

## Phase 1: FDTD Backend — Core Solver ✅

### 1.1 Domain Models ✅

**File**: `backend/common/models/fdtd.py` — **Implemented** (PR #40)

```python
# Key models (Pydantic v2):

class FdtdMaterial(BaseModel):
    """Electromagnetic material properties."""
    name: str
    epsilon_r: float = 1.0      # Relative permittivity
    mu_r: float = 1.0           # Relative permeability
    sigma: float = 0.0          # Conductivity [S/m]
    color: str = "#808080"      # Visualization color

MATERIAL_LIBRARY: dict[str, FdtdMaterial]  # Predefined materials

class FdtdStructure(BaseModel):
    """Geometric structure in the computational domain."""
    id: str                     # UUID
    name: str
    type: Literal["box", "cylinder", "sphere", "substrate", "trace"]
    position: tuple[float, float, float]    # Center [m]
    dimensions: dict                         # Type-specific params
    material: str                            # Material name or custom
    custom_material: FdtdMaterial | None = None

class FdtdSource(BaseModel):
    """Excitation source."""
    id: str
    name: str
    type: Literal["gaussian_pulse", "sinusoidal", "modulated_gaussian", "plane_wave", "waveguide_port"]
    position: tuple[float, float, float]
    parameters: dict            # Type-specific (frequency, bandwidth, amplitude, etc.)
    polarization: Literal["x", "y", "z"] = "z"

class BoundaryCondition(BaseModel):
    """Boundary condition per domain face."""
    type: Literal["mur_abc", "pec", "pmc", "periodic"]

class DomainBoundaries(BaseModel):
    """Boundary conditions for all 6 faces."""
    x_min: BoundaryCondition = BoundaryCondition(type="mur_abc")
    x_max: BoundaryCondition = BoundaryCondition(type="mur_abc")
    y_min: BoundaryCondition = BoundaryCondition(type="mur_abc")
    y_max: BoundaryCondition = BoundaryCondition(type="mur_abc")
    z_min: BoundaryCondition = BoundaryCondition(type="mur_abc")
    z_max: BoundaryCondition = BoundaryCondition(type="mur_abc")

class FdtdProbe(BaseModel):
    """Field observation point/line/plane."""
    id: str
    name: str
    type: Literal["point", "line", "plane"]
    position: tuple[float, float, float]
    direction: tuple[float, float, float] | None = None   # For line probes
    extent: tuple[float, float] | None = None              # For plane probes
    fields: list[Literal["Ex", "Ey", "Ez", "Hx", "Hy", "Hz"]] = ["Ez"]

class FdtdGeometry(BaseModel):
    """Complete FDTD simulation domain."""
    domain_size: tuple[float, float, float]    # Physical size [m]
    cell_size: tuple[float, float, float]      # Yee cell size (dx, dy, dz) [m]
    structures: list[FdtdStructure] = []
    sources: list[FdtdSource] = []
    boundaries: DomainBoundaries = DomainBoundaries()
    probes: list[FdtdProbe] = []

class FdtdConfig(BaseModel):
    """Solver configuration."""
    num_time_steps: int = 1000
    courant_number: float = 0.99           # Fraction of CFL limit
    output_every_n_steps: int = 10         # Field snapshot interval
    dft_frequencies: list[float] = []      # Frequencies for on-the-fly DFT [Hz]
    auto_shutoff_threshold: float = 1e-6   # Stop when field energy drops below this
```

**Tests**: `tests/unit/fdtd/test_fdtd_models.py` — model validation, material library completeness, CFL computation ✅

### 1.2 FDTD Preprocessor ✅

**Directory**: `backend/fdtd_preprocessor/` — **Implemented** (PR #41)

**Files:**
| File | Purpose |
|---|---|
| `__init__.py` | Package marker |
| `main.py` | FastAPI app (port 8004), endpoints: `POST /api/fdtd/mesh`, `POST /api/fdtd/validate`, `GET /health` |
| `builders.py` | `build_yee_grid()`, `apply_structure()`, `apply_source()`, `apply_boundary()` |
| `schemas.py` | `FdtdMeshRequest`, `FdtdMeshResponse`, `FdtdValidationResponse` |
| `config.py` | `Settings(BaseSettings)` with `FDTD_PREPROCESSOR_` prefix |
| `lambda_handler.py` | Mangum wrapper |
| `Dockerfile.lambda` | Lambda container image |

**Key function signatures:**
```python
def build_yee_grid(geometry: FdtdGeometry) -> dict:
    """Allocate material property arrays (epsilon_r, mu_r, sigma) on the Yee grid.
    Returns: {nx, ny, nz, epsilon_r: ndarray, mu_r: ndarray, sigma: ndarray}
    """

def apply_structure(grid: dict, structure: FdtdStructure) -> None:
    """Paint material properties into grid cells occupied by the structure."""

def apply_source(grid: dict, source: FdtdSource) -> dict:
    """Configure source injection cells. Returns source descriptor for solver."""

def validate_setup(geometry: FdtdGeometry, config: FdtdConfig) -> list[str]:
    """Check for issues: CFL violation, source outside domain, missing materials, etc.
    Returns list of warning/error messages.
    """
```

**Tests**: `tests/unit/fdtd/test_fdtd_preprocessor.py` ✅

### 1.3 FDTD Solver — 1D + 2D Engines ✅

**Directory**: `backend/solver_fdtd/` — **Implemented** (PR #42)

**New files:**
| File | Purpose |
|---|---|
| `engine_common.py` | Array backend (`get_array_module()`), CFL computation, Gaussian pulse, DFT accumulator |
| `engine_1d.py` | 1D FDTD: `fdtd_1d_step()`, `run_fdtd_1d()` — educational, line-by-line comments |
| `engine_2d.py` | 2D FDTD: TM + TE modes, `fdtd_2d_step_tm()`, `run_fdtd_2d()` |
| `boundaries.py` | Mur ABC (1D, 2D), PEC, PMC; PML stub for future |
| `sources.py` | Hard/soft source injection, Gaussian pulse, sinusoidal, TFSF (1D) |
| `probes.py` | `PointProbe`, `LineProbe`, `PlaneProbe` — record time-domain field values |
| `postprocess.py` | On-the-fly DFT, S-parameter extraction from time signals, near-to-far-field |
| `schemas.py` | `FdtdSolveRequest`, `FdtdSolveResponse`, `FdtdSolveConfigResponse` |
| `lambda_handler.py` | Mangum wrapper |
| `Dockerfile.lambda` | Lambda container image |

**Modify**: `main.py` — add endpoints: `POST /api/fdtd/solve`, `POST /api/fdtd/solve/config`

**Key engine functions:**

```python
# engine_1d.py
def fdtd_1d_step(Ez, Hy, Ca, Cb, dt, dx, mu, xp):
    """Single 1D FDTD time step (leapfrog).
    Updates Hy (half-step) then Ez (full step) in-place.
    """

def run_fdtd_1d(grid_1d, config, source, boundaries, probes) -> FdtdTimeDomainResult:
    """Execute full 1D FDTD simulation.
    Returns time-domain probe data and optional DFT results.
    """

# engine_2d.py
def fdtd_2d_step_tm(Ez, Hx, Hy, Ca, Cb, dt, dx, dy, mu, xp):
    """Single 2D TM-mode FDTD time step.
    TM: Ez, Hx, Hy components on staggered grid.
    """

def run_fdtd_2d(grid_2d, config, sources, boundaries, probes, mode="tm") -> FdtdTimeDomainResult:
    """Execute full 2D FDTD simulation (TM or TE mode)."""

# engine_common.py
def get_array_module():
    """Return cupy if FDTD_USE_GPU=true and cupy available, else numpy."""

def compute_courant_limit(dx, dy=None, dz=None, c=C_0):
    """CFL stability limit: dt_max = 1 / (c * sqrt(1/dx² + 1/dy² + 1/dz²))"""

def gaussian_pulse(t, t0, spread):
    """Normalized Gaussian pulse: exp(-((t - t0) / spread)²)"""

def dft_accumulator_update(accumulator, field_slice, dt, step, frequencies, xp):
    """On-the-fly DFT: accumulate exp(-j*2π*f*n*dt) * field at each step."""
```

**Tests:**
- `tests/unit/fdtd/test_fdtd_1d_engine.py` — update equations, source injection, time stepping
- `tests/unit/fdtd/test_fdtd_2d_engine.py` — TM/TE modes, field symmetry
- `tests/unit/fdtd/test_fdtd_courant.py` — CFL computation for 1D/2D/3D
- `tests/unit/fdtd/test_fdtd_sources.py` — Gaussian pulse shape, soft vs hard injection
- `tests/unit/fdtd/test_fdtd_boundaries.py` — Mur ABC stability, PEC reflection
- `tests/unit/fdtd/test_fdtd_dft.py` — DFT accumulator vs numpy.fft accuracy

**Physics validation** (`@pytest.mark.critical`):
- `tests/unit/fdtd/test_fdtd_free_space_propagation.py` — pulse speed = c₀
- `tests/unit/fdtd/test_fdtd_reflection_coefficient.py` — Fresnel equations at dielectric interface
- `tests/unit/fdtd/test_fdtd_resonator.py` — PEC cavity resonant frequencies f_n = nc/(2L)
- `tests/unit/fdtd/test_fdtd_waveguide_cutoff.py` — TE₁₀ cutoff f_c = c/(2a) ✅

### 1.4 FDTD Postprocessor ✅

**Directory**: `backend/fdtd_postprocessor/` — **Implemented** (PR #43)

**Files:**
| File | Purpose |
|---|---|
| `__init__.py` | Package marker |
| `main.py` | FastAPI app (port 8006), endpoints below |
| `field_extraction.py` | `extract_field_snapshot()`, `extract_frequency_field()`, `compute_sar()`, `compute_poynting_vector()` |
| `far_field.py` | `near_to_far_field_2d()`, `compute_rcs()`, `compute_radiation_pattern()` |
| `schemas.py` | Request/response models for all endpoints |
| `config.py` | `Settings(BaseSettings)` with `FDTD_POSTPROCESSOR_` prefix |
| `lambda_handler.py` | Mangum wrapper |
| `Dockerfile.lambda` | Lambda container image |

**Endpoints:**
- `POST /api/fdtd/fields/extract` — field snapshots at specific times/frequencies
- `POST /api/fdtd/pattern/radiation` — radiation pattern from near-field data
- `POST /api/fdtd/sar` — Specific Absorption Rate: $SAR = \sigma|E|^2 / (2\rho)$
- `POST /api/fdtd/energy` — Poynting vector $\vec{S} = \vec{E} \times \vec{H}$, energy density
- `GET /health`

**Tests**: `tests/unit/fdtd/test_fdtd_postprocessor.py`, `tests/unit/fdtd/test_fdtd_far_field.py` ✅

---

## Phase 2: FDTD Frontend ✅

> **Implemented** in PR #44. Integration tests (15 tests), TypeScript types, 3 API clients, 2 Redux slices, FdtdDesignPage (3 tabs), docker-compose, nginx.

### 2.1 Redux Slices ✅

**Files to create:**

| File | State Shape |
|---|---|
| `frontend/src/store/fdtdDesignSlice.ts` | `structures[]`, `materials{}`, `sources[]`, `boundaries`, `probes[]`, `meshState`, `selectedStructureId` | ✅ |
| `frontend/src/store/fdtdSolverSlice.ts` | `status`, `progress`, `timeStep`, `totalSteps`, `config`, `probeResults{}`, `dftResults{}`, `sParameters` | ✅ |
| `frontend/src/store/fdtdPostprocessingSlice.ts` | `viewConfigurations[]`, `selectedViewId`, dialogs (reuse PEEC `ViewConfiguration` pattern) | Deferred |

**Modify**: `frontend/src/store/store.ts` — register new slices ✅

### 2.2 API Clients ✅

**Files to create:**
- `frontend/src/api/fdtdPreprocessor.ts` — `generateMesh()`, `validateSetup()`
- `frontend/src/api/fdtdSolver.ts` — `runSimulation()`, `getSimulationConfig()`, `getStatus()`
- `frontend/src/api/fdtdPostprocessor.ts` — `extractFields()`, `computeRadiationPattern()`, `computeSar()`

**Modify**:
- `frontend/src/api/client.ts` — add `fdtdPreprocessorClient`, `fdtdSolverClient`, `fdtdPostprocessorClient`
- `frontend/.env.development` — add `VITE_FDTD_PREPROCESSOR_URL`, `VITE_FDTD_SOLVER_URL`, `VITE_FDTD_POSTPROCESSOR_URL`
- `frontend/.env.production` — add Lambda Function URLs (populated after Terraform) ✅

### 2.3 FDTD Design Page ✅

**Directory**: `frontend/src/features/fdtd/`

**Tab structure** (mirrors PEEC but fully independent):

```
FdtdDesignPage
├── FdtdRibbonMenu          (toolbar: Add Structure, Source, Boundary, Mesh, etc.)
├── Tabs: Design | Solver | Postprocessing
│
├── Design Tab
│   ├── FdtdDesignCanvas     (main viewport)
│   │   ├── FdtdScene3D      (Three.js: Yee grid + structures + materials + sources)
│   │   ├── FdtdTreeView     (left: structure tree, source list, boundary list)
│   │   └── FdtdPropertiesPanel (right: selected item properties)
│   └── Dialogs
│       ├── WaveguideDialog       (rectangular waveguide: a, b, length, material)
│       ├── PcbDialog             (PCB trace: width, length, substrate, epsilon_r, feed)
│       ├── PatchAntennaDialog    (microstrip patch: L, W, substrate, feed position)
│       ├── FdtdStructureDialog   (generic box/cylinder/sphere with material)
│       ├── FdtdSourceDialog      (Gaussian pulse, sinusoidal, plane wave, port)
│       ├── FdtdBoundaryDialog    (per-face: Mur ABC, PEC, PMC, periodic)
│       └── MaterialSelector      (built-in library + custom material entry)
│
├── Solver Tab
│   ├── FdtdSolverTab        (time steps, Courant number, output config, Run button)
│   ├── FdtdSolverSettings   (DFT frequencies, probe config, auto-shutoff)
│   └── FdtdProgress         (progress bar, field energy monitor, time estimate)
│
└── Postprocessing Tab
    └── FdtdPostprocessingTab (reuse ViewConfiguration pattern)
        ├── 3D Views: field snapshots (time animation), current density, SAR maps
        └── Line Views: S-parameters, probe time series, impedance, return loss
```

**Component count**: ~20 components in `frontend/src/features/fdtd/`

### 2.4 TypeScript Types ✅

**File**: `frontend/src/types/fdtd.ts` — **Implemented** (250 lines)

Key interfaces: `FdtdMaterial`, `FdtdStructure`, `FdtdSource`, `FdtdBoundaryCondition`, `DomainBoundaries`, `FdtdConfig`, `FdtdProbe`, `FdtdGeometry`, `FdtdResult`, `FdtdProbeResult`, `FdtdSParameters`

---

## Phase 3: Infrastructure & CI/CD ✅

> **Deployed** to `fdtd-stage.nyakyagyawa.com`. All 3 Lambda functions healthy.

### 3.1 Terraform — FDTD Staging Environment ✅

**Directory**: `terraform/environments/fdtd-staging/main.tf` — **Deployed**

**Lambda Function URLs (live):**
| Service | Function URL |
|---|---|
| FDTD Preprocessor | `https://ukx2l6nlsrrpl73iuzxzbisx6u0nxglx.lambda-url.eu-west-1.on.aws/` |
| FDTD Solver | `https://6gknpdgfsocnxzztd4q3hgoaz40thtzh.lambda-url.eu-west-1.on.aws/` |
| FDTD Postprocessor | `https://gyqrqwfcdihiuriqo6zwlqwql40sidgw.lambda-url.eu-west-1.on.aws/` |

**New resources** (created via existing Terraform modules):
| Resource | Module | Config |
|---|---|---|
| ECR: `antenna-simulator-fdtd-preprocessor-fdtd-staging` | `ecr` | Standard |
| ECR: `antenna-simulator-fdtd-solver-fdtd-staging` | `ecr` | Standard |
| ECR: `antenna-simulator-fdtd-postprocessor-fdtd-staging` | `ecr` | Standard |
| Lambda: fdtd-preprocessor | `lambda` | 512 MB, 30s timeout |
| Lambda: fdtd-solver | `lambda` | 2048 MB, 900s timeout |
| Lambda: fdtd-postprocessor | `lambda` | 2048 MB, 300s timeout |
| S3: frontend bucket | `s3-frontend` | fdtd-stage specific |
| CloudFront | `cloudfront` | `fdtd-stage.nyakyagyawa.com`, PriceClass_100 |
| ACM certificate | `acm-certificate` | `fdtd-stage.nyakyagyawa.com` |
| Route53 A + AAAA | `route53` | `fdtd-stage.nyakyagyawa.com` → CloudFront |

**Reused resources** (from existing staging):
| Resource | Why reuse |
|---|---|
| DynamoDB table | Projects share table, differentiated by `project_type` |
| Cognito user pool | Same users across PEEC and FDTD |
| S3 data bucket | Shared mesh/result storage |
| S3 results bucket | Shared simulation outputs |

### 3.2 CI/CD Pipeline ✅

**File**: `.github/workflows/fdtd-build-and-deploy.yml` — **Implemented**

Mirrors `aws-build-and-merge.yml` with these changes:
- **Trigger**: PR labeled `deploy-to-fdtd-staging` + push to `fdtd-integration`
- **Services**: `fdtd-preprocessor`, `solver-fdtd`, `fdtd-postprocessor` (all 3 deployed)
- **Frontend**: Builds and deploys to fdtd-stage S3 bucket
- **Tests**: Runs `pytest tests/unit/fdtd/` + `pytest tests/integration/fdtd/` in addition to shared tests
- **Auto-merge**: Merges PRs to `fdtd-integration` (not `main`)

**Supporting files**:
- `buildspec-fdtd-test.yml` — test job (FDTD-specific + shared tests) ✅
- `buildspec-fdtd-deploy.yml` — builds all 3 FDTD Docker images, pushes ECR, updates Lambdas, deploys frontend ✅

### 3.3 Docker Compose Update ✅

Added to `docker-compose.yml` (PR #44):
```yaml
fdtd-preprocessor:
  build: { context: ., dockerfile: backend/Dockerfile }
  command: uvicorn backend.fdtd_preprocessor.main:app --host 0.0.0.0 --port 8004
  expose: [8004]

fdtd-solver:
  build: { context: ., dockerfile: backend/Dockerfile }
  command: uvicorn backend.solver_fdtd.main:app --host 0.0.0.0 --port 8005
  expose: [8005]
  deploy: { resources: { limits: { memory: 4G } } }

fdtd-postprocessor:
  build: { context: ., dockerfile: backend/Dockerfile }
  command: uvicorn backend.fdtd_postprocessor.main:app --host 0.0.0.0 --port 8006
  expose: [8006]
```

Update `deployment/nginx/nginx.conf` to proxy `/api/fdtd/*` routes to FDTD services. ✅

### 3.4 Deployment Scripts ✅

- `deploy-fdtd-frontend.ps1` — build frontend, sync to fdtd-stage S3, invalidate CloudFront ✅
- `dev_tools/rebuild_fdtd_lambda_images.ps1` — build + push 3 FDTD Lambda images (preprocessor, solver, postprocessor) ✅

---

## Phase 4: Testing ✅

> All testing phases complete. 738 backend tests (42 FDTD integration), 29 FDTD frontend tests, TSC clean.

### 4.1 Unit Tests (`tests/unit/fdtd/`) ✅

| Test file | What it validates |
|---|---|
| `test_fdtd_models.py` | Domain model validation, material library, geometry constraints |
| `test_fdtd_preprocessor.py` | Yee grid generation, structure painting, source placement |
| `test_fdtd_1d_engine.py` | 1D update equations, Gaussian source, time stepping loop |
| `test_fdtd_2d_engine.py` | 2D TM/TE modes, field symmetry, corner handling |
| `test_fdtd_courant.py` | CFL stability computation for 1D/2D/3D |
| `test_fdtd_sources.py` | Gaussian pulse shape, soft vs hard injection, frequency content |
| `test_fdtd_boundaries.py` | Mur ABC stability, PEC perfect reflection, PMC |
| `test_fdtd_probes.py` | Point/line/plane probe recording accuracy |
| `test_fdtd_dft.py` | On-the-fly DFT vs numpy.fft, frequency resolution |
| `test_fdtd_postprocessor.py` | SAR computation, Poynting vector, field extraction |
| `test_fdtd_far_field.py` | Near-to-far-field transform, RCS computation |

### 4.2 Physics Validation (`@pytest.mark.critical`) ✅

| Test | Analytical Reference | Tolerance |
|---|---|---|
| Free-space propagation | Pulse arrives at t = d/c₀ | < 1 cell error |
| Dielectric reflection | $R = (n_1 - n_2)/(n_1 + n_2)$ | < 2% |
| PEC cavity resonance | $f_n = nc_0/(2L)$ | < 1% |
| Waveguide TE₁₀ cutoff | $f_c = c_0/(2a)$ | < 2% |

### 4.3 Integration Tests (`tests/integration/fdtd/`) ✅

> 42 integration tests across 5 test files. All passing.

| Test file | Tests | Scope |
|---|---|---|
| `test_fdtd_pipeline.py` | 15 | Health checks, preprocessor, solver 1D/2D, postprocessor, gold-standard pipelines |
| `test_fdtd_preprocessor_solver_pipeline.py` | 3 | Geometry → mesh → solve, structure handling, validation → solver dt |
| `test_fdtd_complete_workflow.py` | 4 | Full 1D + 2D TM + 2D TE workflows: validate → mesh → solve → extract → energy |
| `test_fdtd_api_endpoints.py` | 17 | All endpoints with valid data, response schema validation, error handling |
| `test_fdtd_s_parameter_extraction.py` | 4 | S₁₁ from synthetic signals, PEC reflection, zero reflection, FDTD-derived data |

### 4.4 Frontend Tests ✅

> 29 tests across 3 test files. All passing.

| Test file | Tests | Scope |
|---|---|---|
| `fdtdDesignSlice.test.ts` | 16 | Initial state, CRUD for structures/sources/probes, boundaries, config, reset, dirty flag |
| `fdtdSolverSlice.test.ts` | 9 | Initial state, mode switch, progress, clear results, async thunk state transitions |
| `FdtdDesignPage.test.tsx` | 4 | Page renders with tabs, title, design content, solver tab switch |

**Deferred** (will be added with corresponding components):
| Test file | Scope |
|---|---|
| `FdtdStructureDialog.test.tsx` | Dialog form validation, submit dispatches action |
| `MaterialSelector.test.tsx` | Material selection, custom material entry |

---

## Phase 5: Demo Examples ✅

### Project Data Files ✅

**Directory**: `backend/fdtd_preprocessor/demos/`

Each JSON file contains a complete project `design_state` + `simulation_config`:

#### 1. Broadband Antenna (bow-tie)
- **Physics**: Wideband antenna, triangular arms create broadband impedance match
- **Small preset**: 40×40×20 grid, 500 MHz center, Gaussian pulse (200 MHz–800 MHz), 1000 steps
- **Large preset**: 200×200×100 grid, full bandwidth characterization, 10000 steps
- **Key outputs**: S11 (return loss vs frequency), impedance bandwidth, 2D radiation pattern

#### 2. Ground Penetrating Radar (GPR)
- **Physics**: Short pulse propagation through layered soil, reflection from buried objects
- **Small preset**: 100×50 grid (2D), 1 GHz Gaussian pulse, dry soil (ε_r=4) / wet soil (ε_r=25) / metal target
- **Large preset**: 300×150 grid, realistic multi-layer soil model, multiple targets
- **Key outputs**: B-scan (time vs position), target detection, soil layer identification

#### 3. Bio EM SAR Simulation
- **Physics**: Mobile phone antenna radiation absorbed by human head tissue
- **Small preset**: 30×30×30 grid, 900 MHz sinusoidal source, simplified 3-layer head (skin/bone/brain)
- **Large preset**: 100×100×100 grid, 6+ tissue types with frequency-dependent properties
- **Key outputs**: SAR distribution map, 1g/10g averaged SAR values, E-field penetration depth

#### 4. EMC/EMI (PCB Trace)
- **Physics**: Signal integrity on PCB traces, electromagnetic coupling between adjacent traces
- **Small preset**: 60×30×20 grid, microstrip with 90° bend on FR-4 (ε_r=4.4), 1 GHz Gaussian
- **Large preset**: 200×100×50 grid, multi-trace coupling, via transitions, ground plane slots
- **Key outputs**: Near-field emission map, S-parameters (S11, S21), coupling coefficient between traces

### API Endpoints ✅

Added to FDTD Preprocessor service (`backend/fdtd_preprocessor/main.py`):

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/fdtd/demos` | GET | List all available demo examples (slug, name, description, preset keys) |
| `/api/fdtd/demos/{slug}` | GET | Get a specific demo with design_state + simulation_config. Query: `?preset=small\|large` |

### Course Integration ✅

**Seed script**: `dev_tools/seed_fdtd_demo_projects.py`

Creates:
1. Course folder "FDTD Demonstrations" (admin-owned, `is_course=true`)
2. Four sub-folders: "Broadband Antenna", "GPR Simulation", "Bio EM SAR", "EMC/EMI"
3. Pre-populated projects in each sub-folder with `design_state`, `simulation_config`
4. Users can browse in Courses tab and copy to their workspace

Usage:
```bash
python dev_tools/seed_fdtd_demo_projects.py --user-id <admin-id>          # AWS
python dev_tools/seed_fdtd_demo_projects.py --user-id <id> --dry-run       # Preview
python dev_tools/seed_fdtd_demo_projects.py --user-id <id> --endpoint http://localhost:8000  # Local
```

### Tests ✅

51 tests in `tests/integration/fdtd/test_fdtd_demos.py`:
- Data validation: required keys, valid geometry, valid config, sources, probes, method per preset per demo
- API: list demos, detail endpoint, default/small/large presets, 404/400 error handling

---

## Phase 6: GPU Solver (Fargate Spot)

### CuPy Integration

**Approach**: The solver engine code uses `xp = get_array_module()` throughout. The `get_array_module()` function returns `cupy` if `FDTD_USE_GPU=true` and CuPy is installed, otherwise `numpy`. This means **zero code changes** between CPU and GPU execution paths.

```python
# engine_common.py
def get_array_module():
    if os.environ.get("FDTD_USE_GPU", "false").lower() == "true":
        try:
            import cupy
            return cupy
        except ImportError:
            pass
    import numpy
    return numpy
```

**Dependencies**:
- Lambda: `requirements.txt` (numpy only, no CuPy)
- Fargate GPU: `requirements-gpu.txt` (numpy + cupy-cuda12x)

### Fargate Spot Infrastructure

**Terraform module**: `terraform/modules/fargate-gpu/`

| Resource | Config |
|---|---|
| ECS Cluster | Fargate Spot capacity provider |
| Task Definition | g4dn instance, 4 vCPU, 16 GB RAM, 1 GPU, CuPy image |
| ECS Service | `desired_count=0` (scaled to 0 when idle) |
| Auto-scaling | Scale to 1 on SQS message depth > 0, scale to 0 after 5 min idle |
| SQS Queue | `fdtd-gpu-jobs` — job submission queue |
| S3 | Input/output for large grid data (exceeds Lambda payload limit) |

**Workflow**:
1. Frontend submits GPU solve request → Lambda endpoint
2. Lambda writes grid data to S3, submits job to SQS, returns `job_id`
3. Fargate Spot task picks up job, loads grid from S3, runs CuPy solver
4. Task writes results to S3, updates job status in DynamoDB
5. Frontend polls `GET /api/fdtd/solve/status/{job_id}` until complete
6. Fargate auto-scales to 0 after 5 min idle

**Cost**: ~$0.50/hr when running, **$0 when idle**. Spot pricing provides additional ~60% discount.

### GPU Solver Endpoint

- `POST /api/fdtd/solve/gpu` — submits job to SQS, returns `{job_id, status: "queued"}`
- `GET /api/fdtd/solve/status/{job_id}` — returns `{status, progress, result_s3_key}`
- Frontend shows estimated wait time (cold start ~2 min + solve time)

---

## Implementation Order & Dependencies

```
Phase 0 ─── ✅ COMPLETE
  0.1 Branch + instructions       ──→ ✅
  0.2 Project type infra          ──→ ✅

Phase 1 ─── ✅ COMPLETE (PRs #40–#43)
  1.1 Domain models               ──→ ✅ PR #40
  1.2 Preprocessor   ┐
  1.3 Solver engines  ├── ✅ PRs #41, #42
  1.4 Postprocessor  ┘──→ ✅ PR #43

Phase 2 ─── ✅ COMPLETE (PR #44)
  2.4 Types → 2.1 Slices + 2.2 API (parallel) → 2.3 Components

Phase 3 ─── ✅ DEPLOYED
  3.1 Terraform → ✅ All 3 Lambdas + CloudFront live
  3.2 CI/CD → ✅ GitHub Actions + CodeBuild (all 3 services)
  3.3 Docker Compose ✅
  3.4 Deploy scripts ✅

Phase 4 ─── ✅ COMPLETE
  4.1–4.2 ✅ alongside Phase 1 (unit + physics)
  4.3 ✅ 42 integration tests (5 files)
  4.4 ✅ 29 frontend tests (3 files)

Phase 5 ─── ✅ COMPLETE
  4 demo JSON files (broadband_antenna, gpr_simulation, bio_em_sar, emc_pcb_trace)
  Each with small + large presets (8 projects total)
  API endpoints: GET /api/fdtd/demos, GET /api/fdtd/demos/{slug}
  Seed script: dev_tools/seed_fdtd_demo_projects.py
  51 tests in test_fdtd_demos.py

Bugfix ─── ✅ PR #45 (Fix 2D solver crash: MurABC2D IndexError on degenerate grid)
  boundaries.py: skip Mur stencil on axes with <2 cells
  main.py: validate 2D grid ≥ 3×3 cells (returns 400)
  fdtdDesignSlice.ts: auto-adjust domain/cell on 1D→2D switch

─── v1 COMPLETE ───────────────────────────────────────────────

Phase 7 ─── ✅ COMPLETE (PR #45, commit ddef68a)
  project_type field (peec|fdtd) in backend schemas + DynamoDB
  Solver-type filter: GET /api/projects?project_type=fdtd
  NewProjectDialog: card-based PEEC/FDTD type selector
  ProjectCard: solver-type badge + routing (/fdtd vs /project)
  ProjectsPage: filter tabs (All / PEEC / FDTD)
  fdtdDesignSlice: loadFdtdDesign + markClean + auto-save (debounced 1.5s)
  11 tests (7 frontend persistence + 4 backend filter/schema)

Phase 8A ── ✅ COMPLETE (PR #46, commit f4fd662)
  3D scene: FdtdScene3D, DomainWireframe, StructureMesh, SourceMarker,
            ProbeMarker, BoundaryFaceOverlay (6 scene components)
  UI panels: FdtdTreeView, FdtdPropertiesPanel, FdtdRibbonMenu, BoundaryPanel
  Dialogs: CustomStructureDialog (box/cylinder/sphere), PatchAntennaDialog
  FdtdDesignPage: restructured to 3-panel layout (tree + scene + properties)
  34 tests (30 new Phase8A + 4 existing updated)

Phase 8B ── ✅ COMPLETE (PR #47, commit 08ccbe8)
  Structure dialogs: WaveguideDialog, MicrostripDialog, DipoleFdtdDialog, CavityDialog
  Source picker: Gaussian Pulse, Sinusoidal, Modulated Gaussian (Plane Wave, Waveguide Port → 3D)
  Probe picker: Point, Line, Plane (Near-field contour → 3D)
  MaterialLibrary: searchable browser with categories + custom material creator
  FdtdRibbonMenu: all structure items enabled, source/probe picker wired

Phase 9 ─── 🔄 IN PROGRESS — Postprocessor & Visualization
Phase 10 ── ⬜ Solver UI & Workflow
Phase 11 ── ⬜ 3D FDTD Engine
Phase 12 ── ⬜ Educational Features (Problem Builder + Tutorials)
Phase 13 ── ⬜ DEFERRED — GPU Solver (Fargate Spot, replaces old Phase 6)
```

---

# FDTD v2 — Full UI, 3D Engine & Educational Platform

> Phases 7–12 bring the FDTD solver to production-quality UI parity with PEEC,
> add a 3D engine, and build educational tools for field theory, antenna theory
> and solver theory courses. Phase 13 (GPU) is deferred until 3D grids require it.

## Design Principles

| Principle | Detail |
|---|---|
| **PEEC-like workflow** | Same 3-tab layout (Design → Solve → Post-process), ribbon menu, tree view, properties panel. Postprocessor is a near-clone. |
| **Multi-solver extensible** | Project model uses `solver_type` discriminator — same DynamoDB table, same project browser. Adding FEM later = one new type. |
| **Pre-built + low-level** | Structure dialogs for common geometries (patch antenna, waveguide, PCB) AND raw box/cylinder/sphere placement for arbitrary designs. |
| **Educational-first** | Theory tooltips on every control, step-by-step guided tutorials, problem builder for instructors, CFL/grid-quality indicators. |
| **Dual audience** | Default guided mode (undergrads learning "what is FDTD") + advanced toggle (grad students who know Maxwell). |
| **Zero idle cost** | Everything on Lambda. GPU only via explicit user action (Phase 13). |

---

## Phase 7: Multi-Solver Project Architecture

**Goal**: Integrate FDTD into the existing Projects system so saving, loading, and browsing works identically to PEEC. Design the persistence layer to be solver-agnostic (FEM-ready).

### 7.1 Backend: Solver-Agnostic Project Model

**Files**: `backend/projects/schemas.py`, `backend/common/repositories/dynamodb_repository.py`

- Add `solver_type: Literal["peec", "fdtd", "fem"] = "peec"` to `ProjectBase`
- `design_state` blob schema varies by solver_type (JSON, not validated by projects service)
- Add GSI2 (`GSI2PK=USER#{user_id}#TYPE#{solver_type}`, `GSI2SK=PROJECT#{project_id}`) for filtered listing
- `GET /api/projects?solver_type=fdtd` query parameter for frontend filtering
- Backward-compatible: existing PEEC projects default to `solver_type="peec"`

### 7.2 Frontend: Project Browser Integration

**Files**: `frontend/src/store/projectsSlice.ts`, `frontend/src/features/projects/`

- `NewProjectDialog` — card-based solver type selector (PEEC / FDTD with icons + one-liner description)
- `ProjectCard` — solver type chip/badge, colored by type
- `ProjectsList` — filter tabs or dropdown: All / PEEC / FDTD
- Route: project type determines navigation target (`/design/:id` vs `/fdtd/:id/design`)

### 7.3 FDTD Auto-Save & Load

**Files**: `frontend/src/features/fdtd/FdtdDesignPage.tsx`, `frontend/src/store/fdtdDesignSlice.ts`

- Debounced auto-save (2s after last change) → `updateProject()` with 4 JSON blobs:
  - `design_state` — structures, sources, probes, domain, boundaries, materials
  - `simulation_config` — solver config (time steps, CFL, DFT freqs, mode)
  - `simulation_results` — solver output, field data (or S3 key for large results)
  - `ui_state` — active tab, camera position, view configurations
- `loadFdtdProject` thunk: fetch project → hydrate all 4 slices
- Dirty flag integration: unsaved indicator in header

### 7.4 Tests

- Backend: project CRUD with `solver_type`, GSI2 filtering, backward compat
- Frontend: save/load round-trip, project type routing, filter UI

**Estimated scope**: ~15 files changed, ~400 lines backend, ~600 lines frontend

---

## Phase 8: Preprocessor UI & 3D Scene

**Goal**: Build a visual geometry editor matching the PEEC design experience — 3D scene with interactive structure/source/probe placement, pre-built parametric dialogs, material library, and tree-based element management.

### 8.1 3D Scene (React Three Fiber)

**New file**: `frontend/src/features/fdtd/FdtdScene3D.tsx`

- React Three Fiber canvas with OrbitControls (rotate, pan, zoom)
- Domain bounding box wireframe (semi-transparent edges)
- Grid overlay toggle (shows Yee cell boundaries on faces)
- GizmoHelper (axis indicator, corner)
- Camera auto-fit to domain bounds
- Coordinate axis labels (x, y, z in meters with SI prefix)
- Click-to-select structures/sources/probes → highlight + properties panel

**Rendered elements** (components under `features/fdtd/scene/`):
- `StructureMesh.tsx` — box, cylinder, sphere as Three.js geometries, colored by material
- `SourceMarker.tsx` — arrow/icon at source position, color-coded by type
- `ProbeMarker.tsx` — point (dot), line (arrow), plane (translucent quad)
- `BoundaryFaceOverlay.tsx` — per-face color overlay (green=ABC, red=PEC, blue=PMC)
- `DomainWireframe.tsx` — outer domain box + optional cell grid lines

### 8.2 Pre-Built Structure Dialogs

**New files**: `frontend/src/features/fdtd/dialogs/`

Each dialog creates one or more `FdtdStructure` entries with the correct material:

| Dialog | Output Structures | Key Parameters |
|---|---|---|
| `PatchAntennaDialog.tsx` | Substrate slab + copper patch + ground plane + feed probe | L, W, h, εᵣ, feed offset |
| `WaveguideDialog.tsx` | Hollow rectangular box (PEC walls) | a, b, length |
| `MicrostripDialog.tsx` | Substrate + trace + ground plane | width, length, h, εᵣ |
| `DipoleFdtdDialog.tsx` | Two thin rods + gap (PEC or copper) | length, radius, gap, feed type |
| `CavityDialog.tsx` | PEC box with aperture (slot in one face) | W, H, D, slot position/size |
| `CustomStructureDialog.tsx` | Single box / cylinder / sphere | position, size, material picker |

Each dialog includes:
- Live 3D preview (mini Three.js canvas)
- Parameter validation with physics hints ("Patch length ≈ λ/2 at {f} GHz")
- "Add to Design" button → dispatches `addStructure()` for each sub-element

### 8.3 Material Library

**New file**: `frontend/src/features/fdtd/MaterialLibrary.tsx`

- Searchable/filterable material browser (uses backend `FdtdMaterial` presets)
- Categories: Vacuum, Metals, Dielectrics, PCB Substrates, Soil, Biological Tissue
- Custom material creator (εᵣ, μᵣ, σ input)
- Material preview card: name, color swatch, properties, usage hint
- Reuses existing `FdtdMaterial` Pydantic model (15+ built-in materials)

### 8.4 Source & Probe Placement

**Enhanced source dialogs**:
- Gaussian pulse: amplitude, width, delay + frequency-domain preview plot (FFT) 
- Sinusoidal: frequency, amplitude + wavelength indicator on grid
- Modulated Gaussian: center freq, bandwidth + spectrum preview
- Plane wave: incidence angle, polarization (2D/3D)
- Waveguide port: mode selection (TE₁₀, TM₁₁, etc.)

**Probe dialogs**:
- Point probe: click to place in 3D → records field(t) at that cell
- Line probe: drag start/end points → records spatial profile vs time
- Plane probe: select face or interior plane → records 2D snapshot vs time
- Near-field contour (for radiation pattern): auto-place rectangular contour

### 8.5 Boundary Configuration

**New file**: `frontend/src/features/fdtd/BoundaryPanel.tsx`

- 6-face boundary setup (x_min, x_max, y_min, y_max, z_min, z_max)
- Visual: exploded cube diagram showing each face with its BC type
- Types: Mur ABC (absorbing), PEC (perfect conductor), PMC (perfect magnet)
- Per-face dropdown + visual color feedback in 3D scene
- "Set all faces" convenience button (default: Mur ABC everywhere)

### 8.6 Tree View & Properties Panel

**New files**: `FdtdTreeView.tsx`, `FdtdPropertiesPanel.tsx`

**Tree View** (left sidebar, like PEEC):
```
📦 Domain (100×100 mm², dx=1mm)
├── 📐 Structures
│   ├── Substrate (FR-4, 50×50×1.6mm)
│   ├── Patch (Copper, 30×40mm)
│   └── Ground Plane (PEC)
├── ⚡ Sources
│   └── Gaussian Pulse (center, z-pol)
├── 📍 Probes
│   ├── Point: feed (25mm, 25mm)
│   └── Line: x-axis (y=25mm)
└── 🔲 Boundaries
    ├── x: ABC / ABC
    ├── y: ABC / ABC
    └── z: PEC / ABC
```

**Properties Panel** (right sidebar): Edit selected element inline — position sliders, material dropdown, parameter fields. Changes commit on blur/enter.

### 8.7 Ribbon Menu

**New file**: `frontend/src/features/fdtd/FdtdRibbonMenu.tsx`

Context-aware toolbar (changes with active tab):

| Tab | Ribbon Actions |
|---|---|
| **Design** | Add Structure ▾ (Patch, Waveguide, Microstrip, Dipole, Cavity, Custom) · Add Source ▾ · Add Probe ▾ · Material Library · Grid Settings |
| **Solver** | Run Simulation · Configure DFT · Mode (TM/TE) · Stability Check · Reset |
| **Post-processing** | Add View ▾ · Field Heatmap · Time Animation · Pattern Plot · S-Params · SAR Map · Export PDF |

### 8.8 Tests

- Unit: Structure dialog parameter validation, material library filtering
- Component: 3D scene renders structures, tree view CRUD, properties panel updates Redux
- Integration: Create structure via dialog → appears in 3D scene → persisted to project

**Estimated scope**: ~25 new files, ~4000 lines frontend

---

## Phase 9: Postprocessor & Visualization

**Goal**: Full postprocessing suite — every backend endpoint has a matching frontend visualization. Near-clone of PEEC postprocessor structure (view management, renderers, plots, export).

### 9.1 View Management System

**New files**: `frontend/src/store/fdtdPostprocessingSlice.ts`, `features/fdtd/postprocessing/FdtdPostprocessingTab.tsx`

- Mirrors PEEC `postprocessingSlice`: named views, each containing visualization items
- `ViewConfiguration { name, items: ViewItem[] }`
- `ViewItem { type, fieldComponent, config }` — one plot or renderer per item
- Add/remove/reorder views via drag-and-drop or buttons
- Persisted in `ui_state` blob for session restore

### 9.2 Field Heatmaps (2D)

**New file**: `features/fdtd/postprocessing/FieldHeatmap.tsx`

- Renders Ez, Hx, Hy (or Ex, Ey, Hz for TE) as color-mapped 2D image
- Uses `POST /api/fdtd/fields/extract` backend endpoint
- Colorbar component (viridis, jet, coolwarm, RdBu) with min/max controls
- Overlay: domain outline, structure boundaries as contour lines
- Field component selector dropdown (Ez, Hx, Hy, |E|, |H|)
- 1D mode: line plot (field vs position) instead of heatmap

### 9.3 Time Animation

**New file**: `features/fdtd/postprocessing/TimeAnimation.tsx`

- Playback of field evolution using PlaneProbe snapshot data
- Transport controls: play/pause, step forward/back, speed slider (0.5×–4×), loop
- Frame scrubber (slider for time step selection)
- Side-by-side: field heatmap + time-domain probe trace with cursor synced
- Requires PlaneProbe in solve — auto-add if none exists (with user permission)

### 9.4 Radiation Pattern

**New file**: `features/fdtd/postprocessing/RadiationPattern.tsx`

- 2D polar plot (uses `POST /api/fdtd/pattern/radiation` backend)
- Auto-configured near-field contour extraction from solve results
- Display: pattern (dB), directivity (dBi), HPBW annotation
- Overlay: main lobe, side lobes, nulls highlighted
- Angular range: full 360° (2D pattern) or selectable cuts

### 9.5 S-Parameter Plot

**New file**: `features/fdtd/postprocessing/SParameterPlot.tsx`

- S₁₁ (return loss) vs frequency from DFT probe data
- Uses `s_parameter_from_probes()` backend utility via new endpoint
- Dual axis: |S₁₁| (dB) + phase (deg)
- Markers: resonance frequency, bandwidth (−10 dB), impedance at marker
- Requires ≥2 probes (incident + reflected) — UI guides placement
- Add `POST /api/fdtd/sparams` endpoint to postprocessor

### 9.6 SAR Distribution

**New file**: `features/fdtd/postprocessing/SARMap.tsx`

- SAR heatmap overlaid on tissue structure geometry
- Uses `POST /api/fdtd/sar` backend endpoint
- Shows: peak SAR, 1g-averaged SAR, 10g-averaged SAR with regulation limits
- Tissue outline overlay with labels
- Colorbar: SAR (W/kg) with safety threshold lines

### 9.7 Poynting Vector & Energy Flow

**New file**: `features/fdtd/postprocessing/EnergyFlow.tsx`

- Poynting vector field as arrow plot (quiver) overlaid on |S| heatmap
- Uses `POST /api/fdtd/energy` backend endpoint
- Arrow density control, magnitude-scaled or uniform length
- Total radiated power readout

### 9.8 RCS Plot

**New file**: `features/fdtd/postprocessing/RCSPlot.tsx`

- Bistatic RCS (2-D) polar or Cartesian plot
- Uses `POST /api/fdtd/rcs` backend endpoint
- Display: σ₂D (dB·m), max RCS angle, monostatic RCS value

### 9.9 Frequency-Domain Field Maps

**New file**: `features/fdtd/postprocessing/FrequencyFieldMap.tsx`

- DFT field magnitude + phase at selected frequency
- Uses `POST /api/fdtd/fields/frequency` backend endpoint  
- Frequency selector (from `dft_frequencies` list)
- Magnitude heatmap + phase heatmap (side-by-side or toggle)

### 9.10 Shared Components

- `Colorbar.tsx` — reusable colorbar (colormaps: viridis, jet, coolwarm, RdBu, hot)
- `PlotContainer.tsx` — responsive chart wrapper with title, axis labels, export button
- `ExportPDFDialog.tsx` — capture all visible views → multi-page PDF
- Chart library: Recharts (already in PEEC) for line/polar plots; Canvas for heatmaps

### 9.11 Backend: New Postprocessor Endpoint

**File**: `backend/fdtd_postprocessor/main.py`

- Add `POST /api/fdtd/sparams` — takes incident/reflected probe data + DFT frequencies, returns S₁₁(f) magnitude/phase/complex

### 9.12 Tests

- Unit: Each plot component renders with mock data, colorbar renders correct range
- Integration: Solve → extract field → render heatmap end-to-end
- Snapshot tests for plot components with known data

**Estimated scope**: ~20 new files, ~3500 lines frontend, ~100 lines backend

---

## Phase 10: Solver UI & Workflow

**Goal**: Polish the solver tab with progress feedback, CFL indicators, grid quality checks, and a workflow matching PEEC's solve experience.

### 10.1 Solver Tab Redesign

**File**: `FdtdDesignPage.tsx` (solver tab section) → extract to `FdtdSolverTab.tsx`

- **Pre-solve checks** panel:
  - CFL stability indicator (green/yellow/red based on courant_number × dt_max)
  - Grid quality: cells per wavelength at highest DFT frequency (≥10 recommended)
  - Memory estimate (nx × ny × 8 bytes × 6 fields)
  - Estimated solve time (from grid size heuristic)
  
- **DFT Configuration** dialog:
  - Frequency list builder (start, stop, N points — linear or log)
  - Or manual entry
  - Preview: shows which wavelengths relative to grid size

- **Mode Selection** (2D): TM/TE toggle with visual diagram showing field orientation

- **Run button** with progress bar:
  - Time step counter (n / N)
  - Elapsed time + ETA
  - Field energy indicator (for convergence monitoring)
  - Auto-shutoff status

### 10.2 Solver State Machine

**File**: `frontend/src/store/fdtdSolverSlice.ts`

Expand status: `idle → validating → solving → postprocessing → solved | failed`

- `validating`: pre-solve checks (CFL, grid quality, memory)
- `solving`: actual FDTD run (progress updates if feasible)
- `postprocessing`: auto-extract primary field, auto-compute S-params if probes present
- `solved`: all results available, post-processing tab unlocked

### 10.3 Auto-Postprocessing Pipeline

After solve completes, automatically:
1. Extract primary field snapshot (Ez for TM, Hz for TE)
2. If DFT frequencies configured → compute frequency-domain fields
3. If ≥2 probes configured → compute S-parameters
4. If near-field contour probes → compute radiation pattern
5. Populate postprocessing slice with default views

### 10.4 Tests

- Solver pre-check accuracy (CFL computation matches backend)
- State machine transitions
- Auto-postprocessing pipeline triggers

**Estimated scope**: ~5 files, ~800 lines frontend

---

## Phase 11: 3D FDTD Engine

**Goal**: Full 3D Yee grid solver with all 6 field components. Limited to Lambda-sized grids (max ~60³ cells). Larger grids deferred to Phase 13 (GPU).

### 11.1 Backend: 3D Engine

**New file**: `backend/solver_fdtd/engine_3d.py`

- Full 3D Yee stencil: Ex, Ey, Ez, Hx, Hy, Hz (6 field arrays)
- Leapfrog time-stepping (same pattern as 1D/2D)
- Update equations:
  ```
  Hx^{n+½} = Hx^{n-½} + (Δt/μ)[(∂Ez/∂y) − (∂Ey/∂z)]
  Hy^{n+½} = Hy^{n-½} + (Δt/μ)[(∂Ex/∂z) − (∂Ez/∂x)]
  Hz^{n+½} = Hz^{n-½} + (Δt/μ)[(∂Ey/∂x) − (∂Ex/∂y)]
  Ex^{n+1} = Ca·Ex^n + Cb·[(∂Hz/∂y) − (∂Hy/∂z)]
  Ey^{n+1} = Ca·Ey^n + Cb·[(∂Hx/∂z) − (∂Hz/∂x)]
  Ez^{n+1} = Ca·Ez^n + Cb·[(∂Hy/∂x) − (∂Hx/∂y)]
  ```
- CFL limit: dt_max = 1/(c·√(1/dx² + 1/dy² + 1/dz²))
- `xp = get_array_module()` pattern for GPU-readiness

### 11.2 3D Boundaries

**File**: `backend/solver_fdtd/boundaries.py`

- `MurABC3D` class: first-order Mur on all 6 faces
- `apply_pec_3d()`, `apply_pmc_3d()`
- 3D probes: PointProbe3D, LineProbe3D, PlaneProbe3D (slice through volume)

### 11.3 3D Source Injection

- Point source in 3D: inject at (ix, iy, iz) for selected component
- Plane wave via total-field/scattered-field (TF/SF) boundary
- Waveguide port: inject TE₁₀ mode profile at boundary face

### 11.4 Grid Size Limits

- Lambda limit: 2048 MB memory, 300s timeout
- Max grid: ~60×60×60 (6 fields × 60³ × 8 bytes ≈ 10 GB → too large)
- Practical limit: ~40×40×40 (6 × 40³ × 8 ≈ 3 GB) or non-cubic (100×100×10)
- Validate on `POST /api/fdtd/solve` — reject if memory estimate > limit
- Larger grids → redirect to GPU endpoint (Phase 13)

### 11.5 Solver Integration

**File**: `backend/solver_fdtd/main.py`

- Add `dimensionality: "3d"` handling in `solve()` endpoint
- `_solve_3d()` function: builds 3D grid, extracts 3D slices, runs engine
- Response: `fields_final` contains 6 field components
- Update `FdtdSolverConfigResponse` to include `"3d"` in supported_dimensions

### 11.6 Frontend: 3D Visualization

**Files**: update `FdtdScene3D.tsx`, new `VolumeSliceViewer.tsx`

- 3D field visualization via axis-aligned slice planes (x, y, or z fixed)
- Slice scrubber: drag plane through volume
- Heatmap on slice plane with structure outlines
- Optional: volume rendering via opacity transfer function (lightweight)
- Isosurface rendering for |E| = constant (Three.js MarchingCubes)

### 11.7 Frontend: Design Updates

- `setDimensionality` now supports `"1d" | "2d" | "3d"`
- Domain size: 3D inputs (Lx, Ly, Lz) always shown when 3D selected
- Structure dialogs: z-dimension unlocked for 3D
- Boundary panel: all 6 faces active

### 11.8 3D Postprocessor Extensions

**Backend**: `backend/fdtd_postprocessor/`

- Extend `extract_field_snapshot` for 3D (return slice or full volume)
- 3D Poynting vector: **S** = **E** × **H** (full vector cross product)
- 3D far-field: surface equivalence on 6-face enclosing box → 3D radiation pattern
- 3D SAR: volume SAR distribution

### 11.9 Tests

- Physics validation: 3D plane wave propagation in free space (compare analytical)
- 3D cavity resonance (known eigenfrequency: f = c/(2)·√((m/a)²+(n/b)²+(p/d)²))
- 3D PEC reflection coefficient = −1
- Grid size rejection test (exceeds memory limit → 400)
- Frontend: slice viewer renders, dimensionality toggle works

**Estimated scope**: ~10 new files, ~1500 lines backend, ~1000 lines frontend

---

## Phase 12: Educational Features

**Goal**: Transform the simulator from a tool into a teaching platform — problem builder for instructors, guided tutorials for students, and embedded theory context.

### 12.1 Problem / Exercise Builder (Instructor Mode)

**New files**: `features/fdtd/education/ProblemBuilder.tsx`, `backend/projects/schemas.py` (extend)

**Concept**: Instructor creates a "problem project" with:
- Pre-configured geometry (partially or fully)
- Task description (Markdown)
- Expected results (target S₁₁, target directivity, target SAR limit, etc.)
- Hints (progressive — reveal on click)
- Locked elements (student can't modify certain structures)
- Assessment criteria (auto-checkable where possible)

**Data model** (extends project):
```
problem_config: {
  task_description: "Design a patch antenna resonant at 2.4 GHz with ≥6 dBi gain",
  target_metrics: [
    { name: "resonance_freq_ghz", target: 2.4, tolerance: 0.05, unit: "GHz" },
    { name: "directivity_dbi", target: 6.0, comparator: ">=", unit: "dBi" },
  ],
  hints: ["Patch length ≈ λ/(2√εᵣ)", "Try FR-4 substrate with h=1.6mm"],
  locked_elements: ["ground_plane", "substrate"],  // student can't delete these
  starter_design: { ... },  // initial design_state
  solution_design: { ... },  // instructor's reference solution (hidden)
}
```

**Student workflow**:
1. Browse problems in Course folders → "Start Problem"
2. Opens design page with pre-loaded geometry + task panel
3. Student modifies design, runs solver, checks results
4. "Check Solution" button → compares student results vs target metrics
5. Shows pass/fail per metric + optional hint reveal + instructor solution comparison

### 12.2 Guided Tutorial System

**New files**: `features/fdtd/education/TutorialOverlay.tsx`, `features/fdtd/education/tutorials/`

**Tutorial format** (JSON/Markdown):
```json
{
  "title": "FDTD 101: Wave Propagation in 1D",
  "steps": [
    {
      "target": "#domain-size-input",
      "content": "Set the domain to 1 meter. This is the space where we'll simulate wave propagation.",
      "action": "set_domain_size",
      "expected_value": [1.0, 0.01, 0.01]
    },
    {
      "target": "#add-source-button",
      "content": "Add a Gaussian pulse source. This creates a broadband excitation — the Fourier transform reveals all frequencies at once.",
      "theory": "A Gaussian pulse g(t) = exp(−(t−t₀)²/2σ²) has spectrum G(f) = σ√(2π)·exp(−2π²σ²f²)"
    }
  ]
}
```

**Built-in tutorials** (4 core, more addable):
1. **FDTD 101**: 1D wave propagation — Gaussian pulse, observe E/H, Mur ABC vs PEC reflection
2. **Materials & Loss**: 1D wave through dielectric slab — observe reflection/transmission, σ causes attenuation
3. **2D TM Mode**: Point source radiation — circular wavefronts, Mur ABC absorption
4. **Patch Antenna Design**: Guided build → simulate → check S₁₁ → view radiation pattern

**UI**: Spotlight overlay (dim everything except target element), step counter, skip/back, theory popup (rendered LaTeX: Ez, Hy, Maxwell).

### 12.3 Theory Context & Documentation Panel

**New file**: `features/fdtd/education/TheoryPanel.tsx`

- Collapsible right-side panel (toggle via ribbon or keyboard shortcut)
- Context-aware: shows relevant theory for the currently active control
  - Domain setup → explains Yee grid, cell size vs wavelength
  - Source config → Gaussian pulse spectrum, sampling theorem
  - Boundary config → Mur ABC derivation, reflection coefficient
  - Solver → CFL condition derivation, numerical dispersion
  - Postprocessing → near-to-far-field transform, Poynting theorem
- Rendered with KaTeX (LaTeX math) + diagrams (SVG/Mermaid)
- Links to textbook references (Taflove, Sullivan)

### 12.4 Grid Quality & Physics Indicators

Integrated into the design tab:

| Indicator | Location | Purpose |
|---|---|---|
| Cells/wavelength | Domain panel | λ/(dx) at highest freq — green ≥ 20, yellow ≥ 10, red < 10 |
| CFL number | Solver panel | Courant number × stability margin — shows dt |
| Numerical dispersion | Solver panel | Phase velocity error estimate at highest freq |
| Memory estimate | Solver panel | nx × ny (× nz) × fields × 8 bytes |
| Solve time estimate | Solver panel | Based on grid size heuristic (calibrated) |

### 12.5 Course Folder Integration

Extend the existing course folder system for educational content:

- Problem sets grouped in course folders (e.g., "Antenna Theory — Problem Set 3")
- Tutorials linked to course folders
- Student progress tracking: which tutorials completed, which problems passed
- Instructor dashboard (future): class-wide completion statistics

### 12.6 Tests

- Problem builder: create problem → student loads → modify → check results → pass/fail
- Tutorial system: step progression, spotlight targeting, theory panel content
- Physics indicators: cells/wavelength calculation correct for known setups
- Course folder: problem listed correctly, student can copy and start

**Estimated scope**: ~15 new files, ~3000 lines frontend, ~200 lines backend

---

## Phase 13: GPU Solver via Fargate Spot (DEFERRED)

> **Trigger**: Activate when 3D grids frequently exceed Lambda limits (Phase 11 deployed
> and users request grids > 40³). Zero cost until activated — no Fargate resources provisioned.

### Architecture (same as original Phase 6)

**Workflow**:
1. User explicitly clicks "Run on GPU" (never auto-selected)
2. Lambda writes grid to S3, submits job to SQS, returns `job_id`
3. Fargate Spot task (g4dn, CuPy) picks up job, solves, writes results to S3
4. Frontend polls `GET /api/fdtd/solve/status/{job_id}` until complete
5. Fargate auto-scales to 0 after 5 min idle

**Cost model**:
- Idle: **$0** (no ECS tasks, no instances)
- Per solve: ~$0.20–0.50 (Spot g4dn.xlarge for 1–3 min)
- SQS + S3: fractions of a cent

**Terraform module**: `terraform/modules/fargate-gpu/`
- ECS Cluster + Fargate Spot capacity provider
- Task Definition: g4dn, 4 vCPU, 16 GB, 1 GPU
- Auto-scaling: scale to 1 on SQS depth > 0, to 0 after idle
- SQS queue: `fdtd-gpu-jobs`
- S3 bucket: `fdtd-gpu-data`

**Endpoints**:
- `POST /api/fdtd/solve/gpu` → returns `{job_id, status: "queued"}`
- `GET /api/fdtd/solve/status/{job_id}` → `{status, progress_pct, result_url}`

**Frontend**:
- "Run on GPU" button (only shown when grid exceeds CPU limit)
- Job queue panel: status, estimated wait (cold start ~2 min)
- Result download when complete

**Prerequisites**: Phase 11 (3D engine) deployed and validated on CPU first.

---

## Updated Scope Boundaries

### Included in v2
- Everything from v1 (Phases 0–5) ✅
- Multi-solver project model (PEEC/FDTD/FEM-ready)
- Full preprocessor UI with 3D scene, structure dialogs, material library
- Complete postprocessor: heatmaps, time animation, radiation patterns, S-params, SAR, RCS, energy flow
- Polished solver UI with CFL/grid indicators and progress
- Full 3D FDTD engine (Lambda-sized grids ≤ ~40³)
- Educational features: problem builder, guided tutorials, theory panel
- Course folder integration for exercises

### Included when activated (Phase 13)
- GPU solver via Fargate Spot (pay-per-use, $0 idle)

### Excluded (future work)
- PML boundary conditions (Mur first, PML as extension)
- Dispersive materials (Drude, Lorentz, Debye models)
- Subgridding / non-uniform meshing
- MPI parallel domain decomposition
- CAD import (STEP, STL)
- FDTD-PEEC hybrid coupling
- Thin-wire / sub-cell models
- FEM solver integration (architecture ready, not implemented)
