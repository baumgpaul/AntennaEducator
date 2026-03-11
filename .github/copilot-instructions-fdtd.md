# Copilot Instructions — FDTD Solver Integration

> **Scope**: This file applies to all work on the `fdtd-integration` branch and its child MRs. For general platform conventions, see `.github/copilot-instructions.md`. For FDTD-specific goals and progress, see `docs/FDTD_GUIDE.md`. For the full implementation plan, see `docs/FDTD_IMPLEMENTATION_PLAN.md`.

## Guiding Principles

### 1. Test-Driven Development (TDD)
- **Always write tests first.** For every new function, endpoint, or component — write the test before the implementation.
- Run the failing test, implement the minimum code to pass, then refactor.
- Commit after each green test cycle, not after large batches.
- Physics validation tests (`@pytest.mark.critical`) must pass against analytical references before a feature is considered done.
- Backend: `pytest tests/unit/fdtd/` and `pytest tests/integration/fdtd/`.
- Frontend: `cd frontend && npx vitest run src/features/fdtd/`.

### 2. SOLID Principles
- **Single Responsibility**: Each module does one thing. `engine_1d.py` does 1D FDTD stepping — not boundary conditions, not source injection, not postprocessing.
- **Open/Closed**: The array backend (`get_array_module()`) lets us swap NumPy for CuPy without changing solver code. New boundary conditions (PML) extend, not modify, existing `boundaries.py`.
- **Liskov Substitution**: All source types implement the same injection interface. All boundary types implement the same application interface.
- **Interface Segregation**: Preprocessor, solver, and postprocessor are separate services with their own schemas — no service depends on another's internals.
- **Dependency Inversion**: Solver depends on abstract array operations (`xp.zeros`, `xp.array`), not on concrete NumPy or CuPy.

### 3. Educational Clarity
- Code should be readable by a graduate student learning FDTD. Prefer clear variable names over compact expressions.
- Use comments for **physics** explanations (e.g., "Mur first-order ABC: E_new = E_old + (c*dt - dx)/(c*dt + dx) * (E_neighbor_new - E_current)"), not for obvious code.
- Keep functions short (< 50 lines). Each function should map to one concept in the FDTD algorithm.
- Docstrings on all public functions with a one-line purpose and physics context where relevant.

### 4. Cost Effectiveness
- **Lambda-first**: All services must run on Lambda (CPU/NumPy). GPU via Fargate Spot is an optional enhancement.
- **Zero idle cost**: Fargate GPU tasks scale to 0 when not in use. No always-on instances.
- **DynamoDB PAY_PER_REQUEST**: No provisioned capacity. Shared table with PEEC projects.
- **CloudFront PriceClass_100**: Cheapest edge locations.
- **S3 lifecycle rules**: Move old simulation results to Glacier after configurable period.
- **Small demo grids**: Lambda-friendly presets use grids ≤ 50³ cells, solvable in < 30s.

### 5. Ask Clarifying Questions
- Before implementing a large feature or making an architectural decision, **ask the user** about scope, constraints, and preferences.
- If a physics formula or algorithm choice is ambiguous, ask rather than guess.
- If a task crosses the boundary between FDTD and PEEC code, confirm the approach before touching shared files.

## FDTD Architecture

### Backend Microservices

| Service | Port | Lambda name (fdtd-staging) | Entry point | Purpose |
|---|---|---|---|---|
| **FDTD Preprocessor** | 8004 | `antenna-simulator-fdtd-preprocessor-fdtd-staging` | `backend/fdtd_preprocessor/main.py` | Structure definition, Yee grid generation, material assignment |
| **FDTD Solver** | 8005 | `antenna-simulator-fdtd-solver-fdtd-staging` | `backend/solver_fdtd/main.py` | FDTD time-domain solver (1D/2D, Mur ABC, field updates) |
| **FDTD Postprocessor** | 8006 | `antenna-simulator-fdtd-postprocessor-fdtd-staging` | `backend/fdtd_postprocessor/main.py` | Field extraction, SAR, radiation pattern, S-parameters |

