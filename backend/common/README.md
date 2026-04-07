# `backend/common/` — Shared Foundation Layer

Shared modules used by all backend microservices (preprocessor, solver, postprocessor, projects, auth).

## Structure

```
common/
├── auth/               # Authentication strategy (dual-mode)
│   ├── provider.py          # AuthProvider ABC
│   ├── local_provider.py    # bcrypt + HS256 JWT (standalone mode)
│   ├── cognito_provider.py  # AWS Cognito + JWKS RS256 (cloud mode)
│   ├── factory.py           # Singleton factory (USE_COGNITO env var)
│   ├── dependencies.py      # get_current_user() FastAPI dependency
│   ├── identity.py          # UserIdentity, TokenData, TokenResponse models
│   └── token_costs.py       # Endpoint token costs, usage logging
├── models/             # Shared Pydantic domain models
│   ├── geometry.py          # AntennaElement, Mesh, Source, LumpedElement
│   ├── solver.py            # SolverJob, SolverConfig
│   ├── solver_results.py    # SweepResultEnvelope, PortResult
│   ├── postprocessor.py     # Far-field / near-field models
│   └── variables.py         # Variable, VariableContext, expression resolver
├── repositories/       # Data access layer (DynamoDB)
│   ├── base.py              # Abstract repository interfaces
│   ├── factory.py           # get_project_repository() factory
│   ├── dynamodb_repository.py   # DynamoDB project CRUD
│   └── user_repository.py       # DynamoDB user CRUD
├── storage/            # S3/MinIO file storage
├── utils/              # Utilities
│   ├── serialization.py     # Complex/NumPy serialization, NumpyEncoder
│   ├── expressions.py       # Mathematical expression evaluator
│   ├── validation.py        # Input validators (positive, 3D vector, frequency)
│   ├── error_handler.py     # Global error handler middleware (correlation IDs, 413/500)
│   └── logging_config.py    # Unified logging (JSON in Lambda, plain text locally)
└── constants.py        # Physical constants (MU_0, EPSILON_0, C_0, Z_0)
```

## Authentication Pattern

Dual-mode auth selected at startup via `USE_COGNITO` env var:

| Mode | Provider | Token type | Use case |
|------|----------|-----------|----------|
| `USE_COGNITO=false` | `LocalAuthProvider` | HS256 JWT | Docker / standalone |
| `USE_COGNITO=true` | `CognitoAuthProvider` | RS256 (Cognito JWKS) | AWS deployment |

All protected endpoints use:
```python
user: UserIdentity = Depends(get_current_user)
```

Profile data is cached in-memory for 60s to reduce DynamoDB reads.

## Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `USE_COGNITO` | `false` | No | Enable Cognito auth |
| `JWT_SECRET_KEY` | *(insecure default)* | **Yes (production)** | JWT signing secret (local mode) |
| `COGNITO_USER_POOL_ID` | `""` | Yes (Cognito mode) | Cognito pool ID |
| `COGNITO_CLIENT_ID` | `""` | Yes (Cognito mode) | Cognito app client ID |
| `COGNITO_REGION` | `eu-west-1` | No | AWS region |
| `USE_DYNAMODB` | `true` | No | Enable DynamoDB repositories |
| `DYNAMODB_TABLE_NAME` | `antenna-simulator-staging` | No | DynamoDB table name |
| `DYNAMODB_ENDPOINT_URL` | *(none)* | No | DynamoDB Local URL |
