# PEEC Antenna Simulator - Cloud-Native Electromagnetic Simulation Platform

## Overview

A modern, cloud-native electromagnetic simulation platform based on the Partial Element Equivalent Circuit (PEEC) method for antenna analysis. This project ports a proven 1D PEEC MATLAB implementation into a scalable Python-based microservice architecture, enabling both standalone and cloud-based high-frequency antenna simulations.

## Project Origin

This project builds upon 4 years of research on lightweight HF simulation using 1D wire elements. The original MATLAB implementation demonstrated the effectiveness of PEEC methodology for rapid antenna design and analysis. This new implementation modernizes the approach with cloud-native architecture and web-based accessibility.

## Key Features

### Current Scope (Backend - Phase 1)

- **Microservice Architecture**: Modular design with three independent services
  - **Preprocessor**: Antenna geometry definition and mesh generation
  - **Solver**: PEEC electromagnetic field solver
  - **Postprocessor**: Field computation and antenna parameter extraction

- **Dual Deployment Model**:
  - **Standalone**: Dockerized deployment for local development and on-premise installations
  - **AWS Cloud**: Serverless deployment using AWS SAM (Serverless Application Model)

- **Antenna Library**:
  - Dipole antennas
  - Loop antennas
  - Helical antennas
  - Metallic rods and grids
  - Custom wire structures via low-level connectivity definitions

- **Analysis Capabilities**:
  - Current distribution computation
  - Input impedance analysis
  - Near-field and far-field calculations
  - Directivity and radiation pattern analysis
  - Time-domain signal analysis

### Future Roadmap

- Interactive 3D visualization using WebGL
- Real-time geometry editing and manipulation
- Project management (save, load, copy, delete)
- User authentication and multi-tenancy
- Interactive field visualization (amplitude and time-domain)
- Responsive ribbon-based UI for workflow management
- Multi-objective optimization algorithms
- Machine Learning surrogate models for rapid design space exploration
- Automated antenna design recommendations
- Performance prediction and analysis

## Technology Stack

### Backend (Current)
- **Language**: Python 3.11+
- **Framework**: FastAPI for REST APIs
- **Compute**: NumPy, SciPy for numerical computation
- **Containerization**: Docker
- **Cloud**: AWS Lambda, API Gateway, S3, DynamoDB
- **IaC**: AWS SAM (Serverless Application Model)

### Frontend (Planned)
- **Framework**: React/Vue.js
- **3D Rendering**: Three.js or Babylon.js
- **UI Components**: Material-UI or Ant Design
- **State Management**: Redux/Vuex

### ML/Optimization (Planned)
- **Optimization**: PyMOO, SciPy optimize
- **ML**: TensorFlow/PyTorch, scikit-learn
- **Surrogate Modeling**: GPy (Gaussian Processes), Neural Networks

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     API Gateway                          │
└────────────┬───────────────┬──────────────┬─────────────┘
             │               │              │
    ┌────────▼────────┐ ┌───▼──────────┐ ┌─▼──────────────┐
    │  Preprocessor   │ │    Solver    │ │ Postprocessor  │
    │   Service       │ │   Service    │ │    Service     │
    │                 │ │              │ │                │
    │ - Geometry Def  │ │ - PEEC Solve │ │ - Field Calc   │
    │ - Mesh Gen      │ │ - Current    │ │ - Impedance    │
    │ - Validation    │ │ - Matrix Ops │ │ - Directivity  │
    └─────────────────┘ └──────────────┘ └────────────────┘
             │               │              │
             └───────────────┴──────────────┘
                            │
                   ┌────────▼─────────┐
                   │  Data Storage    │
                   │  (S3/DynamoDB)   │
                   └──────────────────┘
```

## Project Structure

```
peec-antenna-simulator/
├── backend/
│   ├── preprocessor/          # Geometry and mesh generation service
│   ├── solver/                # PEEC solver service
│   ├── postprocessor/         # Field and parameter computation service
│   ├── common/                # Shared utilities and data models
│   └── tests/                 # Test suites
├── deployment/
│   ├── docker/                # Standalone Docker configuration
│   └── sam/                   # AWS SAM templates
├── docs/                      # Detailed documentation
├── matlab_reference/          # Original MATLAB implementation
└── README.md
```

## Getting Started

*(To be updated as implementation progresses)*

### Prerequisites
- Python 3.11+
- Docker Desktop
- AWS CLI (for cloud deployment)
- SAM CLI (for cloud deployment)

### Local Development Setup
```bash
# Clone repository
git clone https://github.com/[your-username]/peec-antenna-simulator.git
cd peec-antenna-simulator

# Set up Python environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run tests
pytest

# Start services locally
docker-compose up
```

## Documentation

Detailed implementation guides and technical documentation are available in the `/docs` folder:

- [Backend Implementation Plan](docs/BACKEND_IMPLEMENTATION.md) - Comprehensive technical planning and implementation steps
- API Documentation (Coming soon)
- Deployment Guide (Coming soon)
- Algorithm Reference (Coming soon)

## Contributing

This is currently a personal portfolio project. Contributions, suggestions, and feedback are welcome once the initial implementation is complete.

## License

*(To be determined)*

## Contact
Paul Baumgartner - baumg.paul@gmail.com

## Acknowledgments

This project builds upon research conducted during my time as a researcher, focusing on efficient electromagnetic simulation methods for antenna design and analysis.

---

**Note**: This project is under active development. The documentation and codebase will evolve as implementation progresses through different phases.
