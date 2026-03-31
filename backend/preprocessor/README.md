# Preprocessor Service

The Preprocessor service handles antenna geometry definition, mesh generation, and validation for the Antenna Simulator.

## Features

- FastAPI-based REST API
- Geometry definition and validation
- Mesh generation
- High-level antenna builders (dipole, loop, rod, etc.)
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

### API Documentation

- **Swagger UI**: http://localhost:8001/api/docs
- **ReDoc**: http://localhost:8001/api/redoc
- **OpenAPI Schema**: http://localhost:8001/api/openapi.json

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
pytest tests/unit/test_dipole_builder.py -v
```

## Visualization & Debugging

### Console Visualization

View mesh structure in the console for debugging:

```python
from backend.preprocessor.builders import create_dipole, dipole_to_mesh
from backend.preprocessor.visualization import visualize_mesh

element = create_dipole(length=1.0, gap=0.01, segments=10)
mesh = dipole_to_mesh(element)

# Show detailed console output
visualize_mesh(mesh, element, console=True, plot=False)
```

### Example Script

Run the visualization example:

```bash
python -m backend.preprocessor.visualize_example
```

### 3D Visualization (Optional)

Install matplotlib for 3D plotting:

```bash
pip install matplotlib
```

Then use:

```python
visualize_mesh(mesh, element, console=True, plot=True)
# Or save to file
visualize_mesh(mesh, element, plot=True, save_path="antenna.png")
```

### API Debug Mode

Enable debug mode to see mesh visualization in console for all API requests:

```bash
# Windows PowerShell
$env:PREPROCESSOR_DEBUG='true'
python -m backend.preprocessor.main

# Linux/Mac
export PREPROCESSOR_DEBUG=true
python -m backend.preprocessor.main
```

## Next Steps

- Add remaining antenna builders (grid, etc.)
- Add geometry composition (multiple elements)
- Add transformation functions (translate, rotate)
- Integrate with storage backend
