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

## Phase 5: Demo Examples

### Project Data Files

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

### Course Integration

**Seed script**: `dev_tools/seed_fdtd_demo_projects.py`

Creates:
1. Course folder "FDTD Demonstrations" (admin-owned, `is_course=true`)
2. Four sub-folders: "Broadband Antenna", "GPR Simulation", "Bio EM SAR", "EMC/EMI"
3. Pre-populated projects in each sub-folder with `design_state`, `simulation_config`, and optionally pre-computed `simulation_results`
4. Users can browse in Courses tab and copy to their workspace

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

Phase 5 ─── ⬜ pending (demos)

Phase 6 ─── ⬜ pending (GPU/Fargate Spot)
```

---

## Scope Boundaries

### Included in v1
- 1D and 2D FDTD solvers with Mur ABC
- Architecture supports 3D extension (array dimensions parametric)
- Parametric structure creation (waveguide, PCB, patch antenna) + basic geometry editing
- Material library with custom material support
- Full frontend with own tabs, routes, Redux state
- 4 demo examples with small/large presets
- CI/CD to fdtd-stage.nyakyagyawa.com
- GPU solver via Fargate Spot (CuPy)
- Project type selection (PEEC vs FDTD)

### Excluded from v1 (future work)
- Full 3D FDTD engine (architecture ready, not implemented)
- PML boundary conditions (Mur first, PML as extension)
- Dispersive materials (Drude, Lorentz, Debye models)
- Subgridding / non-uniform meshing
- MPI parallel domain decomposition
- Import of CAD geometry (STEP, STL files)
- FDTD-PEEC coupling / hybrid solver
- Thin-wire / sub-cell models
