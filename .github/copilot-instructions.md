# Copilot Instructions — Antenna Simulator

## Architecture Overview

Cloud-native electromagnetic simulation platform with a Python microservice backend and React frontend. Supports multiple simulation methods (PEEC now, FEM planned). **Primary deployment target is AWS** (Lambda + DynamoDB + S3 + Cognito + CloudFront). Standalone mode (Docker / on-prem) exists for university institute deployments. The backend, frontend and several UI features (visualization, postprocessing views) are **under active development** — expect evolving component structures.

### Backend Microservices (Python 3.11+ / FastAPI)

| Service | Port (local) | Lambda name (staging) | Entry point | Purpose |
|---|---|---|---|---|
| **Preprocessor** | 8001 | `antenna-simulator-preprocessor-staging` | `backend/preprocessor/main.py` | Geometry definition, mesh generation (dipole, loop, helix, rod) |
| **Solver** | 8002 | `antenna-simulator-solver-staging` | `backend/solver/main.py` | PEEC electromagnetic solver (impedance, currents, frequency sweep) |
| **Postprocessor** | 8003 | `antenna-simulator-postprocessor-staging` | `backend/postprocessor/main.py` | Far-field, near-field, radiation patterns, directivity |
| **Projects** | 8010 | `antenna-simulator-projects-staging` | `backend/projects/main.py` | Project CRUD, persistence. Auth endpoints re-mounted for combined Lambda. |
| **Auth** | 8011 | *(merged into Projects Lambda on AWS)* | `backend/auth/main.py` | Registration, login, user profile (standalone mode only) |

Each service has: `config.py` (Pydantic `BaseSettings`), `schemas.py` (Pydantic models), `lambda_handler.py` (Mangum wrapper), and `Dockerfile.lambda` (container image for Lambda).

### Shared Auth Package (`backend/common/auth/`)

Strategy pattern for authentication — selected once at startup via `USE_COGNITO` env var:

| Module | Purpose |
|---|---|
| `identity.py` | `UserIdentity` (plain Pydantic model — NOT ORM), `TokenResponse`, `TokenData` |
| `provider.py` | `AuthProvider` ABC: `validate_token()`, `register()`, `login()`, `get_user_profile()` |
| `local_provider.py` | `LocalAuthProvider`: bcrypt + HS256 JWT, uses `UserRepository` (DynamoDB) |
| `cognito_provider.py` | `CognitoAuthProvider`: Cognito SDK + JWKS signature verification |
| `factory.py` | `create_auth_provider()` → singleton based on `USE_COGNITO` |
| `dependencies.py` | `get_current_user()` FastAPI dependency → returns `UserIdentity` |

All protected endpoints use `user: UserIdentity = Depends(get_current_user)`.

### Frontend (React 18 + TypeScript + Vite)

Located in `frontend/`. Uses MUI 5, Redux Toolkit, React Router 6, Three.js/React Three Fiber for 3D visualization. Deployed to S3 + CloudFront at `https://antennaeducator.nyakyagyawa.com`.

### AWS Infrastructure (Terraform)

IaC in `terraform/environments/staging/main.tf` using modules in `terraform/modules/`. AWS profile: `antenna-staging`, region: `eu-west-1`. State stored in S3 with DynamoDB locking.

## Key Patterns

### Dual-Mode Auth (`USE_COGNITO` env var)
- **AWS production** (`USE_COGNITO=true`): `CognitoAuthProvider` — Cognito SDK for register/login, JWKS-verified RS256 JWTs for token validation.
- **Standalone/Docker** (`USE_COGNITO=false`): `LocalAuthProvider` — bcrypt passwords + locally-signed HS256 JWTs.
- Both modes use the same REST endpoints (`/api/auth/*`). The `get_current_user` FastAPI dependency (from `backend/common/auth/dependencies.py`) uses the configured `AuthProvider` singleton.
- User profile data (is_admin, is_locked) stored in DynamoDB in both modes.

### Repository Abstraction (`backend/common/repositories/`)
- `base.py` defines abstract `ProjectRepository` and `UserRepository` interfaces.
- `factory.py` selects implementation via `USE_DYNAMODB` env var — **DynamoDB only** (single-table design in `dynamodb_repository.py`).
- `user_repository.py` — concrete DynamoDB user CRUD (used by `LocalAuthProvider` and `CognitoAuthProvider`).

