# Contributing to Antenna Simulator

Thank you for your interest in contributing! This guide covers everything you need to get started.

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

We use [pre-commit](https://pre-commit.com/) to enforce style before commits:

```bash
pip install pre-commit
pre-commit install
```

This runs Black, isort, Ruff, and general checks (trailing whitespace, YAML validation) automatically on `git commit`.

To run hooks on all files manually:

```bash
pre-commit run --all-files
```

## Testing Requirements

All PRs must pass:

### Backend

```bash
# Activate virtualenv first
pytest tests/unit/ -x -q
```

### Frontend

```bash
cd frontend
npm test -- --run
```

### Type checking (frontend)

```bash
cd frontend
npx tsc --noEmit
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

See [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md) for setup instructions.

See [docs/AWS_DEPLOYMENT.md](docs/AWS_DEPLOYMENT.md) for deploying to staging.
