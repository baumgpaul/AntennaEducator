# Backend — Antenna Educator

Python microservice backend using FastAPI + Pydantic v2.

## Structure

```
backend/
├── common/                  # Shared code
│   ├── auth/                # Auth strategy (Cognito / local JWT)
│   │   ├── provider.py      # AuthProvider ABC
│   │   ├── cognito_provider.py
│   │   ├── local_provider.py
│   │   ├── factory.py       # Singleton factory (USE_COGNITO env var)
│   │   ├── dependencies.py  # get_current_user() FastAPI dependency
│   │   └── identity.py      # UserIdentity, TokenResponse models
│   ├── models/
│   │   └── geometry.py      # AntennaElement, Mesh, Source, LumpedElement
│   ├── repositories/        # DynamoDB persistence
│   │   ├── base.py          # Abstract interfaces
│   │   ├── dynamodb_repository.py
│   │   ├── user_repository.py
│   │   └── factory.py
│   ├── utils/               # Validation, serialization helpers
│   └── constants.py         # Physical constants (MU_0, C_0, Z_0, ...)
├── preprocessor/            # Geometry & mesh generation (:8001)
├── solver/                  # PEEC electromagnetic solver (:8002)
├── postprocessor/           # Far-field, near-field, patterns (:8003)
├── projects/                # Project CRUD + auth endpoints (:8010)
├── auth/                    # Standalone auth service (:8011, Docker only)
└── Dockerfile               # Shared container image for docker-compose
```

Each service has: `main.py` (FastAPI app), `config.py` (Pydantic BaseSettings), `schemas.py`, `lambda_handler.py` (Mangum wrapper), `Dockerfile.lambda`.

## Running

```bash
# From repo root, venv activated
uvicorn backend.preprocessor.main:app --port 8001 --reload
uvicorn backend.solver.main:app --port 8002 --reload
uvicorn backend.postprocessor.main:app --port 8003 --reload
uvicorn backend.projects.main:app --port 8010 --reload
```

See [docs/LOCAL_DEVELOPMENT.md](../docs/LOCAL_DEVELOPMENT.md) for full setup instructions.