### Project Data Model
Projects are workspace persistence containers with **four JSON blob columns** + metadata:

| Field | Purpose |
|---|---|
| `name` | Project name |
| `description` | Human-readable description (plain text, NOT JSON) |
| `design_state` | Full snapshot: `{elements: [...], version: 2}` — antenna elements, sources, positions |
| `simulation_config` | Solver settings: `{method: "peec", requested_fields: [...]}` |
| `simulation_results` | Solver output + S3 references: `{frequency_sweep: {...}, result_keys: {...}}` |
| `ui_state` | Frontend-only: `{view_configurations: [...]}` — tabs, camera, view configs |

DynamoDB item: `PK=USER#{user_id}`, `SK=PROJECT#{project_id}`, GSI1 for lookup by project ID.

### Domain Models (`backend/common/models/`)
- Shared Pydantic models: `geometry.py` (AntennaElement, Mesh, Source, LumpedElement), `solver.py` (SolverJob, SolverConfig), `postprocessor.py`.
- These are used by preprocessor/solver/postprocessor services. The projects service only persists JSON blobs.

### Service Config Pattern
Each microservice uses `pydantic_settings.BaseSettings` with env prefix (e.g., `PREPROCESSOR_`). API routes prefixed with `/api`. Every service exposes `/health`. CORS middleware is conditionally added — skipped in Lambda (Function URLs handle CORS).

### Frontend: State Management
- 6 Redux slices in `frontend/src/store/`: `auth`, `projects`, `design`, `solver`, `postprocessing`, `ui`.
- Always use typed hooks: `useAppDispatch()` and `useAppSelector()` from `store/hooks.ts`.
- Async operations use `createAsyncThunk` calling functions from `frontend/src/api/`.

### Frontend: API Client Layer (`frontend/src/api/`)
- Separate Axios instances per backend service (`projectsClient`, `solverClient`, `preprocessorClient`, `postprocessorClient`) in `client.ts`.
- **Production URLs** (Lambda Function URLs) configured in `frontend/.env.production`. Local dev URLs in `.env.development`.
- Path alias `@/` maps to `frontend/src/`.

### Frontend: Feature-Based Structure
Components organized by feature under `frontend/src/features/`: `auth/`, `design/`, `projects/`, `results/`, `solver/`, `postprocessing/`, `home/`. Each feature exports pages via `index.ts`. The `design/` feature is the largest — contains antenna dialogs, 3D scene, solver/postprocessing tabs, and ribbon menu.

## Development & Deployment Commands

```powershell
# === AWS DEPLOYMENT (primary workflow) ===

# Rebuild & deploy ALL Lambda services (builds Docker images, pushes to ECR, updates Lambdas)
.\dev_tools\rebuild_lambda_images.ps1                    # Uses -Profile antenna-staging

# Deploy frontend to S3 + invalidate CloudFront
.\deploy-frontend.ps1                                    # Builds frontend, syncs to S3
.\deploy-frontend.ps1 -SkipBuild                         # Skip build, just sync

# Deploy only projects/auth service
.\deploy-auth-to-aws.ps1

# Terraform infrastructure changes
cd terraform/environments/staging
terraform plan -out=tfplan
terraform apply tfplan

# === LOCAL DEVELOPMENT ===

# Backend — run individual services (from repo root, venv activated)
uvicorn backend.preprocessor.main:app --port 8001 --reload
uvicorn backend.solver.main:app --port 8002 --reload
uvicorn backend.projects.main:app --port 8010 --reload

# Full stack via Docker (standalone / on-prem)
docker-compose up --build          # All services + DynamoDB Local

# Frontend dev server
cd frontend && npm run dev         # Vite on :5173

# === TESTING ===

# Backend tests (from repo root, venv activated)
pytest tests/                      # All tests
pytest tests/unit/                 # Unit tests only
pytest -m critical                 # Gold-standard validation (halfwave dipole reference)
pytest -m solver                   # Solver-specific tests
pytest --cov=backend               # With coverage

# Frontend tests
cd frontend && npm test            # Vitest with jsdom

# Dev tools — ad-hoc testing scripts
.\dev_tools\check_services.ps1     # Verify all services are running
.\dev_tools\test_dipole_api.ps1    # Quick API smoke test
```

