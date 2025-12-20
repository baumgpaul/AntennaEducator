# Backend - PEEC Antenna Simulator

This directory contains the backend services for the PEEC Antenna Simulator.

## Structure

```
backend/
├── common/              # Shared utilities and data models
│   ├── models/          # Pydantic data models
│   │   ├── geometry.py  # Geometry, Mesh, Source models
│   │   ├── project.py   # Project management models
│   │   ├── solver.py    # Solver job and configuration
│   │   └── postprocessor.py  # Postprocessor results
│   ├── utils/           # Utility functions
│   │   ├── validation.py     # Input validation
│   │   └── serialization.py  # Data serialization
│   └── constants.py     # Physical constants and defaults
├── preprocessor/        # Preprocessor service (geometry definition)
├── solver/              # Solver service (PEEC solver)
└── postprocessor/       # Postprocessor service (field calculation)
```

## Setup

### Prerequisites
- Python 3.11 or higher
- pip or Poetry for dependency management

### Installation

1. **Create virtual environment:**
   ```bash
   python -m venv venv
   
   # On Windows
   venv\Scripts\activate
   
   # On Linux/Mac
   source venv/bin/activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r ../requirements.txt
   ```

3. **Install in development mode:**
   ```bash
   pip install -e ..
   ```

## Testing

Run all tests:
```bash
pytest
```

Run tests with coverage:
```bash
pytest --cov=backend --cov-report=html
```

Run specific test categories:
```bash
pytest -m unit          # Unit tests only
pytest -m integration   # Integration tests only
pytest -m e2e          # End-to-end tests only
```
## Common Library

The `common/` module provides shared functionality:

### Data Models
- **Geometry**: Antenna elements, mesh, sources
- **Project**: Project management and status
- **Solver**: Job configuration and execution
- **Postprocessor**: Result types and calculations

### Constants
- Physical constants (μ₀, ε₀, c₀, Z₀)
- Default configuration values
- Helper functions (wavelength, wavenumber, skin depth)

### Utilities
- **Validation**: Input data validation (vectors, frequencies, segments)
- **Serialization**: NumPy and complex number serialization

## Code Quality

Run linters and formatters:

```bash
# Format code with black
black backend/

# Sort imports
isort backend/

# Check types
mypy backend/

# Lint code
flake8 backend/
```

## Next Steps

See [docs/BACKEND_IMPLEMENTATION.md](../docs/BACKEND_IMPLEMENTATION.md) for the complete implementation plan.

