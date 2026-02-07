# Antenna Educator

<!-- Badges (CI pipeline — coming soon)
![Build](https://img.shields.io/badge/build-passing-brightgreen)
![Tests](https://img.shields.io/badge/tests-passing-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-85%25-yellow)
-->

Cloud-native electromagnetic simulation platform based on the PEEC (Partial Element Equivalent Circuit) method. Python microservice backend, React frontend, deployed to AWS Lambda or run locally via Docker.

**Live:** [antennaeducator.nyakyagyawa.com](https://antennaeducator.nyakyagyawa.com)

## Features

- **Antenna design** — dipole, loop, helix, rod, custom wire geometries with lumped elements (RLC)
- **PEEC solver** — full-wave EM analysis: impedance, currents, frequency sweeps
- **Postprocessing** — far-field/near-field, radiation patterns, directivity, gain
- **3D visualization** — interactive Three.js scene with current/field overlays
- **Multi-view results** — up to 10 independent result views (3D + line plots)
- **Dual deployment** — serverless on AWS (~$1.60/month at low usage) or Docker on-prem

## Architecture

```mermaid
graph TB
    Browser["Browser"] --> CloudFront["CloudFront / Vite Dev"]
    CloudFront --> S3["S3 (Frontend Bundle)"]

    Browser -->|API calls| Preprocessor["Preprocessor :8001<br/>Mesh generation"]
    Browser -->|API calls| Solver["Solver :8002<br/>PEEC solve"]
    Browser -->|API calls| Postprocessor["Postprocessor :8003<br/>Far-field / gain"]
    Browser -->|API calls| Projects["Projects :8010<br/>CRUD + Auth"]

    Projects --> DynamoDB["DynamoDB"]
    Projects --> Cognito["Cognito (AWS) /<br/>Local JWT (Docker)"]
```

| Service | Port | Lambda | Purpose |
|---|---|---|---|
| **Preprocessor** | 8001 | `antenna-simulator-preprocessor-staging` | Geometry definition, mesh generation |
| **Solver** | 8002 | `antenna-simulator-solver-staging` | PEEC EM solver (impedance, currents) |
| **Postprocessor** | 8003 | `antenna-simulator-postprocessor-staging` | Far-field, near-field, directivity |
| **Projects** | 8010 | `antenna-simulator-projects-staging` | Project CRUD, auth, persistence |

## Tech Stack

| Layer | Technologies |
|---|---|
| **Backend** | Python 3.11+, FastAPI, NumPy, SciPy, Pydantic v2 |
| **Frontend** | React 18, TypeScript, Vite, MUI 5, Redux Toolkit, Three.js |
| **Infrastructure** | AWS Lambda (containers), DynamoDB, S3, CloudFront, Cognito, Terraform |
| **Dev tools** | pytest, Vitest, Black, isort, ruff, pre-commit |

## Quick Start

### Docker (full stack)

```bash
docker-compose up --build
# Frontend: http://localhost:3000
```

### Local development

```bash
# Backend
python -m venv .venv && .venv\Scripts\activate    # Windows
pip install -e ".[dev]"
uvicorn backend.preprocessor.main:app --port 8001 --reload
# ... repeat for solver (8002), postprocessor (8003), projects (8010)

# Frontend
cd frontend && npm install && npm run dev          # http://localhost:5173
```

See [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md) for full setup with DynamoDB Local, environment variables, and troubleshooting.

## Testing

```bash
# Backend
pytest tests/unit/ -x -q                   # Fast unit tests
pytest -m critical -v                      # Gold-standard dipole validation

# Frontend
cd frontend && npm test
```

The **half-wave dipole gold standard** test validates solver correctness against fundamental antenna theory (~73 Ω impedance, ~2.15 dBi directivity). This test must pass before merging solver changes.

## Project Structure

```
AntennaEducator/
├── backend/                  # Python microservices
│   ├── preprocessor/         # Geometry & mesh generation
│   ├── solver/               # PEEC electromagnetic solver
│   ├── postprocessor/        # Field computation & analysis
│   ├── projects/             # Project CRUD & auth endpoints
│   ├── auth/                 # Standalone auth service (Docker only)
│   └── common/               # Shared models, auth, constants, repositories
├── frontend/                 # React + TypeScript + Vite
│   └── src/
│       ├── api/              # Axios client layer (per service)
│       ├── features/         # Feature-based components (design, results, ...)
│       └── store/            # Redux slices (auth, projects, design, solver, ...)
├── terraform/                # AWS infrastructure-as-code
│   ├── environments/staging/ # Staging environment config
│   └── modules/              # Reusable Terraform modules
├── tests/                    # Backend test suite
├── dev_tools/                # Development & deployment scripts
├── docs/                     # Documentation
└── docker-compose.yml        # Full-stack local orchestration
```

## Documentation

| Document | Description |
|---|---|
| [Local Development](docs/LOCAL_DEVELOPMENT.md) | Python setup, DynamoDB Local, running services, env vars |
| [AWS Deployment](docs/AWS_DEPLOYMENT.md) | Terraform, Lambda deployment, frontend deploy, smoke tests |
| [Contributing](CONTRIBUTING.md) | Branching strategy, code style, PR workflow |
| [Backend Implementation](docs/BACKEND_IMPLEMENTATION.md) | Technical design and solver internals |
| [Reference Verification](docs/REFERENCE_VERIFICATION.md) | Solver validation against reference PEEC results |

## License

*(To be determined)*

## Contact

Paul Baumgartner — baumg.paul@gmail.com
