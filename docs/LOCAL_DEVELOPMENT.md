# Local Development Guide

Step-by-step instructions to run the Antenna Educator on your local machine.

## Quick Start (Docker — recommended)

The fastest path to a fully working stack:

```PowerShell
# 1. Copy and edit the environment file
cp .env.example .env
#    → Set JWT_SECRET_KEY, ADMIN_EMAIL, ADMIN_PASSWORD at minimum

# 2. Start all services
docker compose up -d --build

# 3. Seed the database (creates table + admin user + MinIO bucket)
.\scripts\init-local.ps1    # Windows
# ./scripts/init-local.sh   # Linux / macOS

# 4. Open the app
Start-Process http://localhost:5173
```

| URL | Service |
|---|---|
| `http://localhost:5173` | Frontend |
| `http://localhost:8000` | API Gateway (nginx) |
| `http://localhost:9001` | MinIO Console |
| `http://localhost:8888` | DynamoDB Local (NoSQL Workbench) |

Log in with the credentials you set in `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Python | 3.11+ | Backend services, init scripts |
| Node.js | 18+ | Frontend build |
| Docker Desktop | Latest | Full-stack compose mode |
| Git | Latest | Version control |
| AWS CLI v2 | Latest | AWS deployment only |

---

## 1. First-Time Setup

```bash
git clone <repo-url>
cd AntennaEducator

# Create and activate virtual environment
python -m venv .venv
.venv\Scripts\activate          # Windows PowerShell
# source .venv/bin/activate     # Linux / macOS

# Install with dev dependencies
pip install -e ".[dev]"

# Copy and edit the environment file
cp .env.example .env
```

Minimum `.env` edits required for local development:

```dotenv
JWT_SECRET_KEY=<run: python -c "import secrets; print(secrets.token_urlsafe(32))">
ADMIN_EMAIL=admin@localhost
ADMIN_PASSWORD=your-chosen-password
```

---

## 2. Docker Compose — Full Stack

### Start everything

```PowerShell
docker compose up -d --build
```

Services started:

| Service | Internal port | Exposed port |
|---|---|---|
| `frontend` (nginx) | 80 | 5173 |
| `api-gateway` (nginx) | 80 | 8000 |
| `preprocessor` | 8001 | — |
| `solver` | 8002 | — |
| `postprocessor` | 8003 | — |
| `projects` | 8010 | 8010 |
| `auth` | 8011 | 8011 |
| `minio` | 9000/9001 | 9000/9001 |
| `dynamodb-local` | 8000 | 8888 |

### Seed the database (first run only)

```PowerShell
.\scripts\init-local.ps1      # Windows
./scripts/init-local.sh       # Linux / macOS
```

This is **idempotent** — safe to run multiple times.  It:
1. Creates the DynamoDB table (with PK/SK + GSI1 if missing)
2. Seeds the admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`
3. Creates the MinIO results bucket

### Useful Docker commands

```bash
# View logs
docker compose logs -f projects
docker compose logs -f solver

# Restart a single service after code change
docker compose up -d --build solver

# Stop everything (data persists in volumes)
docker compose down

# Wipe all data and start fresh
docker compose down -v
```

### Optional monitoring (Prometheus + Grafana)

```bash
docker compose --profile monitoring up -d
```

| URL | Service |
|---|---|
| `http://localhost:9090` | Prometheus |
| `http://localhost:3001` | Grafana (password: `GRAFANA_ADMIN_PASSWORD` in `.env`) |

Prometheus scrapes the `/metrics` endpoint of every backend service. Set `GRAFANA_ADMIN_PASSWORD` in `.env` before starting (default: `admin`).

---

## 3. Manual Development (without Docker)

Useful when iterating quickly on a single service.

### 3a. Start DynamoDB Local

```bash
docker run -d -p 8888:8000 --name dynamodb-local \
    amazon/dynamodb-local \
    -jar DynamoDBLocal.jar -dbPath /tmp -sharedDb
```

Then seed it:

```bash
# Set env vars manually or source .env
export DYNAMODB_ENDPOINT_URL=http://localhost:8888
export DYNAMODB_TABLE_NAME=antenna-simulator-local
export ADMIN_EMAIL=admin@localhost
export ADMIN_PASSWORD=admin
python scripts/init_local_db.py
```

### 3b. Start MinIO (if needed)

