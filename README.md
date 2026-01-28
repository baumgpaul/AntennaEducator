# PEEC Antenna Simulator - Cloud-Native Electromagnetic Simulation Platform

## Overview

A modern, cloud-native electromagnetic simulation platform based on the Partial Element Equivalent Circuit (PEEC) method for antenna analysis. This project ports a proven 1D PEEC MATLAB implementation into a scalable Python-based microservice architecture with a React web interface, enabling both standalone and cloud-based high-frequency antenna simulations.

**Current Status:** Phase 1 (Backend) complete, Phase 2 (Frontend) 50% complete

## Project Origin

This project builds upon 4 years of research on lightweight HF simulation using 1D wire elements. The original MATLAB implementation demonstrated the effectiveness of PEEC methodology for rapid antenna design and analysis. This new implementation modernizes the approach with cloud-native architecture and web-based accessibility.

## Key Features

### Backend (Phase 1) - ✅ COMPLETED

- **Microservice Architecture**: Modular design with three independent services
  - **Preprocessor**: Antenna geometry definition and mesh generation
  - **Solver**: PEEC electromagnetic field solver
  - **Postprocessor**: Field computation and antenna parameter extraction

- **Dual Deployment Model**:
  - **Standalone**: Dockerized deployment for local development and on-premise installations
  - **AWS Cloud**: Serverless deployment using AWS SAM (Serverless Application Model)

- **Antenna Library**:
  - Dipole antennas (gap-fed, balanced)
  - Loop antennas (circular, rectangular, polygonal)
  - Helical antennas (axial mode, normal mode)
  - Metallic rods and grids
  - Custom wire structures via low-level connectivity definitions

- **Analysis Capabilities**:
  - Current distribution computation
  - Input impedance analysis (single and multi-frequency)
  - Near-field and far-field calculations
  - Directivity, gain, and radiation pattern analysis
  - Time-domain signal analysis
  - Lumped element support (RLC)

### Frontend (Phase 2) - 🚧 IN PROGRESS (50%)

**✅ Completed (Tasks 1-8):**
- React 18 + TypeScript + Vite project setup
- Redux Toolkit state management with 4 domain slices
- API client layer with Axios (ready for backend integration)
- Main application shell with routing and layout
- Material-UI theming system (light/dark modes)
- Authentication flow with mock login
- Responsive layout with Header, Sidebar, Footer
- Global notification system

**🎯 Working Demo at http://localhost:3000:**
- Login with any credentials (mock auth)
- Navigate between pages
- Toggle light/dark theme
- Interactive sidebar with project tree
- User menu with logout

**🚧 Next Up (Tasks 9-15):**
- Backend authentication integration (Task 9)
- Project management UI (Task 10)
- 3D design interface with Three.js (Task 11)
- Antenna configuration dialogs (Task 12)
- Simulation workflow integration (Task 13)
- Results visualization (Task 14)
- Testing and polish (Task 15)

## Technology Stack

### Backend (Phase 1 - Complete)
- **Language**: Python 3.11+
- **Framework**: FastAPI for REST APIs
- **Compute**: NumPy, SciPy for numerical computation
- **Data Models**: Pydantic for validation
- **Testing**: Pytest with 85%+ coverage
- **Containerization**: Docker
- **Cloud**: AWS Lambda, API Gateway, S3, DynamoDB
- **IaC**: AWS SAM (Serverless Application Model)

### Frontend (Phase 2 - In Progress)
- **Framework**: React 18 with TypeScript 5
- **Build Tool**: Vite 5
- **UI Library**: Material-UI (MUI) 5
- **State**: Redux Toolkit 2.0
- **Routing**: React Router 6
- **API Client**: Axios 1.6
- **3D Rendering**: Three.js + React Three Fiber (planned Task 11)
- **Testing**: Vitest, React Testing Library (planned Task 15)

### Infrastructure
- **Containerization**: Docker, docker-compose
- **Web Server**: Nginx (reverse proxy and static file serving)
- **Database**: PostgreSQL (user/project data)
- **Storage**: MinIO (S3-compatible object storage)
- **API Gateway**: Nginx with CORS configuration