## Pre-Commit CI/CD Checks (MANDATORY)

**Before every commit**, run the full CI/CD linting and test suite locally. These are the same checks that `buildspec-test.yml` runs in CodePipeline — a commit that fails any of them will break the build.

```powershell
# === Python checks (from repo root, venv activated) ===
black --check backend/ tests/           # Formatting
isort --check-only backend/ tests/      # Import order
ruff check backend/ tests/              # Linting
pytest tests/unit/ -x -q --tb=short     # Unit tests

# === Frontend checks (from frontend/) ===
cd frontend
npx tsc --noEmit                        # TypeScript compilation
npm run lint                            # ESLint (0 errors required; warnings OK)
cd ..
```

If `black` or `isort` report failures, auto-fix with `black backend/ tests/` and `isort backend/ tests/` before committing.

## Critical Conventions

- **Physical constants** centralized in `backend/common/constants.py` (`MU_0`, `EPSILON_0`, `C_0`, `Z_0`, etc.). Always import from there — never hardcode.
- **Line length**: 100 chars (Black formatter). Imports sorted by isort with `profile = "black"`.
- **Pydantic v2**: Use `model_config = ConfigDict(from_attributes=True)` (not the v1 `class Config: orm_mode`).
- **Node indexing**: 1-based for mesh nodes, 0 for ground/reference, negative for appended virtual nodes.
- **Complex numbers**: Backend uses Python `complex`; frontend serializes as `{real, imag}` objects via `ComplexNumber` schema.
- **Solver data flow**: Preprocessor builds mesh → Solver computes currents at frequency → Postprocessor derives fields/patterns. Frontend `solverSlice` and `designSlice` orchestrate this pipeline.
- **Project persistence**: Projects store `design_state`, `simulation_config`, `simulation_results`, and `ui_state` as JSON columns (DynamoDB map attributes), enabling full session restore. `description` is human-readable text only.
- **Lambda packaging**: Each service has a `Dockerfile.lambda` that builds a container image. Mangum wraps FastAPI for Lambda. Build context is always the repo root (`.`), Dockerfile path is `backend/<service>/Dockerfile.lambda`.
- **AWS naming convention**: Resources follow `antenna-simulator-{service}-{environment}` (e.g., `antenna-simulator-solver-staging`).
- **TDD principle**: Always follow Test-Driven Development — write tests first, make small incremental changes, and commit after code runs and tests pass.
- **Pre-commit checks**: Before every `git commit`, run **all** CI/CD checks from the "Pre-Commit CI/CD Checks" section above (`black`, `isort`, `ruff`, `pytest`, `tsc`, `npm run lint`). Never commit code that hasn't passed these checks.

## Known Issues & Workarounds

### Frontend Tests — `document is not defined` Failures
Running `npx vitest run` from the `frontend/` directory produces many failures (`ReferenceError: document is not defined`) in test files that import React components or DOM-dependent code. The vitest config (`frontend/vitest.config.ts`) sets `environment: 'jsdom'` globally, but many test files still fail with this error. **Pure logic tests** (e.g., `VectorRenderer.test.tsx` which tests math functions like `createSeededRandom`, `generateRandomIndices`, `computePoyntingVectors`) pass reliably. When verifying changes, run specific test files rather than the full suite:
```powershell
cd frontend
npx vitest run src/path/to/specific.test.tsx     # Run targeted tests
npx tsc --noEmit                                  # TypeScript check (always works)
```

### Pre-Commit Hook — `frontend-typecheck` Fails on Windows
The pre-commit hook runs `npx --prefix frontend tsc --noEmit`, which on Windows fails to pass `--noEmit` correctly to `tsc` (prints tsc help text instead of type-checking). **Workaround**: run `cd frontend && npx tsc --noEmit` manually — this works correctly. If pre-commit blocks a commit, use `git commit --no-verify` after manually verifying the typecheck passes.
