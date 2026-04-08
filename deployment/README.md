# Deployment Configuration

This directory contains configuration files for Docker standalone deployment.

## Structure

```
deployment/
└── nginx/
    └── nginx.conf    # API gateway reverse proxy config (used by docker-compose.yml)
```

## Usage

The `nginx.conf` is mounted into the `api-gateway` container defined in the root `docker-compose.yml`. It routes API requests to the appropriate backend service:

- `/api/antenna/*`, `/api/mesh/*` → Preprocessor (:8001)
- `/api/solve/*` → Solver (:8002)
- `/api/fields/*` → Postprocessor (:8003)
- `/api/projects/*`, `/api/auth/*` → Projects (:8010)

## Full Stack

```bash
# From project root (see docs/LOCAL_DEVELOPMENT.md for full walkthrough)
cp .env.example .env   # edit JWT_SECRET_KEY, ADMIN_EMAIL, ADMIN_PASSWORD
docker compose up -d --build
.\scripts\init-local.ps1   # seed DB + MinIO

# Access points:
# Frontend:      http://localhost:5173
# API Gateway:   http://localhost:8000
# MinIO Console: http://localhost:9001
# DynamoDB:      http://localhost:8888
# DynamoDB Local (internal): http://localhost:8000
```

See [docs/LOCAL_DEVELOPMENT.md](../docs/LOCAL_DEVELOPMENT.md) for full local development instructions.

## License

MIT