### Frontend
- Route: `/fdtd/:projectId/design` — fully decoupled from PEEC (`/project/:projectId/design`)
- Own Redux slices: `fdtdDesignSlice`, `fdtdSolverSlice`, `fdtdPostprocessingSlice`
- Own feature directory: `frontend/src/features/fdtd/`
- Own API clients: `fdtdPreprocessor.ts`, `fdtdSolver.ts`, `fdtdPostprocessor.ts`

### Shared with PEEC (do NOT duplicate)
- `backend/common/constants.py` — physical constants (MU_0, EPSILON_0, C_0, Z_0)
- `backend/common/auth/` — authentication (Cognito + Local)
- `backend/common/repositories/` — project persistence (DynamoDB)
- `backend/common/models/solver_results.py` — `SweepResultEnvelope` with `SolverType.FDTD`
- `backend/projects/` — project CRUD (shared, projects differentiated by `project_type` field)
- Frontend: auth, projects, courses, layout components

## FDTD Data Flow

```
1. PREPROCESSOR (Geometry → Yee Grid)
   Input:  FdtdMeshRequest(geometry, structures, sources, boundaries)
   Output: YeeGrid(epsilon_r[nx,ny,nz], mu_r[nx,ny,nz], sigma[nx,ny,nz], source_cells, probe_positions)

2. SOLVER (Time-Domain Stepping)
   Input:  FdtdSolveRequest(grid_data, time_config, probes, requested_frequencies)
   Process:
     a. Initialize E and H field arrays (Yee staggered grid)
     b. Time-stepping loop:
        - Update H fields: H^(n+1/2) = H^(n-1/2) + dt/μ * curl(E^n)
        - Update E fields: E^(n+1) = C_a * E^n + C_b * curl(H^(n+1/2)) - source
        - Apply boundary conditions (Mur ABC)
        - Inject sources (Gaussian pulse, sinusoidal, TFSF)
        - Record probe data
        - Accumulate on-the-fly DFT at requested frequencies
     c. Extract frequency-domain quantities from DFT accumulators
   Output: FdtdSolveResponse(time_domain_data, frequency_domain_data, probe_results, s_parameters)

3. POSTPROCESSOR (Field Analysis)
   Input:  Time/frequency domain field data + mesh info
   Output: Field snapshots, radiation patterns, SAR maps, Poynting vectors, S-parameters
```

## FDTD Update Equations Reference

### 1D (Ez-Hy mode):
$$H_y^{n+1/2}[k] = H_y^{n-1/2}[k] + \frac{\Delta t}{\mu_0 \Delta x}\left(E_z^n[k] - E_z^n[k+1]\right)$$

$$E_z^{n+1}[k] = C_a[k] \cdot E_z^n[k] + C_b[k] \cdot \left(H_y^{n+1/2}[k-1] - H_y^{n+1/2}[k]\right)$$

Where $C_a = \frac{1 - \sigma\Delta t / 2\epsilon}{1 + \sigma\Delta t / 2\epsilon}$, $C_b = \frac{\Delta t / \epsilon\Delta x}{1 + \sigma\Delta t / 2\epsilon}$

### 2D TM (Ez, Hx, Hy):
$$H_x^{n+1/2}[i,j] = H_x^{n-1/2}[i,j] - \frac{\Delta t}{\mu_0 \Delta y}\left(E_z^n[i,j+1] - E_z^n[i,j]\right)$$

$$H_y^{n+1/2}[i,j] = H_y^{n-1/2}[i,j] + \frac{\Delta t}{\mu_0 \Delta x}\left(E_z^n[i+1,j] - E_z^n[i,j]\right)$$

$$E_z^{n+1}[i,j] = C_a \cdot E_z^n[i,j] + C_b \cdot \left(\frac{H_y^{n+1/2}[i,j] - H_y^{n+1/2}[i-1,j]}{\Delta x} - \frac{H_x^{n+1/2}[i,j] - H_x^{n+1/2}[i,j-1]}{\Delta y}\right)$$

### Mur First-Order ABC (1D right boundary):
$$E_z^{n+1}[N] = E_z^n[N-1] + \frac{c\Delta t - \Delta x}{c\Delta t + \Delta x}\left(E_z^{n+1}[N-1] - E_z^n[N]\right)$$

