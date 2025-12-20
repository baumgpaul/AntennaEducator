# Preprocessor Service

The Preprocessor service handles antenna geometry definition, mesh generation, and validation for the Antenna Simulator.

## Features

- FastAPI-based REST API
- Geometry definition and validation
- Mesh generation
- High-level antenna builders (dipole, loop, helix, etc.)
- Project management

## Running the Service

### Development Mode

```bash
# From the project root
python -m backend.preprocessor.main
```

The service will start on `http://localhost:8001`

### Using Uvicorn Directly

```bash
uvicorn backend.preprocessor.main:app --host 0.0.0.0 --port 8001 --reload
```

## API Endpoints

### Health Check

```bash
GET /health
```

Returns service health status.

**Response:**
```json
{
  "status": "healthy",
  "service": "preprocessor",
  "version": "0.1.0",
  "timestamp": "2025-12-20T10:24:58.160022"
}
```

### Service Status

```bash
GET /api/v1/status
```

Returns service configuration and available endpoints.

**Response:**
```json
{
  "service": "preprocessor",
  "version": "0.1.0",
  "debug": false,
  "endpoints": {
    "health": "/health",
    "docs": "/api/v1/docs",
    "openapi": "/api/v1/openapi.json"
  }
}
```

### API Documentation

- **Swagger UI**: http://localhost:8001/api/v1/docs
- **ReDoc**: http://localhost:8001/api/v1/redoc
- **OpenAPI Schema**: http://localhost:8001/api/v1/openapi.json

## Configuration

The service can be configured via environment variables with the `PREPROCESSOR_` prefix:

- `PREPROCESSOR_DEBUG`: Enable debug mode (default: `false`)
- `PREPROCESSOR_HOST`: Host to bind to (default: `0.0.0.0`)
- `PREPROCESSOR_PORT`: Port to listen on (default: `8001`)
- `PREPROCESSOR_CORS_ORIGINS`: Allowed CORS origins (default: `["*"]`)

## Testing

Run the tests for this service:

```bash
pytest tests/unit/test_preprocessor_service.py -v
```

## Next Steps

- Add geometry definition endpoints
- Implement antenna builders (dipole, loop, etc.)
- Add mesh generation logic
- Integrate with storage backend
