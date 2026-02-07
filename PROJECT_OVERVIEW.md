# PROJECT OVERVIEW: PEEC Antenna Simulator

**Cloud-Native Electromagnetic Simulation Platform**

Version: 0.4.0  
Last Updated: February 7, 2026  
**Domain**: https://antennaeducator.nyakyagyawa.com  
**AWS Region**: eu-west-1 (Ireland)

---

## Executive Summary

Modern, cloud-native electromagnetic simulation platform built on validated PEEC (Partial Element Equivalent Circuit) methodology. Python microservice backend with React frontend. Supports AWS Lambda deployment (primary) and Docker standalone mode for university/institute use.

### Key Capabilities
- **Antenna Design**: Dipole, loop, helix, rod, custom wire geometries with lumped elements
- **PEEC Solver**: Full-wave EM analysis — impedance, currents, frequency sweeps
- **Postprocessing**: Far-field/near-field, radiation patterns, directivity, field visualization
- **3D Visualization**: Interactive Three.js scene with current/voltage/field overlays
- **Multi-View Results**: Up to 10 independent result views with 3D and line plot modes
- **Cloud-Native**: Serverless on AWS (~$1.60/month at low usage), or Docker on-prem

---

## Architecture

### Backend Microservices (Python 3.11+ / FastAPI)

| Service | Port | Lambda Name | Purpose |
|---------|------|-------------|---------|
| **Preprocessor** | 8001 | `antenna-simulator-preprocessor-staging` | Geometry definition, mesh generation |
| **Solver** | 8002 | `antenna-simulator-solver-staging` | PEEC EM solver (impedance, currents) |
| **Postprocessor** | 8003 | `antenna-simulator-postprocessor-staging` | Far-field, near-field, directivity |
| **Projects** | 8010 | `antenna-simulator-projects-staging` | Project CRUD, persistence, auth |
| **Auth** | 8011 | *(merged into Projects Lambda)* | Registration, login (standalone only) |

**Database**: DynamoDB single-table design (`PK=USER#{user_id}`, `SK=PROJECT#{project_id}`).  
**Auth**: Strategy pattern — Cognito (AWS) or local JWT+bcrypt (Docker), selected via `USE_COGNITO` env var.

### Frontend (React 18 + TypeScript + Vite)

Located in `frontend/`. MUI 5 + Redux Toolkit + React Router 6 + Three.js/React Three Fiber.  
6 Redux slices: `auth`, `projects`, `design`, `solver`, `postprocessing`, `ui`.  
Feature-based structure under `frontend/src/features/`.

### Infrastructure (Terraform)

IaC in `terraform/`. AWS profile `antenna-staging`. State in S3 with DynamoDB locking.  
Services deployed as Lambda container images via ECR. Frontend on S3 + CloudFront.

---

## Project Data Model

Projects store four JSON blobs in DynamoDB:

| Field | Content |
|-------|---------|
| `design_state` | `{elements: [...], version: 2}` — antenna elements, sources, positions |
| `simulation_config` | `{method: "peec", requested_fields: [...]}` — solver settings |
| `simulation_results` | `{frequency_sweep: {...}, result_keys: {...}}` — solver output |
| `ui_state` | `{view_configurations: [...]}` — tabs, camera, view configs |

---

## Codebase Statistics

| Area | Count |
|------|-------|
| Backend Python files | 62 |
| Frontend TS/TSX files | 178 |
| Frontend test files | 46 |
| Backend test files | 28 |
| Backend tests (pytest) | ~325 passing |
| Total git commits | 219 |

---

## Development & Deployment

```powershell
# === AWS DEPLOYMENT ===
.\dev_tools\rebuild_lambda_images.ps1       # Build + push all Lambda images
.\deploy-frontend.ps1                       # Build frontend, sync to S3, invalidate CloudFront
.\deploy-auth-to-aws.ps1                    # Deploy projects/auth service only

# === LOCAL DEVELOPMENT ===
uvicorn backend.preprocessor.main:app --port 8001 --reload
uvicorn backend.solver.main:app --port 8002 --reload
uvicorn backend.projects.main:app --port 8010 --reload
cd frontend && npm run dev                  # Vite on :5173

# === DOCKER (standalone) ===
docker-compose up --build                   # All services + DynamoDB Local

# === TESTING ===
pytest tests/                               # Backend (from repo root, venv activated)
pytest -m critical                          # Gold-standard halfwave dipole validation
cd frontend && npm test                     # Frontend (Vitest + jsdom)
```

---

## Simulation Data Flow

```
Preprocessor (mesh) → Solver (currents @ frequency) → Postprocessor (fields/patterns)
```

Frontend `designSlice` + `solverSlice` orchestrate this pipeline. Results stored in project `simulation_results` blob.

---

## Key Conventions

- **Physical constants**: `backend/common/constants.py` — never hardcode
- **Pydantic v2**: `model_config = ConfigDict(from_attributes=True)`
- **Node indexing**: 1-based mesh nodes, 0 = ground, negative = virtual
- **Complex numbers**: Python `complex` on backend; `{real, imag}` objects on frontend
- **Line length**: 100 chars (Black + isort)
- **AWS naming**: `antenna-simulator-{service}-{environment}`
- **TDD**: Write tests first, commit after tests pass

---

## Current Status & Next Steps

### ✅ Completed
- Full PEEC solver with frequency sweep
- 5 microservices deployed to AWS Lambda
- DynamoDB single-table persistence (replaced PostgreSQL)
- Cognito + local JWT auth (strategy pattern)
- Frontend: design workspace, 3D visualization, postprocessing views
- Multi-view result system (3D + line plots, up to 10 views)
- PDF and VTU export
- Custom domain with SSL (antennaeducator.nyakyagyawa.com)
- Terraform IaC for all AWS resources

### ⏳ In Progress
- CI/CD pipeline (CodePipeline/CodeBuild)
- 3D field data rendering in postprocessing views
- Frontend test coverage improvements

### 🔮 Future
- FEM solver integration
- Optimization algorithms (genetic, particle swarm)
- ML surrogate models
- Inverse solver
- Multi-user collaboration
- Credit/billing system