### CFL Stability Condition:
$$\Delta t \leq \frac{1}{c_0\sqrt{\frac{1}{\Delta x^2} + \frac{1}{\Delta y^2} + \frac{1}{\Delta z^2}}}$$

## Development Commands

```powershell
# === FDTD LOCAL DEVELOPMENT ===

# Backend — run FDTD services
uvicorn backend.fdtd_preprocessor.main:app --port 8004 --reload
uvicorn backend.solver_fdtd.main:app --port 8005 --reload
uvicorn backend.fdtd_postprocessor.main:app --port 8006 --reload

# Full stack via Docker
docker-compose --profile fdtd up --build

# === FDTD TESTING ===

pytest tests/unit/fdtd/ -v                    # FDTD unit tests
pytest tests/unit/fdtd/ -m critical           # Physics validation
pytest tests/integration/fdtd/ -v             # Integration tests
pytest --cov=backend/solver_fdtd --cov=backend/fdtd_preprocessor --cov=backend/fdtd_postprocessor

# Frontend FDTD tests
cd frontend && npx vitest run src/features/fdtd/
cd frontend && npx tsc --noEmit

# === FDTD DEPLOYMENT (fdtd-stage.nyakyagyawa.com) ===

# Deploy FDTD Lambdas
.\dev_tools\rebuild_fdtd_lambda_images.ps1

# Deploy frontend to fdtd-stage
.\deploy-fdtd-frontend.ps1

# Terraform (FDTD staging stack)
cd terraform/environments/fdtd-staging
terraform plan -out=tfplan
terraform apply tfplan
```

## Branch & Merge Strategy

- **Feature branch**: `fdtd-integration` (long-lived, tracks all FDTD work)
- **Child MRs**: Create short-lived branches from `fdtd-integration`, merge back via PR
  - Example: `fdtd/phase-1.1-domain-models` → PR to `fdtd-integration`
- **CI/CD**: PRs labeled `deploy-to-fdtd-staging` trigger build + deploy to `fdtd-stage.nyakyagyawa.com`
- **Final merge**: When FDTD feature is complete, `fdtd-integration` → `main` via PR
- **Never push directly** to `fdtd-integration` or `main` — always use PRs

## File Naming Conventions

- Backend FDTD services: `backend/fdtd_preprocessor/`, `backend/solver_fdtd/`, `backend/fdtd_postprocessor/`
- FDTD domain models: `backend/common/models/fdtd.py`
- Frontend FDTD feature: `frontend/src/features/fdtd/`
- Frontend FDTD types: `frontend/src/types/fdtd.ts`
- Frontend FDTD API: `frontend/src/api/fdtdPreprocessor.ts`, `fdtdSolver.ts`, `fdtdPostprocessor.ts`
- FDTD Redux slices: `frontend/src/store/fdtdDesignSlice.ts`, `fdtdSolverSlice.ts`, `fdtdPostprocessingSlice.ts`
- Tests: `tests/unit/fdtd/`, `tests/integration/fdtd/`
- Terraform: `terraform/environments/fdtd-staging/`
- CI/CD: `.github/workflows/fdtd-build-and-deploy.yml`

## Critical FDTD Conventions

- **Physical constants**: Import from `backend/common/constants.py` — never hardcode c₀, μ₀, ε₀.
- **Array backend**: Always use `xp = get_array_module()` from `engine_common.py`. Never import numpy/cupy directly in engine code.
- **Yee grid indexing**: 0-based. E-fields at integer indices, H-fields at half-integer positions (stored at same index, physically offset by Δx/2).
- **Time indexing**: E-fields at integer time steps n, H-fields at half-steps n+1/2 (leapfrog scheme).
- **Units**: SI throughout. Frequency in Hz, length in meters, time in seconds.
- **Courant number**: Default 0.99 of CFL limit. Always validate before solve.
- **Source injection**: Prefer soft (additive) sources for transparency. Hard sources only for PEC-backed ports.
- **Memory estimation**: Provide memory estimate before solve starts. Warn if > 80% of Lambda memory limit.
