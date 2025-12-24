# Postprocessor Service

The postprocessor service computes electromagnetic fields, radiation patterns, and antenna parameters from PEEC solver results.

## Features

### Field Computation
- **Near-Field**: Electric and magnetic fields near the antenna
- **Far-Field**: Radiation patterns in spherical coordinates
- **Field Points**: Compute fields at arbitrary observation points

### Radiation Characteristics
- **Radiation Pattern**: E-field and H-field magnitude vs. angle
- **Directivity**: Peak radiation intensity vs. average
- **Gain**: Directivity × efficiency
- **3dB Beamwidth**: Angular width at half power
- **Polarization**: Linear, circular, elliptical

### Antenna Parameters
- **Input Impedance**: Z_in = R + jX (from solver)
- **VSWR**: Voltage Standing Wave Ratio
- **Return Loss**: S11 in dB
- **Bandwidth**: Frequency range for VSWR < threshold
- **Efficiency**: Radiation efficiency (radiated power / input power)

### Export Formats
- **JSON**: Structured data for web applications
- **CSV**: Tabular data for analysis tools
- **VTK**: 3D visualization in ParaView
- **HDF5**: Large datasets with metadata

## Architecture

```
Postprocessor Service
├── field.py          # Field computation (near/far)
├── pattern.py        # Radiation pattern analysis
├── parameters.py     # Antenna parameter extraction
├── export.py         # Data export utilities
├── models.py         # Pydantic data models
├── config.py         # Service configuration
└── main.py           # FastAPI service endpoints
```

## Usage

### As a Library

```python
from backend.postprocessor.field import compute_far_field
from backend.postprocessor.pattern import compute_radiation_pattern

# Compute far field
E_field, H_field = compute_far_field(
    frequencies=[100e6],
    branch_currents=currents,
    edge_geometries=edges,
    theta_angles=np.linspace(0, np.pi, 181),
    phi_angles=np.linspace(0, 2*np.pi, 360)
)

# Analyze radiation pattern
pattern = compute_radiation_pattern(
    E_field, theta_angles, phi_angles
)
```

### As a Service

```bash
# Start service
uvicorn backend.postprocessor.main:app --port 8003

# Health check
curl http://localhost:8003/health

# Compute radiation pattern
curl -X POST http://localhost:8003/api/v1/pattern/radiation \
  -H "Content-Type: application/json" \
  -d @solver_results.json
```

## Implementation Status

- [ ] Field computation module
- [ ] Radiation pattern analysis
- [ ] Antenna parameter extraction
- [ ] Export utilities
- [ ] FastAPI service layer
- [ ] Unit tests
- [ ] Integration tests