### ML/Optimization (Planned - Phase 3)
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
AntennaEducator/
├── frontend/                  # React web application (Phase 2)
│   ├── src/
│   │   ├── api/              # API client layer (Axios)
│   │   ├── components/       # Reusable UI components
│   │   ├── features/         # Feature-specific pages
│   │   ├── store/            # Redux state management
│   │   ├── types/            # TypeScript definitions
│   │   ├── theme/            # Material-UI themes
│   │   ├── App.tsx           # Main app component
│   │   └── main.tsx          # React entry point
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── backend/                   # Python microservices (Phase 1)
│   ├── preprocessor/         # Geometry and mesh generation service
│   ├── solver/               # PEEC solver service
│   ├── postprocessor/        # Field and parameter computation service
│   ├── common/               # Shared utilities and data models
│   └── tests/                # Test suites (85%+ coverage)
├── deployment/
│   ├── docker/               # Standalone Docker configuration
│   │   ├── nginx/            # Nginx configuration
│   │   └── postgres/         # PostgreSQL init scripts
│   └── sam/                  # AWS SAM templates (planned)
├── docs/                     # Detailed documentation
│   ├── BACKEND_IMPLEMENTATION.md
│   ├── SOLVER_SERVICE_COMPLETE.md
│   └── TESTING_COMPLETE.md
├── Matlab/                   # Original MATLAB implementation
├── docker-compose.yml        # Full-stack orchestration
├── PROJECT_OVERVIEW.md       # Comprehensive project documentation
└── README.md                 # This file
```

## Getting Started

### Authentication System

The application supports two authentication modes:

**🐳 Docker Mode (Local Development)**
- **JWT-based authentication** with local secret key
- **Auto-approval**: Users are automatically approved upon registration
- **First user becomes admin** automatically
- **Best for**: Local development and testing

**☁️ AWS Mode (Production)**
- **AWS Cognito authentication** with email verification
- **Manual approval**: Admin must approve users via custom:approved attribute
- **Email verification required** before first login
- **Best for**: Production deployments

**Environment Configuration:**
```bash
# Docker Mode (default for local dev)
USE_COGNITO=false
JWT_SECRET_KEY=your-secret-key-here

# AWS Mode (production)
USE_COGNITO=true
COGNITO_USER_POOL_ID=your-pool-id
COGNITO_CLIENT_ID=your-client-id
COGNITO_REGION=eu-west-1
```

### Quick Start - Full Stack (Docker)

Run the entire application (frontend + backend + infrastructure):

```bash
# Start all services
docker-compose up

# Access the application
# Frontend: http://localhost:3000
# API Gateway: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

### Frontend Development

```bash
cd frontend

# Install dependencies
npm install

# Start dev server (with hot reload)
npm run dev

# The app will be available at http://localhost:3000
```

**Login:**
- The frontend uses the unified auth service
- Register a new account (first user becomes admin in Docker mode)
- Or use Cognito for AWS deployments
- See Authentication System section above for configuration

### Backend Development

```bash
# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run individual services
cd backend/preprocessor
uvicorn main:app --reload --port 8001

cd backend/solver
uvicorn main:app --reload --port 8002

cd backend/postprocessor
uvicorn main:app --reload --port 8003
```

### Running Tests

**Backend:**
```bash
# Run all tests with coverage
pytest

# Run specific test file
pytest tests/test_solver_integration.py

# Generate coverage report
pytest --cov=backend --cov-report=html
```

**Frontend (Planned - Task 15):**
```bash
cd frontend
npm test
```

### Prerequisites
- **Node.js** 18+ and npm (for frontend)
- **Python** 3.11+ (for backend)
- **Docker Desktop** (for full-stack deployment)
- **Git** (for version control)

### Local Development Setup
```bash
# Clone repository
git clone https://github.com/[your-username]/AntennaEducator.git
cd AntennaEducator

# Set up Python environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up frontend
cd frontend
npm install

# Start services with Docker
docker-compose up
```

## Current Development Status

**✅ Phase 1 Complete:** All backend microservices fully functional with 85%+ test coverage  
**🚧 Phase 2 In Progress:** Frontend at 50% - Application shell complete, 3D visualization pending  
**📋 Phase 3 Planned:** Optimization and ML features

**You can test the app now:**
```bash
cd frontend
npm run dev
# Visit http://localhost:3000
# Login with any credentials (mock auth)
```

## Documentation

Detailed implementation guides and technical documentation are available in the `/docs` folder:

- [Backend Implementation Plan](docs/BACKEND_IMPLEMENTATION.md) - Comprehensive technical planning and implementation steps
- [Testing Guide](tests/README_CRITICAL_TESTS.md) - Test organization and critical test requirements
- [Gold Standard Test](tests/GOLD_STANDARD_TEST.md) - Lambda/2 dipole validation (MUST pass before merging solver changes)
- API Documentation (Coming soon)
- Deployment Guide (Coming soon)
- Algorithm Reference (Coming soon)

## Testing

The project includes comprehensive test coverage with special emphasis on **critical gold standard tests** that validate solver correctness:

### Quick Test Commands

```powershell
# Run critical/gold standard tests (MUST pass before committing solver changes)
pytest -m critical -v

# Or use the helper script
python tests/run_critical_tests.py

# Run all tests
pytest

# Run solver-related tests only
pytest -m solver -v
```

### Gold Standard: Lambda/2 Dipole Test

The half-wave dipole test is the **gold standard** that validates solver correctness against fundamental antenna theory. This test checks:
- ✓ Input impedance (~73 Ω)
- ✓ Current distribution (sinusoidal)
- ✓ Maximum directivity (~2.15 dBi)
- ✓ Radiation patterns

**Before committing ANY solver changes, this test MUST pass.**

See [`tests/GOLD_STANDARD_TEST.md`](tests/GOLD_STANDARD_TEST.md) for details.

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
