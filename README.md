# Antenna Educator

[![PR Checks](https://github.com/baumgpaul/AntennaEducator/actions/workflows/pr-checks.yml/badge.svg)](https://github.com/baumgpaul/AntennaEducator/actions/workflows/pr-checks.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![React 18](https://img.shields.io/badge/react-18-61DAFB.svg)](https://react.dev/)

An open-source electromagnetic simulation platform for learning and teaching antenna design. Built on the **PEEC method** (Partial Element Equivalent Circuit), it lets you design antennas, run full-wave EM simulations, and explore results — all from your browser.

**Live demo:** [antennaeducator.nyakyagyawa.com](https://antennaeducator.nyakyagyawa.com)

---

## Highlights

- **Design antennas visually** — dipole, loop, helix, rod, and custom wire geometries with lumped elements (R, L, C)
- **Full-wave PEEC solver** — impedance, currents, frequency sweeps, parameter studies
- **Rich postprocessing** — far-field & near-field patterns, directivity, gain, S-parameters, Smith charts
- **Interactive 3D scene** — Three.js visualization with current and field overlays
- **Multi-view results** — open up to 10 independent result panels (3D patterns + line plots)
- **Dual deployment** — run serverless on AWS (~$1.60/month) or self-hosted via Docker

## Architecture

Four independent Python microservices behind a React SPA:

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React + Three.js + Redux)                         │
└────┬──────────┬──────────┬──────────┬───────────────────────┘
     │          │          │          │
     ▼          ▼          ▼          ▼
┌─────────┐┌─────────┐┌─────────┐┌─────────┐
│Preproc. ││ Solver  ││Postproc.││Projects │
│  :8001  ││  :8002  ││  :8003  ││  :8010  │
│ Mesh gen││ PEEC EM ││Far-field││CRUD+Auth│
└─────────┘└─────────┘└─────────┘└────┬────┘
                                      │
                              ┌───────┴───────┐
                              │   DynamoDB    │
                              │  + S3 / MinIO │
                              └───────────────┘
```

Each service is a FastAPI app that runs as an **AWS Lambda** (container image) in production or as a plain **Docker container** locally. Auth supports both AWS Cognito and local JWT.

## Tech Stack

| Layer | Technologies |
|---|---|
| Backend | Python 3.11, FastAPI, NumPy, SciPy, Pydantic v2 |
| Frontend | React 18, TypeScript, Vite, MUI 5, Redux Toolkit, Three.js, Recharts |
| Infrastructure | AWS Lambda, DynamoDB, S3, CloudFront, Cognito, Terraform |
| Quality | pytest (~950 tests), Vitest, Black, isort, Ruff, pre-commit hooks |

## Quick Start

### Docker (recommended)

```bash
cp .env.example .env
# Edit .env — set JWT_SECRET_KEY, ADMIN_EMAIL, ADMIN_PASSWORD

docker compose up -d --build
python scripts/init_local_db.py   # creates DynamoDB table + admin user + S3 bucket
```

Open [http://localhost:5173](http://localhost:5173) and log in with your admin credentials.

### Local development

```bash
# Backend (Python venv)
python -m venv .venv && .venv/Scripts/activate   # or source .venv/bin/activate
pip install -e ".[dev]"
uvicorn backend.preprocessor.main:app --port 8001 --reload
# Repeat for solver (:8002), postprocessor (:8003), projects (:8010)

# Frontend
cd frontend && npm install && npm run dev
```

## Testing

```bash
# Backend
pytest tests/unit/ -x -q              # ~950 unit tests
pytest -m critical -v                 # Gold-standard half-wave dipole validation

# Frontend
cd frontend
npx tsc --noEmit                      # TypeScript check
npx vitest run                        # Vitest suite
```

The **half-wave dipole gold-standard test** validates the PEEC solver against analytical antenna theory (~73 Ω impedance, ~2.15 dBi directivity).

## Deploying to AWS

```bash
# Build Lambda images, push to ECR, update functions
.\dev_tools\rebuild_lambda_images.ps1

# Deploy frontend to S3 + invalidate CloudFront
.\deploy-frontend.ps1

# Smoke-test all endpoints
python dev_tools/test_aws_pipeline.py
```

Infrastructure is managed with Terraform in `terraform/`.

## Project Structure

```
AntennaEducator/
├── backend/
│   ├── preprocessor/         # Geometry & mesh generation
│   ├── solver/               # PEEC electromagnetic solver
│   ├── postprocessor/        # Far-field, near-field, directivity
│   ├── projects/             # Project CRUD, auth, persistence
│   ├── auth/                 # Standalone auth service (Docker only)
│   └── common/               # Shared: models, auth, constants, repositories
├── frontend/src/
│   ├── api/                  # Axios clients (one per service)
│   ├── features/             # Feature modules: design, results, solver, ...
│   └── store/                # Redux slices
├── scripts/                  # Deploy & init scripts
├── terraform/                # AWS infrastructure (Terraform)
├── tests/                    # Backend tests (pytest)
└── docker-compose.yml        # Full-stack local orchestration
```

## Roadmap

- **Optimizer tool** — automated antenna parameter optimization
- **FEM solver** — finite-element method for complex geometries
- **Course content** — guided tutorials and exercises for students

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branching strategy, code style, and PR workflow.

## License

MIT — see [LICENSE](LICENSE). Copyright © 2024–2026 Paul Baumgartner.
