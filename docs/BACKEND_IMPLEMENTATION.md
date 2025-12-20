# Backend Implementation Plan - PEEC Antenna Simulator

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Service Specifications](#service-specifications)
3. [Data Models](#data-models)
4. [Implementation Phases](#implementation-phases)
5. [Technology Deep Dive](#technology-deep-dive)
6. [Deployment Strategy](#deployment-strategy)
7. [Testing Strategy](#testing-strategy)
8. [Migration from MATLAB](#migration-from-matlab)

---

## Architecture Overview

### Design Principles

1. **Microservice Architecture**: Each service (Preprocessor, Solver, Postprocessor) operates independently
2. **Cloud-Agnostic Core**: Business logic separated from infrastructure concerns
3. **Stateless Services**: All state stored externally for scalability
4. **Event-Driven**: Services communicate via messages/events where appropriate
5. **API-First**: RESTful APIs for all service interactions

### Architecture Patterns

#### Standalone Deployment (Docker)
```
┌──────────────────────────────────────────────────────────┐
│                    Docker Compose Network                 │
│                                                            │
│  ┌────────────────┐  ┌────────────────┐  ┌─────────────┐│
│  │  Preprocessor  │  │     Solver     │  │Postprocessor││
│  │   Container    │  │   Container    │  │  Container  ││
│  │   Port: 8001   │  │   Port: 8002   │  │ Port: 8003  ││
│  └────────┬───────┘  └────────┬───────┘  └──────┬──────┘│
│           │                   │                  │        │
│  ┌────────▼───────────────────▼──────────────────▼──────┐│
│  │              API Gateway (Nginx/Traefik)             ││
│  │                    Port: 8000                         ││
│  └────────────────────────────┬─────────────────────────┘│
│                               │                           │
│  ┌────────────────────────────▼─────────────────────────┐│
│  │         PostgreSQL + MinIO (S3-compatible)           ││
│  │         Metadata DB + Binary Storage                 ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────┘
```

#### AWS Cloud Deployment (SAM)
```
┌────────────────────────────────────────────────────────────┐
│                      API Gateway                            │
│             (REST API with Lambda Proxy)                    │
└───────┬─────────────────┬─────────────────┬────────────────┘
        │                 │                 │
┌───────▼──────────┐ ┌────▼─────────────┐ ┌▼────────────────┐
│  Preprocessor    │ │     Solver       │ │  Postprocessor  │
│  Lambda Function │ │ Lambda Function  │ │ Lambda Function │
│  (Python 3.11)   │ │  (Python 3.11)   │ │  (Python 3.11)  │
│                  │ │                  │ │                 │
│  Memory: 1024MB  │ │  Memory: 3008MB  │ │ Memory: 1024MB  │
│  Timeout: 30s    │ │  Timeout: 300s   │ │ Timeout: 60s    │
└──────────────────┘ └──────────────────┘ └─────────────────┘
        │                 │                 │
        └─────────────────┴─────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                 │
    ┌───▼──────┐              ┌──────────▼────────┐
    │    S3    │              │     DynamoDB      │
    │  Bucket  │              │  Project Metadata │
    │ Geometry │              │  Simulation State │
    │ Results  │              │  User Data        │
    └──────────┘              └───────────────────┘
```

### Shared Infrastructure Components

#### For Standalone:
- **Database**: PostgreSQL for relational data (projects, configurations)
- **Object Storage**: MinIO for S3-compatible binary storage
- **API Gateway**: Nginx or Traefik for routing
- **Message Queue** (optional): Redis for async job processing

#### For AWS:
- **Database**: DynamoDB for NoSQL storage
- **Object Storage**: S3 for geometry and results
- **API Gateway**: AWS API Gateway
- **Compute**: Lambda functions with configurable memory/timeout
- **Queue** (optional): SQS for long-running solver jobs

---

## Service Specifications

### 1. Preprocessor Service

**Purpose**: Define antenna geometry, generate computational mesh, validate structure

#### High-Level API Endpoints

```
POST   /api/v1/preprocessor/antenna/dipole
POST   /api/v1/preprocessor/antenna/loop
POST   /api/v1/preprocessor/antenna/helix
POST   /api/v1/preprocessor/antenna/rod
POST   /api/v1/preprocessor/antenna/grid
POST   /api/v1/preprocessor/antenna/custom
GET    /api/v1/preprocessor/project/{project_id}/geometry
PUT    /api/v1/preprocessor/project/{project_id}/geometry
POST   /api/v1/preprocessor/project/{project_id}/validate
POST   /api/v1/preprocessor/project/{project_id}/mesh
```

#### Core Functionality

##### A. High-Level Antenna Definitions

Each antenna type has a builder function:

**Dipole**
```python
Input Parameters:
  - length: float (meters)
  - center_position: [x, y, z] (meters)
  - orientation: [dx, dy, dz] (unit vector)
  - wire_radius: float (meters)
  - segments: int (discretization count)
  - source: Optional[SourceConfig]
    - type: "voltage" | "current"
    - amplitude: complex
    - position: "center" | "feed_point"
    
Output:
  - Geometry object with nodes and connectivity
  - Metadata for visualization
```

**Loop**
```python
Input Parameters:
  - radius: float (meters)
  - center_position: [x, y, z]
  - normal_vector: [dx, dy, dz]
  - wire_radius: float
  - segments: int
  - source: Optional[SourceConfig]  # Same structure as Dipole
  
Output:
  - Circular loop geometry
```

**Helix**
```python
Input Parameters:
  - radius: float
  - pitch: float (meters per turn)
  - turns: float
  - start_position: [x, y, z]
  - axis_direction: [dx, dy, dz]
  - wire_radius: float
  - segments_per_turn: int
  - source: Optional[SourceConfig]  # Same structure as Dipole
  
Output:
  - Helical geometry
```

**Metallic Rod**
```python
Input Parameters:
  - start_point: [x, y, z]
  - end_point: [x, y, z]
  - radius: float
  - segments: int
  
Output:
  - Linear conductor (passive element)
```

**Grid**
```python
Input Parameters:
  - corner1: [x, y, z]
  - corner2: [x, y, z]
  - spacing: float
  - plane: "xy" | "xz" | "yz"
  - wire_radius: float
  
Output:
  - Meshed grid structure
```

**Custom Low-Level**
```python
Input Parameters:
  - nodes: List[[x, y, z]]
  - connectivity: List[[node_i, node_j]]
  - radii: List[float] | float
  - sources: Optional[List[SourceConfig]]  # Each source without frequency
  
Output:
  - Arbitrary wire structure
```

##### B. Geometry Composition

Multiple antenna elements can be combined:
```python
POST /api/v1/preprocessor/project/{project_id}/add-element
DELETE /api/v1/preprocessor/project/{project_id}/element/{element_id}
POST /api/v1/preprocessor/project/{project_id}/transform
  - translate: [dx, dy, dz]
  - rotate: {axis, angle}
  - element_ids: [...]
```

##### C. Mesh Generation

Convert high-level definitions to computational mesh:
- **Nodes**: 3D coordinates of wire endpoints and junctions
- **Edges**: Connectivity between nodes (wire segments)
- **Attributes**: Radius, material properties, source assignments

```python
Mesh Output:
  - nodes: np.ndarray[N, 3]  # N nodes, 3D coordinates
  - edges: np.ndarray[M, 2]  # M edges, node index pairs
  - radii: np.ndarray[M]     # Wire radius per edge
  - sources: Dict[edge_id, SourceConfig]
  - metadata: Dict (for visualization)
```

##### D. Validation

- Check for overlapping segments
- Verify electrical connectivity
- Validate source placements
- Ensure numerical stability (segment length constraints)

#### Data Flow

```
User Input (High-Level) → Builder Functions → Geometry Objects
                                                    ↓
                                          Geometry Composer
                                                    ↓
                                            Mesh Generator
                                                    ↓
                                               Validator
                                                    ↓
                                        Storage (DB + S3)
```

### 2. Solver Service

**Purpose**: Execute PEEC electromagnetic solver to compute currents and potentials

#### API Endpoints

```
POST   /api/v1/solver/solve/{project_id}
GET    /api/v1/solver/status/{job_id}
GET    /api/v1/solver/results/{job_id}
POST   /api/v1/solver/sweep/{project_id}
DELETE /api/v1/solver/job/{job_id}
```

#### Core Functionality

##### A. PEEC Method Overview

The Partial Element Equivalent Circuit (PEEC) method formulates electromagnetic problems as circuit problems:

1. **Discretization**: Wire structure → segments (branches)
2. **Impedance Matrix**: Each segment has self and mutual impedances
3. **System Matrix**: Build MNA-like system of equations
4. **Solution**: Solve for branch currents and node potentials

**Key Equations**:
```
Z_ij = R_ij + jωL_ij  (Self and mutual impedance)
P_ij = (1/jω) * p_ij   (Coefficient of potential)

System: [Z] * [I] = [V]
  where:
    [Z] = impedance matrix (M×M for M segments)
    [I] = current vector
    [V] = source voltage vector
```

##### B. Matrix Assembly

**Self Impedance** (segment i):
```
R_i = ρ * length_i / (π * r_i²)
L_i = (μ₀/4π) * length_i * [ln(2*length_i/r_i) - 1]
Z_ii = R_i + jωL_i
```

**Mutual Impedance** (segments i, j):
```
L_ij = (μ₀/4π) * Neumann_integral(segment_i, segment_j)
Z_ij = jωL_ij
```

**Partial Coefficient of Potential**:
```
p_ij = (1/4πε₀) * Neumann_integral(segment_i, segment_j)
P_ij = (1/jωε₀) * p_ij
```

##### C. Solution Methods

**Frequency Domain**:
```python
Input:
  - mesh: PreprocessorOutput
  - frequency: float | List[float]
  - method: "direct" | "iterative"
  
Process:
  1. Assemble Z matrix at frequency f
  2. Apply source excitation to V vector
  3. Solve Z * I = V
     - Direct: LU decomposition
     - Iterative: GMRES, BiCGSTAB
  4. Compute node potentials from currents
  
Output:
  - currents: Complex[M]
  - potentials: Complex[N]
  - convergence_info: Dict
```

**Time Domain** (via Inverse Fourier Transform):
```python
Input:
  - mesh: PreprocessorOutput
  - time_points: np.ndarray
  - frequency_samples: int
  - source_waveform: Function(t)
  
Process:
  1. FFT source waveform → frequency domain
  2. Solve for each frequency sample
  3. IFFT results → time domain
  
Output:
  - currents_time: Float[M, T]
  - potentials_time: Float[N, T]
  - time_vector: Float[T]
```

##### D. Frequency Sweep

For antenna impedance over frequency range:
```python
Input:
  - mesh: PreprocessorOutput
  - f_start, f_stop: float
  - num_points: int
  - scale: "linear" | "log"
  
Process:
  Parallel or sequential solve at each frequency
  
Output:
  - frequencies: Float[K]
  - currents_f: Complex[M, K]
  - impedance_f: Complex[K]
```

##### E. Nonlinear Elements (Future)

Support for nonlinear loads (diodes, varistors):
- Iterative Newton-Raphson solution
- Harmonic balance for periodic steady-state

#### Solver Configuration

```python
SolverConfig:
  - method: "direct" | "iterative"
  - tolerance: float (for iterative, default 1e-6)
  - max_iterations: int (default 1000)
  - preconditioner: "jacobi" | "ilu" | "none"
  - parallel: bool (multi-frequency parallelization)
  - memory_strategy: "full_matrix" | "sparse"
```

#### Performance Considerations

**Standalone**:
- Multi-threading with NumPy/SciPy
- Sparse matrix storage for large problems
- Checkpointing for long sweeps

**AWS Lambda**:
- Memory: 3008 MB (maximum) for solver
- Timeout: 300s (5 min) per invocation
- For longer sweeps: Split into multiple invocations via SQS
- Use Lambda layers for NumPy/SciPy

---

### 3. Postprocessor Service

**Purpose**: Compute derived quantities from solver results (impedance, fields, directivity)

#### API Endpoints

```
POST   /api/v1/postprocessor/impedance/{job_id}
POST   /api/v1/postprocessor/field/{job_id}
POST   /api/v1/postprocessor/directivity/{job_id}
POST   /api/v1/postprocessor/power/{job_id}
GET    /api/v1/postprocessor/results/{result_id}
```

#### Core Functionality

##### A. Input Impedance Calculation

For each antenna port:
```python
Input:
  - solver_results: (currents, potentials, frequency)
  - port_definition: edge_id or node_pair
  
Calculation:
  Z_input = V_port / I_port
  
  For voltage source:
    V_port = source_voltage
    I_port = current in source edge
    
  For current source:
    I_port = source_current
    V_port = potential difference at nodes
    
Output:
  - impedance: Complex | Complex[K] for sweep
  - resistance: Float[K]
  - reactance: Float[K]
  - swr: Float[K] (if reference impedance given)
```

##### B. Electric and Magnetic Field Calculation

At arbitrary observation points:

**Electric Field**:
```
E(r) = -jω*A(r) - ∇φ(r)

where:
  A(r) = (μ₀/4π) * Σ I_i * ∫ (e^(-jkR)/R) dl  (Vector potential)
  φ(r) = (1/4πε₀) * Σ ρ_i * ∫ (e^(-jkR)/R) dl (Scalar potential)
  R = |r - r'|
```

**Magnetic Field**:
```
H(r) = (1/μ₀) * ∇ × A(r)
```

```python
Input:
  - solver_results: (currents, mesh, frequency)
  - observation_points: np.ndarray[P, 3]
  - field_type: "electric" | "magnetic" | "both"
  
Process:
  For each observation point:
    1. Compute vector potential contribution from each current segment
    2. Compute scalar potential contribution from charge distribution
    3. Apply field formulas
    
Output:
  - E_field: Complex[P, 3] (Ex, Ey, Ez)
  - H_field: Complex[P, 3] (Hx, Hy, Hz)
  - magnitude: Float[P]
  - phase: Float[P]
```

**Near-Field vs Far-Field**:
- **Near-field**: Full formula with 1/R³, 1/R² terms
- **Far-field** (r >> λ): Simplified radiation field

##### C. Directivity and Radiation Pattern

Far-field radiation pattern:
```python
Input:
  - solver_results: (currents, mesh, frequency)
  - theta_range: [0, π]
  - phi_range: [0, 2π]
  - num_theta, num_phi: int
  
Process:
  1. Compute far-field E(θ, φ) on sphere
  2. Calculate radiated power: P(θ, φ) = |E(θ, φ)|²
  3. Integrate total radiated power: P_total
  4. Compute directivity: D(θ, φ) = 4π * P(θ, φ) / P_total
  5. Find maximum directivity and direction
  
Output:
  - directivity: Float[num_theta, num_phi]
  - max_directivity: Float (dBi)
  - max_direction: (θ, φ)
  - gain_3d: Float[num_theta, num_phi]
  - pattern_cuts: Dict[plane, Float[angles]]
```

##### D. Time-Domain Field Evolution

For time-domain solver results:
```python
Input:
  - solver_results_time: (currents_time, time_vector)
  - observation_points: np.ndarray[P, 3]
  - animation_frames: int
  
Process:
  For each time step:
    Compute instantaneous field at observation points
    
Output:
  - E_field_time: Float[P, 3, T]
  - magnitude_time: Float[P, T]
  - animation_data: for visualization
```

##### E. Antenna Parameters Summary

```python
Output:
  - input_impedance: Complex | Complex[K]
  - return_loss: Float[K] (dB)
  - vswr: Float[K]
  - bandwidth: Float (Hz)
  - resonant_frequencies: List[Float]
  - max_directivity: Float (dBi)
  - efficiency: Float (if losses computed)
  - front_to_back_ratio: Float (dB)
```

#### MATLAB Reference Functions

From MATLAB code:
- `Antenna.calcDirectivity.m` → Directivity calculation
- `Antenna.calcDirectivityMesh.m` → Directivity on mesh
- `Antenna.calcPowerDensity.m` → Power density computation
- `Antenna.plotDirectivity.m` → Visualization reference
- `VecField.*` → Field computation utilities

---

## Data Models

### Project Structure

```python
Project:
  - id: UUID
  - name: String
  - description: String
  - created_at: DateTime
  - updated_at: DateTime
  - owner_id: UUID (for multi-tenancy)
  - status: "draft" | "meshed" | "solving" | "solved" | "error"
  
  # Relations
  - geometry: Geometry
  - solver_jobs: List[SolverJob]
  - postprocessor_results: List[PostprocessorResult]
```

### Geometry Model

```python
Geometry:
  - id: UUID
  - project_id: UUID
  - elements: List[AntennaElement]
  - mesh: Optional[Mesh]
  - created_at: DateTime
  
AntennaElement:
  - id: UUID
  - type: "dipole" | "loop" | "helix" | "rod" | "grid" | "custom"
  - name: String
  - parameters: Dict  # Type-specific parameters
  - transform: Transform4x4
  - source: Optional[Source]
  
Mesh:
  - nodes: Array[N, 3]  # Stored as binary (NumPy/HDF5)
  - edges: Array[M, 2]
  - radii: Array[M]
  - edge_to_element: Dict[edge_id, element_id]
  - source_edges: List[edge_id]
  - metadata: Dict
  
Source:
  - type: "voltage" | "current"
  - amplitude: Complex
  - phase: Float
  - waveform: Optional[String]  # For time-domain
  
Note: Frequency is defined at the solver level, not per source.
      All sources in a project operate at the same frequency(ies).
```

### Solver Job Model

```python
SolverJob:
  - id: UUID
  - project_id: UUID
  - type: "single_frequency" | "frequency_sweep" | "time_domain"
  - config: SolverConfig
  - status: "queued" | "running" | "completed" | "failed"
  - progress: Float [0, 1]
  - started_at: Optional[DateTime]
  - completed_at: Optional[DateTime]
  - error_message: Optional[String]
  
SolverResult:
  - job_id: UUID
  - frequencies: Array[K]
  - currents: Array[M, K]  # Complex, stored as binary
  - potentials: Array[N, K]  # Complex, stored as binary
  - convergence_info: Dict
  - storage_location: S3Key | FilePath
```

### Postprocessor Result Model

```python
PostprocessorResult:
  - id: UUID
  - job_id: UUID
  - type: "impedance" | "field" | "directivity" | "power"
  - parameters: Dict  # Request parameters
  - result_data: Dict | BinaryData
  - storage_location: S3Key | FilePath
  - created_at: DateTime
  
ImpedanceResult:
  - frequencies: Array[K]
  - impedance: Complex[K]
  - swr: Float[K]
  - return_loss: Float[K]
  
FieldResult:
  - observation_points: Array[P, 3]
  - frequencies: Array[K]
  - E_field: Complex[P, 3, K]
  - H_field: Complex[P, 3, K]
  
DirectivityResult:
  - frequency: Float
  - theta: Array[Nθ]
  - phi: Array[Nφ]
  - directivity: Array[Nθ, Nφ]
  - max_directivity_dBi: Float
  - max_direction: (θ, φ)
```

### Storage Strategy

**Small Data (< 1 MB)**:
- Store directly in database (PostgreSQL/DynamoDB) as JSON/BLOB

**Large Data (> 1 MB)**:
- Store in object storage (S3/MinIO) as:
  - NumPy `.npz` files (compressed arrays)
  - HDF5 files (for hierarchical data)
  - Parquet (for tabular results)
- Store reference (S3 key or file path) in database

**Serialization**:
- Complex numbers: Store as separate real/imag arrays or structured dtype
- Metadata: JSON
- Arrays: NumPy native format or HDF5

---

## Implementation Phases

### Phase 1: Core Backend Foundation
- [ ] Repository structure creation
- [ ] Python environment setup (pyproject.toml, Poetry/pip)
- [ ] Shared library structure (`common/`)
  - [ ] Data models (Pydantic)
  - [ ] Utilities (validation, serialization)
  - [ ] Constants (physical constants, defaults)
- [ ] Database schema design
  - [ ] PostgreSQL schema for standalone
  - [ ] DynamoDB table design for AWS
- [ ] Docker setup for local development
  - [ ] Docker Compose with all services
  - [ ] Database initialization scripts
  - [ ] MinIO setup
- [ ] CI/CD pipeline basics (GitHub Actions)
  - [ ] Linting (black, flake8, mypy)
  - [ ] Testing framework (pytest)

#### Preprocessor Service - Basic Implementation
- [ ] FastAPI application setup
- [ ] Basic geometry models (Pydantic)
- [ ] High-level antenna builders:
  - [ ] Dipole
  - [ ] Loop
  - [ ] Rod
- [ ] Simple mesh generation (no optimization)
- [ ] REST API endpoints
- [ ] Unit tests for builders
- [ ] Integration test (create dipole → mesh)

#### Preprocessor Service - Advanced Features
- [ ] Remaining antenna builders:
  - [ ] Helix
  - [ ] Grid
  - [ ] Custom low-level
- [ ] Geometry composition (add/remove elements)
- [ ] Transformation functions (translate, rotate)
- [ ] Validation logic
- [ ] Storage integration (DB + S3/MinIO)
- [ ] Comprehensive testing

#### Solver Service - Foundation
- [ ] FastAPI application setup
- [ ] Impedance matrix assembly:
  - [ ] Self impedance calculation
  - [ ] Mutual impedance (Neumann integrals)
  - [ ] Coefficient of potential
- [ ] Matrix assembly optimization (vectorization)
- [ ] Single frequency solver:
  - [ ] Direct method (NumPy/SciPy LU)
  - [ ] Iterative method (SciPy GMRES)
- [ ] Unit tests for matrix assembly
- [ ] Validation against MATLAB reference

### Phase 2: Solver Completion & Postprocessor (Weeks 5-8)

#### Solver Service - Frequency Sweep
- [ ] Frequency sweep implementation
- [ ] Parallel execution (ThreadPoolExecutor)
- [ ] Job queue management (for async processing)
- [ ] Progress tracking
- [ ] Result storage (S3/MinIO)
- [ ] REST API for sweep requests

#### Solver Service - Time Domain
- [ ] Time-domain solver via FFT
- [ ] Source waveform definitions
- [ ] Transient analysis
- [ ] Time-domain result storage
- [ ] Performance optimization
- [ ] Testing and validation

#### Postprocessor Service - Implementation
- [ ] FastAPI application setup
- [ ] Input impedance calculation
- [ ] Electric field computation
- [ ] Magnetic field computation
- [ ] Near-field and far-field separation
- [ ] REST API endpoints
- [ ] Unit tests

#### Postprocessor Service - Directivity
- [ ] Far-field radiation pattern
- [ ] Directivity calculation
- [ ] Power density computation
- [ ] Antenna parameter summary
- [ ] Visualization data export (JSON for 3D)
- [ ] Integration testing with solver

### Phase 3: Integration & Standalone Deployment (Weeks 9-12)

#### Service Integration
- [ ] End-to-end workflow testing
  - [ ] Preprocessor → Solver → Postprocessor
- [ ] API Gateway setup (Nginx/Traefik)
- [ ] Service-to-service communication
- [ ] Error handling and retry logic
- [ ] Logging and monitoring (structured logging)
- [ ] Documentation (API docs with OpenAPI)

#### Docker Deployment Refinement
- [ ] Optimized Docker images (multi-stage builds)
- [ ] Docker Compose production configuration
- [ ] Volume management for persistence
- [ ] Environment configuration (`.env` files)
- [ ] Health checks and auto-restart
- [ ] Resource limits and scaling

#### Testing & Validation
- [ ] Comprehensive test suite
  - [ ] Unit tests (>80% coverage)
  - [ ] Integration tests
  - [ ] End-to-end tests
- [ ] MATLAB reference validation
  - [ ] Port example scripts
  - [ ] Compare results (tolerance checks)
- [ ] Performance benchmarking
- [ ] Load testing (locust/k6)
- [ ] Bug fixes and refinement

#### Documentation & Release
- [ ] User guide for standalone deployment
- [ ] API documentation (Swagger/ReDoc)
- [ ] Developer documentation
- [ ] Example notebooks (Jupyter)
- [ ] README updates
- [ ] Initial release (v0.1.0)

### Phase 4: AWS Cloud Deployment (Weeks 13-16)

#### AWS SAM Setup
- [ ] SAM template creation
  - [ ] Lambda functions for each service
  - [ ] API Gateway definition
  - [ ] DynamoDB tables
  - [ ] S3 buckets
  - [ ] IAM roles and policies
- [ ] Lambda layer for dependencies (NumPy, SciPy)
- [ ] Local SAM testing (`sam local start-api`)

#### Lambda Adaptations
- [ ] Abstract storage layer (S3 vs MinIO)
- [ ] Abstract database layer (DynamoDB vs PostgreSQL)
- [ ] Lambda-specific optimizations:
  - [ ] Cold start reduction
  - [ ] Memory/timeout tuning
  - [ ] Result streaming for large data
- [ ] Lambda-specific testing

#### Long-Running Job Handling
- [ ] SQS integration for solver jobs
- [ ] Step Functions for workflow orchestration (optional)
- [ ] Lambda → Lambda async invocation
- [ ] Job status polling API
- [ ] Timeout handling (split large sweeps)

#### AWS Deployment & Testing
- [ ] Deploy to AWS (dev environment)
- [ ] End-to-end testing on AWS
- [ ] Performance monitoring (CloudWatch)
- [ ] Cost optimization
- [ ] Security review (IAM, API keys)
- [ ] Documentation for AWS deployment
- [ ] Release AWS-compatible version (v0.2.0)

---

## Technology Deep Dive

### Python Numerical Stack

#### NumPy
- **Purpose**: Core array operations, matrix storage
- **Usage**:
  - Geometry storage (nodes, edges)
  - Matrix assembly (Z, P matrices)
  - Result storage (currents, fields)
- **Optimization**:
  - Vectorized operations (avoid Python loops)
  - Memory-mapped arrays for large data
  - Use appropriate dtypes (float64, complex128)

#### SciPy
- **Purpose**: Linear algebra, numerical integration
- **Usage**:
  - Sparse matrix storage (`scipy.sparse.csr_matrix`)
  - Linear solvers (`scipy.linalg.solve`, `scipy.sparse.linalg.gmres`)
  - Numerical integration (Neumann integrals)
- **Solver Selection**:
  - **Dense problems** (< 1000 unknowns): Direct LU
  - **Sparse problems** (> 1000): Iterative GMRES with ILU preconditioner

#### Pandas (Optional)
- For tabular results (frequency sweeps)
- CSV/Parquet export

### FastAPI

- **Why FastAPI**: Modern, fast, automatic API docs, async support
- **Structure**:
  ```
  service/
  ├── main.py           # FastAPI app entry point
  ├── routers/          # API route definitions
  ├── services/         # Business logic
  ├── models/           # Pydantic models
  ├── dependencies.py   # Dependency injection
  └── config.py         # Configuration management
  ```
- **Features to Use**:
  - Path operations with type hints
  - Pydantic models for request/response validation
  - Dependency injection for DB/storage
  - Background tasks for async processing
  - Middleware for logging/auth

### Database Selection

#### Standalone: PostgreSQL
- **Pros**: Relational, ACID, mature, good for metadata
- **Schema**:
  - `projects` table
  - `geometries` table (with JSONB for parameters)
  - `solver_jobs` table
  - `postprocessor_results` table
- **ORM**: SQLAlchemy or asyncpg (async)

#### AWS: DynamoDB
- **Pros**: Serverless, auto-scaling, pay-per-request
- **Schema Design**:
  - **PK**: `project_id`, **SK**: `metadata#` (single-table design)
  - **PK**: `project_id`, **SK**: `job#{job_id}`
  - **PK**: `project_id`, **SK**: `result#{result_id}`
- **Access Patterns**:
  - Get project metadata
  - List all jobs for project
  - Get specific job result
- **Library**: boto3 with aioboto3 (async)

### Object Storage

#### Standalone: MinIO
- **Why MinIO**: S3-compatible, self-hosted, lightweight
- **Setup**: Docker container with persistent volume
- **Buckets**:
  - `geometries`: Mesh data
  - `solver-results`: Current/potential arrays
  - `postprocessor-results`: Field data, directivity

#### AWS: S3
- **Configuration**:
  - Lifecycle policies (archive old results to Glacier)
  - Versioning for critical data
  - Server-side encryption
- **Access**: boto3/aioboto3

### Containerization

#### Docker Best Practices
- **Multi-stage builds**: Separate build and runtime images
- **Small base images**: `python:3.11-slim`
- **Layer caching**: Order commands to optimize cache
- **Security**: Non-root user, minimal packages

#### Docker Compose
```yaml
services:
  preprocessor:
    build: ./backend/preprocessor
    ports: ["8001:8001"]
    environment: [...]
    depends_on: [postgres, minio]
    
  solver:
    build: ./backend/solver
    ports: ["8002:8002"]
    environment: [...]
    depends_on: [postgres, minio]
    
  postprocessor:
    build: ./backend/postprocessor
    ports: ["8003:8003"]
    environment: [...]
    depends_on: [postgres, minio]
    
  postgres:
    image: postgres:15
    volumes: ["postgres_data:/var/lib/postgresql/data"]
    
  minio:
    image: minio/minio
    volumes: ["minio_data:/data"]
    command: server /data --console-address ":9001"
```

### AWS SAM

#### Template Structure
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    Runtime: python3.11
    Environment:
      Variables:
        RESULTS_BUCKET: !Ref ResultsBucket
        PROJECTS_TABLE: !Ref ProjectsTable

Resources:
  # API Gateway
  PEECApi:
    Type: AWS::Serverless::Api
    Properties:
      StageName: prod
      
  # Lambda Functions
  PreprocessorFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: backend/preprocessor/
      Handler: main.lambda_handler
      MemorySize: 1024
      Timeout: 30
      Policies: [...]
      Events:
        CreateAntenna:
          Type: Api
          Properties:
            Path: /api/v1/preprocessor/antenna/{type}
            Method: POST
            RestApiId: !Ref PEECApi
            
  SolverFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: backend/solver/
      Handler: main.lambda_handler
      MemorySize: 3008
      Timeout: 300
      Layers:
        - !Ref NumpyScipyLayer
      Policies: [...]
      
  # S3 Bucket
  ResultsBucket:
    Type: AWS::S3::Bucket
    Properties:
      LifecycleConfiguration: [...]
      
  # DynamoDB Table
  ProjectsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: PK
          AttributeType: S
        - AttributeName: SK
          AttributeType: S
      KeySchema:
        - AttributeName: PK
          KeyType: HASH
        - AttributeName: SK
          KeyType: RANGE
```

#### Lambda Layer for NumPy/SciPy
- Pre-built layers available (AWS SAR) or build custom
- Build process:
  ```bash
  mkdir python
  pip install numpy scipy -t python/
  zip -r layer.zip python/
  aws lambda publish-layer-version --layer-name numpy-scipy --zip-file fileb://layer.zip
  ```

---

## Deployment Strategy

### Standalone Deployment Steps

1. **Prerequisites**:
   ```bash
   - Docker Desktop installed
   - Git installed
   - Python 3.11+ (for local development)
   ```

2. **Clone and Setup**:
   ```bash
   git clone https://github.com/[user]/peec-antenna-simulator.git
   cd peec-antenna-simulator
   ```

3. **Configuration**:
   ```bash
   cp .env.example .env
   # Edit .env with appropriate values (DB credentials, storage paths)
   ```

4. **Build and Run**:
   ```bash
   docker-compose build
   docker-compose up -d
   ```

5. **Initialize Database**:
   ```bash
   docker-compose exec preprocessor python -m alembic upgrade head
   ```

6. **Verify**:
   ```bash
   curl http://localhost:8000/health
   # Should return {"status": "healthy"}
   ```

7. **Access**:
   - API Gateway: http://localhost:8000
   - API Docs: http://localhost:8000/docs
   - MinIO Console: http://localhost:9001

### AWS Deployment Steps

1. **Prerequisites**:
   ```bash
   - AWS CLI installed and configured
   - SAM CLI installed
   - Docker (for local testing)
   ```

2. **Clone Repository**:
   ```bash
   git clone https://github.com/[user]/peec-antenna-simulator.git
   cd peec-antenna-simulator/deployment/sam
   ```

3. **Build**:
   ```bash
   sam build
   ```

4. **Test Locally**:
   ```bash
   sam local start-api
   # Test with: curl http://localhost:3000/health
   ```

5. **Deploy to AWS**:
   ```bash
   sam deploy --guided
   # Follow prompts:
   #   Stack Name: peec-simulator-dev
   #   AWS Region: us-east-1
   #   Confirm changes: Y
   #   Allow SAM CLI IAM creation: Y
   ```

6. **Get API Endpoint**:
   ```bash
   aws cloudformation describe-stacks \
     --stack-name peec-simulator-dev \
     --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
     --output text
   ```

7. **Verify**:
   ```bash
   curl https://[api-id].execute-api.[region].amazonaws.com/prod/health
   ```

8. **Monitor**:
   - CloudWatch Logs: AWS Console → CloudWatch → Log Groups
   - DynamoDB: AWS Console → DynamoDB → Tables
   - S3: AWS Console → S3 → Buckets

### CI/CD Pipeline

**GitHub Actions Workflow**:

```yaml
name: CI/CD

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - name: Install dependencies
        run: |
          pip install -r backend/requirements.txt
          pip install pytest pytest-cov
      - name: Run tests
        run: pytest --cov=backend --cov-report=xml
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  build-standalone:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build Docker images
        run: docker-compose build
      - name: Push to registry (if main branch)
        if: github.ref == 'refs/heads/main'
        run: |
          echo ${{ secrets.DOCKER_PASSWORD }} | docker login -u ${{ secrets.DOCKER_USERNAME }} --password-stdin
          docker-compose push

  deploy-aws:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: aws-actions/setup-sam@v2
      - uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1
      - name: SAM Build
        run: sam build
        working-directory: deployment/sam
      - name: SAM Deploy
        run: sam deploy --no-confirm-changeset --no-fail-on-empty-changeset
        working-directory: deployment/sam
```

---

## Testing Strategy

### Unit Tests

**Coverage Goals**: >80% for all services

**Structure**:
```
tests/
├── unit/
│   ├── preprocessor/
│   │   ├── test_dipole_builder.py
│   │   ├── test_loop_builder.py
│   │   ├── test_mesh_generation.py
│   │   └── test_validation.py
│   ├── solver/
│   │   ├── test_impedance_matrix.py
│   │   ├── test_solver_direct.py
│   │   ├── test_solver_iterative.py
│   │   └── test_frequency_sweep.py
│   └── postprocessor/
│       ├── test_impedance.py
│       ├── test_field_calculation.py
│       └── test_directivity.py
├── integration/
│   ├── test_preprocessor_api.py
│   ├── test_solver_api.py
│   └── test_postprocessor_api.py
└── e2e/
    └── test_full_workflow.py
```

**Example Test**:
```python
# tests/unit/preprocessor/test_dipole_builder.py
import pytest
import numpy as np
from backend.preprocessor.builders import create_dipole

def test_dipole_basic():
    result = create_dipole(
        length=0.5,
        center=[0, 0, 0],
        orientation=[0, 0, 1],
        radius=0.001,
        segments=10
    )
    
    assert result.nodes.shape[0] == 11  # 10 segments = 11 nodes
    assert result.edges.shape[0] == 10
    assert np.allclose(result.nodes[0], [0, 0, -0.25])
    assert np.allclose(result.nodes[-1], [0, 0, 0.25])

def test_dipole_with_source():
    result = create_dipole(
        length=0.5,
        center=[0, 0, 0],
        orientation=[0, 0, 1],
        radius=0.001,
        segments=10,
        source={'type': 'voltage', 'amplitude': 1.0}
    )
    
    assert result.sources is not None
    assert len(result.sources) == 1
    assert result.sources[0]['type'] == 'voltage'
```

### Integration Tests

Test service APIs with test database:

```python
# tests/integration/test_preprocessor_api.py
import pytest
from fastapi.testclient import TestClient
from backend.preprocessor.main import app

@pytest.fixture
def client():
    return TestClient(app)

def test_create_dipole_endpoint(client):
    response = client.post(
        "/api/v1/preprocessor/antenna/dipole",
        json={
            "project_id": "test-project",
            "length": 0.5,
            "center": [0, 0, 0],
            "orientation": [0, 0, 1],
            "radius": 0.001,
            "segments": 10
        }
    )
    
    assert response.status_code == 200
    data = response.json()
    assert 'element_id' in data
    assert data['type'] == 'dipole'
```

### End-to-End Tests

Full workflow validation:

```python
# tests/e2e/test_full_workflow.py
def test_dipole_simulation_workflow(api_client):
    # 1. Create project
    project = api_client.post("/api/v1/projects", json={"name": "Test"})
    project_id = project.json()['id']
    
    # 2. Add dipole
    dipole = api_client.post(
        f"/api/v1/preprocessor/antenna/dipole",
        json={"project_id": project_id, ...}
    )
    
    # 3. Generate mesh
    mesh = api_client.post(f"/api/v1/preprocessor/project/{project_id}/mesh")
    assert mesh.status_code == 200
    
    # 4. Solve
    job = api_client.post(
        f"/api/v1/solver/solve/{project_id}",
        json={"frequency": 1e9}
    )
    job_id = job.json()['job_id']
    
    # 5. Wait for completion
    result = wait_for_job(api_client, job_id, timeout=60)
    assert result['status'] == 'completed'
    
    # 6. Get impedance
    impedance = api_client.post(
        f"/api/v1/postprocessor/impedance/{job_id}"
    )
    assert impedance.status_code == 200
    Z = impedance.json()['impedance']
    assert abs(Z['real']) > 0  # Has resistance
```

### MATLAB Validation Tests

Compare Python results with MATLAB reference:

```python
# tests/validation/test_against_matlab.py
def test_dipole_impedance_vs_matlab():
    # Run Python simulation
    python_result = run_python_dipole_simulation(
        length=0.5, frequency=300e6, segments=20
    )
    
    # Load MATLAB reference
    matlab_result = load_matlab_reference('dipole_300MHz.mat')
    
    # Compare impedance (within 1% tolerance)
    assert np.allclose(
        python_result['impedance'],
        matlab_result['Z_input'],
        rtol=0.01
    )
```

---

## Migration from MATLAB

### Step-by-Step MATLAB to Python Translation

#### 1. Identify Core MATLAB Functions

**Preprocessor Functions**:
- `createDipole.m` → `create_dipole()`
- `createLoop.m` → `create_loop()`
- `createGrid.m` → `create_grid()`
- `moveAntenna.m` → `transform_geometry()`

**Solver Functions**:
- `assemble_L_1d_for*.mex*` → `assemble_inductance_matrix()`
- `assemble_P_1d_for*.mex*` → `assemble_potential_matrix()`
- MEX files → Pure Python/NumPy (or Numba for speed)

**Postprocessor Functions**:
- `calcDirectivity.m` → `calculate_directivity()`
- `calcPowerDensity.m` → `calculate_power_density()`

#### 2. Translation Strategy

**For each MATLAB function**:

1. **Understand the algorithm**:
   - Read MATLAB code and comments
   - Identify inputs, outputs, and intermediate steps
   - Note any special MATLAB functions used

2. **Find Python equivalents**:
   - MATLAB matrix ops → NumPy
   - MATLAB `ode45` → SciPy `solve_ivp`
   - MATLAB `fft` → NumPy `fft.fft`
   - MATLAB `mldivide (\)` → SciPy `linalg.solve`

3. **Implement in Python**:
   - Use NumPy vectorization
   - Add type hints (for maintainability)
   - Add docstrings (Google style)

4. **Validate**:
   - Compare outputs with MATLAB on test cases
   - Use MATLAB Engine API if needed for reference

#### 3. MEX File Handling

**Option A**: Pure Python/NumPy
- Translate C/Fortran code to Python
- Use NumPy vectorization
- Accept some performance loss (often acceptable)

**Option B**: Numba JIT
- Add `@numba.jit(nopython=True)` decorator
- Write NumPy-compatible code
- Get near-C performance

**Option C**: Cython
- Write `.pyx` files with C-like syntax
- Compile to C extension
- Maximum performance

**Recommendation**: Start with Option A (pure Python), optimize with Option B (Numba) if needed.

#### 4. Example Translation

**MATLAB** (`createDipole.m`):
```matlab
function [nodes, connectivity, radii, sources] = createDipole(length, center, orientation, radius, segments, source)
    % Create dipole antenna
    
    % Normalize orientation
    orientation = orientation / norm(orientation);
    
    % Generate nodes
    t = linspace(-length/2, length/2, segments+1)';
    nodes = center + t .* orientation;
    
    % Generate connectivity
    connectivity = [(1:segments)', (2:segments+1)'];
    
    % Radii
    radii = radius * ones(segments, 1);
    
    % Sources
    if nargin > 5
        source_segment = floor(segments/2) + 1;
        sources = struct('segment', source_segment, ...
                        'type', source.type, ...
                        'amplitude', source.amplitude);
    else
        sources = [];
    end
end
```

**Python Translation**:
```python
from dataclasses import dataclass
from typing import Optional, List
import numpy as np

@dataclass
class Source:
    segment: int
    type: str  # 'voltage' or 'current'
    amplitude: complex

@dataclass
class Geometry:
    nodes: np.ndarray  # Shape: (N, 3)
    connectivity: np.ndarray  # Shape: (M, 2)
    radii: np.ndarray  # Shape: (M,)
    sources: Optional[List[Source]] = None

def create_dipole(
    length: float,
    center: np.ndarray,
    orientation: np.ndarray,
    radius: float,
    segments: int,
    source: Optional[dict] = None
) -> Geometry:
    """
    Create a dipole antenna geometry.
    
    Args:
        length: Total length of dipole in meters
        center: Center position [x, y, z] in meters
        orientation: Direction vector [dx, dy, dz] (will be normalized)
        radius: Wire radius in meters
        segments: Number of segments for discretization
        source: Optional source configuration dict with keys:
                'type', 'amplitude' (frequency is set at solver level)
    
    Returns:
        Geometry object containing nodes, connectivity, radii, and sources
    """
    # Normalize orientation
    orientation = orientation / np.linalg.norm(orientation)
    
    # Generate nodes
    t = np.linspace(-length/2, length/2, segments+1)
    nodes = center + np.outer(t, orientation)
    
    # Generate connectivity (0-indexed)
    connectivity = np.column_stack([
        np.arange(segments),
        np.arange(1, segments+1)
    ])
    
    # Radii
    radii = np.full(segments, radius)
    
    # Sources
    sources_list = None
    if source is not None:
        source_segment = segments // 2
        sources_list = [Source(
            segment=source_segment,
            type=source['type'],
            amplitude=complex(source['amplitude'])
        )]
    
    return Geometry(
        nodes=nodes,
        connectivity=connectivity,
        radii=radii,
        sources=sources_list
    )
```

#### 5. Validation Script

Create a validation script that runs both MATLAB and Python:

```python
# validation/compare_matlab_python.py
import matlab.engine
import numpy as np
from backend.preprocessor.builders import create_dipole

# Start MATLAB engine
eng = matlab.engine.start_matlab()
eng.addpath('Matlab/Code/+PEECAntenna/', nargout=0)

# Test parameters
length = 0.5
center = [0, 0, 0]
orientation = [0, 0, 1]
radius = 0.001
segments = 20

# Run MATLAB
matlab_result = eng.createDipole(
    float(length),
    matlab.double(center),
    matlab.double(orientation),
    float(radius),
    float(segments),
    nargout=4
)
matlab_nodes = np.array(matlab_result[0])

# Run Python
python_result = create_dipole(
    length=length,
    center=np.array(center),
    orientation=np.array(orientation),
    radius=radius,
    segments=segments
)

# Compare
assert np.allclose(python_result.nodes, matlab_nodes, atol=1e-10)
print("✓ Nodes match!")
```

#### 6. Migration Checklist

- [ ] List all MATLAB functions to migrate
- [ ] Categorize by priority (core vs. utility)
- [ ] Translate high-priority functions first
- [ ] Create test cases from MATLAB examples
- [ ] Validate each function against MATLAB
- [ ] Document any differences or limitations
- [ ] Remove MATLAB dependency once validated

---

## Performance Considerations

### Computational Complexity

**Matrix Assembly**:
- Self impedance: O(M) for M segments
- Mutual impedance: O(M²) comparisons
- **Bottleneck**: Neumann integral computation

**Solver**:
- Direct (LU): O(M³) time, O(M²) space
- Iterative (GMRES): O(k*M²) for k iterations
- **Memory limit**: ~10,000 unknowns for direct, ~100,000 for iterative

**Postprocessor**:
- Field calculation: O(M*P) for P observation points
- Directivity: O(M*Nθ*Nφ) for radiation pattern grid

### Optimization Strategies

1. **Vectorization**: Use NumPy broadcasting instead of Python loops
2. **Sparse Matrices**: Use `scipy.sparse` for large problems
3. **Parallel Processing**:
   - Frequency sweep: Parallelize over frequencies
   - Field calculation: Parallelize over observation points
4. **Caching**: Memoize geometry-dependent calculations
5. **Progressive Refinement**: Start with coarse mesh, refine if needed

### AWS Lambda Limitations

**Memory**: Max 10,240 MB (10 GB)
**Timeout**: Max 15 minutes
**Ephemeral Storage**: Max 10 GB

**Strategies**:
- For large problems, split into sub-problems
- Use Step Functions to chain multiple invocations
- Consider Fargate for very large simulations (future)

---

## Security Considerations

### Standalone Deployment

1. **API Authentication**: JWT tokens or API keys
2. **Database**: Strong passwords, no default credentials
3. **Storage**: Encrypt data at rest
4. **Docker**: Non-root users, minimal images
5. **Network**: Firewall rules, internal Docker network

### AWS Deployment

1. **IAM Roles**: Least privilege principle
2. **API Gateway**: API keys, throttling, WAF
3. **Lambda**: VPC isolation (if needed)
4. **S3**: Bucket policies, encryption (SSE-S3 or SSE-KMS)
5. **DynamoDB**: Encryption at rest, fine-grained access control
6. **Secrets**: AWS Secrets Manager for sensitive data

---

## Monitoring and Logging

### Logging Strategy

**Structured Logging**:
```python
import structlog

logger = structlog.get_logger()

logger.info(
    "solver.started",
    project_id=project_id,
    frequency=frequency,
    segments=num_segments
)
```

**Log Levels**:
- DEBUG: Detailed computational steps
- INFO: Workflow progress
- WARNING: Non-critical issues (convergence slow)
- ERROR: Failures, exceptions

### Metrics

**Standalone**:
- Prometheus + Grafana
- Metrics: Request rate, latency, error rate
- System: CPU, memory, disk

**AWS**:
- CloudWatch Metrics
- Custom metrics: Solver convergence, matrix size
- Alarms: High error rate, long execution time

---

## Next Steps After Backend Completion

1. **Documentation**: Comprehensive API docs, tutorials
2. **Performance Testing**: Benchmark against MATLAB, optimize bottlenecks
3. **Example Gallery**: Common antenna designs with results
4. **Frontend Planning**: Begin Phase 2 (Web UI) design
5. **Community**: Open source release, gather feedback

---

## Appendix: Technology Alternatives Considered

### Why Not Alternatives?

**Backend Framework**:
- ~~Flask~~: Less modern, no async support, slower
- ~~Django~~: Too heavyweight, not API-focused
- **FastAPI**: ✓ Modern, fast, async, automatic docs

**Database (Standalone)**:
- ~~MySQL~~: Less feature-rich than PostgreSQL
- ~~MongoDB~~: NoSQL unnecessary for this structure
- **PostgreSQL**: ✓ Mature, JSONB for flexibility, good Python support

**Cloud Provider**:
- ~~Azure~~: Less familiar, smaller ecosystem
- ~~GCP~~: Good, but AWS has better serverless tooling
- **AWS**: ✓ Industry standard, mature Lambda, good SAM support

**Container Orchestration** (Future):
- ~~Docker Swarm~~: Less popular, smaller ecosystem
- **Kubernetes**: ✓ For Phase 4+ if scaling beyond Lambda

---

## References

1. **PEEC Method**:
   - Ruehli, A. E. (1974). "Equivalent circuit models for three-dimensional multiconductor systems"
   - Literature on PEEC for antenna simulation

2. **Python Numerical Computing**:
   - NumPy documentation: https://numpy.org/doc/
   - SciPy documentation: https://docs.scipy.org/

3. **FastAPI**:
   - Official docs: https://fastapi.tiangolo.com/

4. **AWS SAM**:
   - AWS SAM docs: https://docs.aws.amazon.com/serverless-application-model/

5. **Docker**:
   - Best practices: https://docs.docker.com/develop/dev-best-practices/

---

**Document Version**: 1.0  
**Last Updated**: 2025-12-19  
**Status**: Planning Phase - Ready for Implementation
