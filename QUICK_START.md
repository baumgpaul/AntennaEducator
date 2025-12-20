# Quick Start

This guide will help you to execute and test the environment and project

## Step 1: Set Up Python Environment

```powershell
# Navigate to project root
cd . . . \AntennaEducator

# Create virtual environment
python -m venv venv

# Activate virtual environment
.\venv\Scripts\activate

# Upgrade pip
python -m pip install --upgrade pip

# Install dependencies
pip install -r requirements.txt
```

## Step 2: Verify Installation

```powershell
# Check Python version (should be 3.11+)
python --version

# Verify key packages
python -c "import numpy; print(f'NumPy: {numpy.__version__}')"
python -c "import scipy; print(f'SciPy: {scipy.__version__}')"
python -c "import pydantic; print(f'Pydantic: {pydantic.__version__}')"
python -c "import fastapi; print(f'FastAPI: {fastapi.__version__}')"
```

## Step 3: Test Common Library

```powershell
# Run a quick test of the common library
python -c "from backend.common.constants import wavelength, C_0; print(f'Wavelength at 1 GHz: {wavelength(1e9):.4f} m')"

# Test data models
python -c "from backend.common.models.geometry import Source; s = Source(type='voltage', amplitude=1+0j); print(f'Source created: {s.type}')"
```

## Step 4: Run Tests

```powershell
# Run all tests
pytest

# Run tests with output
pytest -v

# Run tests with coverage
pytest --cov=backend --cov-report=term-missing

# Run only unit tests
pytest tests/unit/ -v
```

Expected output: All tests should pass ✓

## Step 5: Code Quality Checks

```powershell
# Format code (this will modify files)
black backend/ tests/

# Check code formatting (no changes)
black --check backend/ tests/

# Sort imports
isort backend/ tests/

# Run linter
flake8 backend/ tests/ --max-line-length=100
```

## Troubleshooting

### Issue: `ModuleNotFoundError: No module named 'backend'`

**Solution**: Install the project in editable mode:
```powershell
pip install -e .
```

### Issue: Tests fail with import errors

**Solution**: Make sure you're in the project root and virtual environment is activated:
```powershell
cd . . . \AntennaEducator
.\venv\Scripts\activate
```

### Issue: NumPy/SciPy installation fails

**Solution**: Make sure you have the latest pip and try again:
```powershell
python -m pip install --upgrade pip setuptools wheel
pip install numpy scipy
```

## Project Structure Check

Verify your directory structure matches:

```
AntennaEducator/
├── .env.example              ✓
├── .gitignore               ✓
├── pyproject.toml           ✓
├── requirements.txt         ✓
├── README.md                ✓
├── backend/
│   ├── README.md            ✓
│   ├── common/
│   │   ├── __init__.py      ✓
│   │   ├── constants.py     ✓
│   │   ├── models/
│   │   │   ├── __init__.py      ✓
│   │   │   ├── geometry.py      ✓
│   │   │   ├── project.py       ✓
│   │   │   ├── solver.py        ✓
│   │   │   └── postprocessor.py ✓
│   │   └── utils/
│   │       ├── __init__.py        ✓
│   │       ├── validation.py      ✓
│   │       └── serialization.py   ✓
├── tests/
│   ├── conftest.py          ✓
│   ├── unit/
│   │   ├── test_constants.py    ✓
│   │   ├── test_validation.py   ✓
│   │   └── test_models.py       ✓
├── docs/
│   └── BACKEND_IMPLEMENTATION.md ✓
```
