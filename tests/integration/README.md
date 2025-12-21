# Integration Testing Guide

## Overview

Comprehensive integration tests that validate the complete preprocessor → solver pipeline with real antenna geometries and electromagnetic solutions.

## Test Coverage

### Pipeline Tests (`test_preprocessor_solver_pipeline.py`)

**Complete Workflow Tests:**
1. **Dipole Analysis** - Full center-fed dipole through both services
2. **Frequency Sweep** - Multi-frequency VSWR analysis
3. **Monopole Analysis** - Quarter-wave monopole with ground plane
4. **Loop Antenna** - Circular loop antenna analysis
5. **Error Handling** - Invalid geometry rejection
6. **Performance** - Large antenna (51 segments) timing
7. **Regression** - Impedance value regression testing

**Service Integration Tests:**
- Health check verification
- API documentation availability
- Cross-service communication

### What Gets Tested

✅ **Preprocessor Service:**
- Geometry generation (dipole, monopole, loop)
- Node/edge/radii output validation
- API request/response format

✅ **Solver Service:**
- Single frequency PEEC solving
- Frequency sweep analysis
- VSWR calculation
- Input impedance computation
- Current distribution
- API request/response format

✅ **Integration:**
- Data flow between services
- Format compatibility
- Error propagation
- Performance under load

✅ **Regression:**
- Deterministic results
- Known-good impedance values
- Reproducibility

## Running Tests

### Automatic (Recommended)

Runs both services automatically and executes all tests:

```powershell
# Run tests and stop services after
.\dev_tools\run_integration_tests.ps1

# Keep services running for debugging
.\dev_tools\run_integration_tests.ps1 -KeepServicesRunning
```

### Manual

Start services in separate terminals:

```powershell
# Terminal 1: Preprocessor
.\.venv\Scripts\python.exe -m uvicorn backend.preprocessor.main:app --port 8001

# Terminal 2: Solver
.\.venv\Scripts\python.exe -m uvicorn backend.solver.main:app --port 8002

# Terminal 3: Run tests
.\.venv\Scripts\python.exe -m pytest tests\integration\test_preprocessor_solver_pipeline.py -v
```

### Specific Test Cases

```powershell
# Run only dipole tests
pytest tests\integration\test_preprocessor_solver_pipeline.py::TestPreprocessorSolverPipeline::test_dipole_complete_analysis -v

# Run regression tests only
pytest tests\integration\test_preprocessor_solver_pipeline.py::TestPreprocessorSolverPipeline::test_regression_dipole_impedance -v

# Run with detailed output
pytest tests\integration\test_preprocessor_solver_pipeline.py -v -s
```

## Test Assertions

### Geometry Validation
- Correct number of nodes/edges/radii
- Valid connectivity (edges reference existing nodes)
- Physical constraints (positive radii, valid coordinates)

### Electromagnetic Validation
- Non-zero input impedance (within reasonable bounds)
- Non-zero currents in structure
- VSWR ≥ 1.0
- Monotonic frequency ordering in sweeps
- Deterministic results (same input → same output)

### Performance Validation
- Single frequency solve: < 10 seconds
- Large antenna (51 segments): < 30 seconds
- Frequency sweep (3 points): < 30 seconds

## Expected Results

### Typical Output

```
============================================================
Testing Solver REST API Service
============================================================

Testing Health Check...
✓ Health check: healthy

Testing Status...
✓ Service: solver v1.0.0

test_dipole_complete_analysis PASSED
✓ Dipole analysis complete:
  Input impedance: 73.12+42.50j Ω
  Max current: 0.021345 A

test_dipole_frequency_sweep PASSED
✓ Frequency sweep complete:
  VSWR range: 1.23 - 2.45
  Total solve time: 0.892 s

test_regression_dipole_impedance PASSED
✓ Regression test passed:
  Input impedance: 73.1234+42.5000j Ω (deterministic)
```

## Troubleshooting

### Services Not Starting

```powershell
# Check if ports are already in use
Get-NetTCPConnection -LocalPort 8001, 8002 -ErrorAction SilentlyContinue

# Kill existing processes
Stop-Process -Name python* -Force
```

### Test Failures

**Connection Errors:**
- Verify both services are running
- Check firewall settings
- Ensure correct port numbers (8001, 8002)

**Validation Errors:**
- Check service versions match
- Verify API schemas are compatible
- Review service logs for errors

**Timeout Errors:**
- Increase timeout in test fixtures
- Check system performance
- Reduce antenna complexity

### Regression Test Failures

If regression tests fail after intentional changes:
1. Verify the change is correct
2. Update expected ranges in `test_regression_dipole_impedance`
3. Document the change in git commit
4. Consider if it's a breaking change

## Continuous Integration

### GitHub Actions Example

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  integration-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-python@v2
        with:
          python-version: '3.11'
      - run: pip install -r requirements.txt
      - run: ./dev_tools/run_integration_tests.sh
```

## Adding New Tests

Template for new integration test:

```python
def test_new_antenna_type(self):
    """Test description."""
    # 1. Generate geometry via preprocessor
    response = requests.post(
        f"{PREPROCESSOR_URL}/api/v1/build/your_antenna",
        json={"param": value}
    )
    assert response.status_code == 200
    geometry = response.json()
    
    # 2. Solve via solver
    solver_request = {
        "nodes": geometry["nodes"],
        "edges": geometry["edges"],
        "radii": geometry["radii"],
        "frequency": 100e6,
        "voltage_sources": [...]
    }
    response = requests.post(
        f"{SOLVER_URL}/api/v1/solve/single",
        json=solver_request
    )
    assert response.status_code == 200
    result = response.json()
    
    # 3. Validate results
    Z_in = complex(result["input_impedance"]["real"], 
                   result["input_impedance"]["imag"])
    assert condition, "Validation message"
```

## Test Data

Test cases use standard antenna configurations:
- **Dipole**: 1.5m length, 1mm radius, center-fed, 21 segments
- **Monopole**: 0.75m length, 1mm radius, base-fed, 15 segments
- **Loop**: 0.2m radius, 1mm wire, 20 segments
- **Frequencies**: 90-110 MHz for sweeps, 100 MHz for single point

These are chosen for:
- Fast execution (< 1 second per solve)
- Numerical stability
- Well-known electromagnetic behavior
- Easy validation

## Performance Benchmarks

Target execution times on typical development machine:
- Single dipole solve: < 0.5s
- Frequency sweep (3 points): < 1.5s
- Full integration test suite: < 30s

Slower execution may indicate:
- Performance regression
- System resource issues
- Network/service communication problems

---

**Last Updated**: 2025-12-21
**Test Count**: 10 integration tests
**Coverage**: Preprocessor + Solver pipeline
