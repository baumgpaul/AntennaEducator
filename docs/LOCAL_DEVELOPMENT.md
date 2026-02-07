# Local Development Guide

Step-by-step instructions to run the Antenna Simulator on your local machine.

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Python | 3.11+ | Backend services |
| Node.js | 18+ | Frontend build |
| Docker Desktop | Latest | DynamoDB Local, optional full-stack |
| Git | Latest | Version control |
| AWS CLI v2 | Latest | Only for AWS deployment (not required for local dev) |

## 1. Clone & Setup Python

```bash
git clone <repo-url>
cd AntennaEducator

# Create virtual environment
python -m venv .venv

# Activate
.venv\Scripts\activate          # Windows (PowerShell)
source .venv/bin/activate       # Linux / macOS

# Install with dev dependencies
pip install -e ".[dev]"
```

## 2. Setup DynamoDB Local

Projects and auth require DynamoDB. For local development, use DynamoDB Local:

```bash
# Start DynamoDB Local (in-memory, data lost on restart)
docker run -d -p 8000:8000 --name dynamodb-local amazon/dynamodb-local -jar DynamoDBLocal.jar -inMemory -sharedDb

# Create the required table
python dev_tools/setup_dynamodb_local.py
```

## 3. Run Backend Services

Each microservice runs as a separate process. Open 4 terminals:

```bash
# Terminal 1 — Preprocessor (port 8001)
uvicorn backend.preprocessor.main:app --port 8001 --reload

# Terminal 2 — Solver (port 8002)
uvicorn backend.solver.main:app --port 8002 --reload

# Terminal 3 — Postprocessor (port 8003)
uvicorn backend.postprocessor.main:app --port 8003 --reload

# Terminal 4 — Projects + Auth (port 8010)
# Set environment variables first:
$env:USE_COGNITO="false"
$env:USE_DYNAMODB="true"
$env:DYNAMODB_ENDPOINT_URL="http://localhost:8000"
$env:DYNAMODB_TABLE_NAME="antenna-simulator-local"
$env:JWT_SECRET_KEY="dev-secret-key-change-in-production"
uvicorn backend.projects.main:app --port 8010 --reload
```

Or use the convenience script (Windows):

```powershell
.\dev_tools\start_all_services.ps1
```

Verify all services are running:

```powershell
.\dev_tools\check_services.ps1
```

Each service exposes a health endpoint: `http://localhost:{port}/health`

## 4. Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:5173`. The frontend connects to backend services using URLs from `frontend/.env.development`.

## 5. Full Stack via Docker Compose

If you prefer running everything in containers:

```bash
docker-compose up --build
```

This starts:
- Frontend (nginx) on port 3000
- API Gateway (nginx reverse proxy) on port 8000
- All 4 backend services
- DynamoDB Local on port 8000 (internal)

Access the app at `http://localhost:3000`.

## 6. Run Tests

### Backend (unit tests)

```bash
pytest tests/unit/ -x -q           # Fast, ~1 second
pytest tests/unit/ -v               # Verbose output
pytest tests/unit/ --cov=backend    # With coverage report
```

### Frontend

```bash
cd frontend
npm test                            # Watch mode
npm test -- --run                   # Single run (CI mode)
npx tsc --noEmit                    # Type checking only
```

### Pre-commit hooks

```bash
pip install pre-commit
pre-commit install                  # One-time setup
pre-commit run --all-files          # Manual check
```

## Environment Variables Reference

### Core Variables (Projects/Auth)

| Variable | Default | Description |
|---|---|---|
| `USE_COGNITO` | `"false"` | `"true"` → AWS Cognito auth; `"false"` → local JWT auth |
| `USE_DYNAMODB` | `"true"` | Must be `"true"` (only DynamoDB backend is implemented) |
| `DYNAMODB_ENDPOINT_URL` | *(none)* | Set to `http://localhost:8000` for DynamoDB Local |
| `DYNAMODB_TABLE_NAME` | `"antenna-simulator-staging"` | Table name (use `antenna-simulator-local` locally) |
| `JWT_SECRET_KEY` | `"your-secret-key..."` | HMAC secret for local JWT signing |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | JWT token lifetime |

### Cognito Variables (only when `USE_COGNITO=true`)

| Variable | Default | Description |
|---|---|---|
| `COGNITO_REGION` | `"eu-west-1"` | AWS region |
| `COGNITO_USER_POOL_ID` | `""` | Cognito User Pool ID |
| `COGNITO_CLIENT_ID` | `""` | Cognito App Client ID |

### Service-Specific Variables

Each simulation service (preprocessor, solver, postprocessor) uses a `{SERVICE}_` prefix:

| Variable Pattern | Default | Description |
|---|---|---|
| `{SERVICE}_PORT` | 8001/8002/8003 | Service bind port |
| `{SERVICE}_DEBUG` | `False` | Debug mode |
| `{SERVICE}_CORS_ORIGINS` | `["http://localhost:3000", ...]` | CORS origins |

Solver-specific:

| Variable | Default | Description |
|---|---|---|
| `SOLVER_MAX_FREQUENCY_POINTS` | `1000` | Max frequency sweep points |
| `SOLVER_MAX_EDGES` | `10000` | Max mesh edges |
| `SOLVER_TIMEOUT_SECONDS` | `300` | Computation timeout |

Postprocessor-specific:

| Variable | Default | Description |
|---|---|---|
| `POSTPROCESSOR_DEFAULT_THETA_POINTS` | `181` | Far-field theta resolution |
| `POSTPROCESSOR_DEFAULT_PHI_POINTS` | `360` | Far-field phi resolution |

## Service Architecture

```
Browser → Frontend (Vite :5173)
              ↓ API calls
         ┌────────────────────────────────────────┐
         │  Preprocessor :8001  → Mesh generation │
         │  Solver :8002        → PEEC solve      │
         │  Postprocessor :8003 → Far-field/gain  │
         │  Projects :8010      → CRUD + Auth     │
         └────────────────────────────────────────┘
              ↓ persistence
         DynamoDB Local :8000
```

## Troubleshooting

### `ModuleNotFoundError: No module named 'backend'`

You need the virtualenv activated and the package installed in editable mode:

```bash
.venv\Scripts\activate
pip install -e ".[dev]"
```

### DynamoDB Local connection refused

Ensure the Docker container is running:

```bash
docker ps | Select-String dynamodb
# If not running:
docker run -d -p 8000:8000 --name dynamodb-local amazon/dynamodb-local -jar DynamoDBLocal.jar -inMemory -sharedDb
python dev_tools/setup_dynamodb_local.py
```

### CORS errors in browser

The simulation services (preprocessor, solver, postprocessor) add CORS middleware automatically when not running on Lambda. Ensure the frontend dev server URL (`http://localhost:5173`) is in the service's CORS origins.