```bash
docker run -d -p 9000:9000 -p 9001:9001 \
    -e MINIO_ROOT_USER=minioadmin \
    -e MINIO_ROOT_PASSWORD=minioadmin \
    minio/minio server /data --console-address ":9001"
```

### 3c. Run backend services

Open 5 terminals (or use the convenience script below):

```bash
# Set env vars (adapt port for DynamoDB from step 3a)
export USE_COGNITO=false
export USE_DYNAMODB=true
export DYNAMODB_ENDPOINT_URL=http://localhost:8888
export DYNAMODB_TABLE_NAME=antenna-simulator-local
export JWT_SECRET_KEY=<your key from .env>
export AWS_ACCESS_KEY_ID=minioadmin
export AWS_SECRET_ACCESS_KEY=minioadmin
export USE_S3=true
export S3_ENDPOINT_URL=http://localhost:9000
export RESULTS_BUCKET_NAME=antenna-simulator-results-local

uvicorn backend.preprocessor.main:app --port 8001 --reload
uvicorn backend.solver.main:app --port 8002 --reload
uvicorn backend.postprocessor.main:app --port 8003 --reload
uvicorn backend.projects.main:app --port 8010 --reload
```

Or use the convenience scripts:

```PowerShell
.\dev_tools\start_all_services.ps1        # Windows
.\dev_tools\check_services.ps1            # Verify all services respond
```

### 3d. Run frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

---

## 4. Run Tests

### Backend (unit tests)

```bash
pytest tests/unit/ -x -q --tb=short     # Fast, ~2 seconds
pytest tests/unit/ -v                    # Verbose
pytest tests/unit/ --cov=backend         # With coverage
```

### Frontend

```bash
cd frontend
npx tsc --noEmit                         # TypeScript check
npm run lint                             # ESLint
npx vitest run                           # Full test suite
```

### Pre-commit check (run before every commit)

```PowerShell
# Python
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

---

## 5. Environment Variables Reference

### Auth

| Variable | Default | Description |
|---|---|---|
| `USE_COGNITO` | `false` | `true` → AWS Cognito; `false` → local JWT |
| `JWT_SECRET_KEY` | *(required)* | HMAC secret for local JWT signing |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | JWT lifetime |
| `COGNITO_REGION` | `eu-west-1` | Cognito region (Cognito mode only) |
| `COGNITO_USER_POOL_ID` | *(required)* | Cognito User Pool ID |
| `COGNITO_CLIENT_ID` | *(required)* | Cognito App Client ID |

### Admin Seeding

| Variable | Default | Description |
|---|---|---|
| `ADMIN_EMAIL` | *(required)* | Admin user email (created by init script) |
| `ADMIN_PASSWORD` | *(required)* | Admin user password (min 8 chars) |

### DynamoDB

| Variable | Default | Description |
|---|---|---|
| `USE_DYNAMODB` | `true` | Must be `true` |
| `DYNAMODB_ENDPOINT_URL` | *(none = AWS)* | `http://localhost:8888` for local |
| `DYNAMODB_TABLE_NAME` | `antenna-simulator-staging` | Table name |
| `DYNAMODB_LOCAL_PORT` | `8888` | Host port for DynamoDB Local in Docker |

### S3 / MinIO

| Variable | Default | Description |
|---|---|---|
| `USE_S3` | `true` | Enable S3 for result storage |
| `S3_ENDPOINT_URL` | *(none = AWS)* | `http://localhost:9000` for MinIO |
| `RESULTS_BUCKET_NAME` | `antenna-simulator-results-local` | Bucket name |
| `AWS_ACCESS_KEY_ID` | `minioadmin` | MinIO / AWS access key |
| `AWS_SECRET_ACCESS_KEY` | `minioadmin` | MinIO / AWS secret key |

### Solver Limits

| Variable | Default | Description |
|---|---|---|
| `SOLVER_MAX_FREQUENCY_POINTS` | `1000` | Max freq sweep points |
| `SOLVER_MAX_EDGES` | `10000` | Max mesh edges |
| `SOLVER_TIMEOUT_SECONDS` | `300` | Solver timeout |

### Monitoring (optional profile)

| Variable | Default | Description |
|---|---|---|
| `GRAFANA_ADMIN_PASSWORD` | `admin` | Grafana login password |
