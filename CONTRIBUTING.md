# Contributing to Antenna Educator

Thank you for your interest in contributing!  This project is licensed under the **MIT License** (see [LICENSE](LICENSE)).

This guide covers everything you need to get started.

## Branching Strategy — GitHub Flow

We use **GitHub Flow**: `main` is always deployable.

1. Create a feature branch from `main`: `git checkout -b feature/my-feature`
2. Make your changes with small, focused commits
3. Push your branch and open a Pull Request
4. Ensure all checks pass (tests, linting)
5. Get a code review, then merge

**Branch naming conventions:**
- `feature/short-description` — new features
- `fix/short-description` — bug fixes
- `refactor/short-description` — code restructuring
- `docs/short-description` — documentation only

## Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add helix antenna builder
fix: correct far-field theta angle range
refactor: extract impedance calculation to helper
docs: update deployment guide
test: add solver convergence tests
chore: update dependencies
```

## Code Style

### Python (backend)

- **Formatter:** [Black](https://black.readthedocs.io/) with line-length 100
- **Import sorter:** [isort](https://pycqa.github.io/isort/) with `profile = "black"`
- **Linter:** [Ruff](https://docs.astral.sh/ruff/)
- **Type hints:** Use type annotations for function signatures
- **Pydantic:** v2 style — use `model_config = ConfigDict(...)` (not v1 `class Config`)

Configuration lives in [pyproject.toml](pyproject.toml).

### TypeScript (frontend)

- **Linter:** ESLint with React + TypeScript plugins
- **Formatter:** Prettier
- **Imports:** Use the `@/` path alias for `frontend/src/`
- **State:** Use typed hooks `useAppDispatch()` / `useAppSelector()` from `store/hooks.ts`

## Pre-commit Hooks

We use [pre-commit](https://pre-commit.com/) to enforce quality **before every commit**:

```bash
pip install pre-commit
pre-commit install
```

Every `git commit` will automatically run:
- **Python:** Black, isort, Ruff, pytest unit tests
- **Frontend:** ESLint, TypeScript type-check, Vitest unit tests
- **General:** trailing whitespace, YAML/JSON validation, large file check

> **You must fix all issues before your commit is accepted.** This ensures broken code never reaches the remote.

To run hooks on all files manually:

```bash
pre-commit run --all-files
```

## CI/CD Pipeline

### On Pull Request (automatic — AWS CodeBuild)

Every PR to `main` runs the checks defined in `buildspec-test.yml`:
1. **Backend** — Black, isort, Ruff, pytest unit tests
2. **Frontend** — ESLint, TypeScript type-check, Vitest

PRs cannot be merged unless all checks pass.

### On Merge to main → AWS CodePipeline (automatic)

When code is merged to `main`, the AWS CodePipeline triggers:

1. **Source** — pulls latest `main` from GitHub
2. **Test** — runs full lint + test suite in CodeBuild (`buildspec-test.yml`)
3. **Deploy** — builds 4 Docker images, pushes to ECR, updates Lambda functions,
   deploys frontend to S3, invalidates CloudFront (`buildspec-deploy.yml`)

To deploy manually at any time:

```PowerShell
.\scripts\deploy.ps1 -Environment staging    # staging
.\scripts\deploy.ps1 -Environment production  # production
.\scripts\promote.ps1                          # staging → production image promotion
```

## Testing Requirements

All PRs must pass the full pre-commit suite:

```PowerShell
# Python (from repo root, venv activated)
black --check backend/ tests/
isort --check-only backend/ tests/
ruff check backend/ tests/
pytest tests/unit/ -x -q --tb=short

# Frontend
cd frontend
npx tsc --noEmit
npm run lint
npx vitest run
cd ..
```

## Project Structure Overview

```
backend/
├── preprocessor/    # Geometry + mesh generation (port 8001)
├── solver/          # PEEC electromagnetic solver (port 8002)
├── postprocessor/   # Far-field, radiation patterns (port 8003)
├── projects/        # Project CRUD + persistence (port 8010)
├── auth/            # Authentication (port 8011, standalone only)
└── common/          # Shared: models, auth, repositories, constants
frontend/
├── src/
│   ├── api/         # Axios clients per backend service
│   ├── features/    # Feature-based components (design/, results/, etc.)
│   └── store/       # Redux slices (auth, projects, design, solver, etc.)
tests/
├── unit/            # Fast unit tests (run on every PR)
└── integration/     # Integration tests (require running services)
```

## Key Conventions

- **Physical constants:** Always import from `backend/common/constants.py` — never hardcode
- **Node indexing:** 1-based for mesh nodes, 0 for ground/reference
- **Complex numbers:** Backend uses Python `complex`; frontend serializes as `{real, imag}`
- **API prefix:** All endpoints start with `/api/`
- **Environment config:** Each service uses `pydantic_settings.BaseSettings` with env prefix

## Getting Started

See the [Quick Start section in README.md](README.md#quick-start) for setup instructions.
