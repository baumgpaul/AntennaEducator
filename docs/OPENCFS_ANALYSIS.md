# OpenCFS (Coupled Field Simulation) — Comprehensive Codebase Analysis

## 1. Overview

**openCFS** is a research-grade, multi-physics finite element method (FEM) simulation platform with ~20 years of development history (TU Wien / University of Klagenfurt). Licensed under MIT. Written in C++ with Fortran components. Version 26.01 ("Just Jacobians").

- **Homepage**: https://www.opencfs.org
- **User docs**: https://opencfs.gitlab.io/userdocu/
- **Doxygen**: https://opencfs.gitlab.io/cfs/doxygen/
- **GitLab**: https://gitlab.com/openCFS/cfs

---

## 2. Top-Level Directory Structure

```
E:\cfs-master\cfs-master\
├── .gitlab-ci.yml          # CI/CD pipeline config
├── .dockerignore
├── CMakeLists.txt          # Root build file (502 lines)
├── README.md
├── CONTRIBUTING.md
├── AUTHORS
├── LICENSE                 # MIT
│
├── source/                 # C++ source code (the core)
│   ├── main/               # Entry point (CFS.cc, CFS.hh)
│   ├── PDE/                # Physics modules (ElecPDE, AcousticPDE, MechPDE, etc.)
│   ├── CoupledPDE/         # Multi-physics coupling
│   ├── Driver/             # Analysis drivers (Static, Transient, Harmonic, Eigen)
│   │   ├── SolveSteps/     # Solve step implementations
│   │   └── TimeSchemes/    # Time integration (GLM)
│   ├── Domain/             # Computational domain
│   │   ├── Mesh/           # Grid/mesh handling
│   │   ├── CoefFunction/   # Coefficient functions (materials, fields, PML)
│   │   ├── CoordinateSystems/
│   │   ├── ElemMapping/    # Element-to-entity mapping
│   │   └── Results/        # Result data structures
│   ├── FeBasis/            # Finite element basis functions
│   │   ├── H1/             # H1 conforming (nodal, Lagrange, Legendre)
│   │   ├── HCurl/          # H(curl) edge elements (Nédélec)
│   │   └── L2/             # L2 discontinuous
│   ├── Forms/              # Variational forms
│   │   ├── BiLinForms/     # Bilinear forms (BDBInt, BBInt, ABInt, ADBInt)
│   │   ├── LinForms/       # Linear forms (BUInt, BDUInt, KXInt)
│   │   └── Operators/      # Gradient, Curl, Div, Identity, Strain, etc.
│   ├── Materials/          # Material classes per physics
│   ├── MatVec/             # Matrix/vector algebra (CRS, Dense, SBM, VBR)
│   ├── OLAS/               # Linear algebra solver library
│   │   ├── solver/         # CG, GMRES, MINRES, LU, LDL, Richardson, PALM
│   │   ├── precond/        # IC0, ILU0, ILUK, ILUTP, Jacobi, SSOR, MG
│   │   ├── multigrid/      # AMG (algebraic multigrid)
│   │   ├── external/       # External solver wrappers
│   │   │   ├── pardiso/    # Intel MKL Pardiso / Schenk Pardiso
│   │   │   ├── petsc/      # PETSc (MPI parallel)
│   │   │   ├── suitesparse/# CHOLMOD, UMFPACK
│   │   │   ├── superlu/    # SuperLU
│   │   │   ├── lis/        # LIS (OpenMP iterative)
│   │   │   ├── ginkgo/     # Ginkgo (GPU/CUDA AMG)
│   │   │   ├── arpack/     # ARPACK (eigensolvers)
│   │   │   ├── feast/      # FEAST (eigenvalues)
│   │   │   └── phist/      # PHIST (HPC eigensolvers)
│   │   ├── algsys/         # Algebraic system assembly
│   │   ├── graph/          # Graph partitioning
│   │   └── utils/
│   ├── DataInOut/          # I/O subsystem
│   │   ├── SimInOut/       # Mesh readers/writers per format
│   │   │   ├── hdf5/       # HDF5 (native format)
│   │   │   ├── gmsh/       # Gmsh .msh
│   │   │   ├── AnsysCDB/   # ANSYS .cdb
│   │   │   ├── AnsysFile/  # ANSYS binary
│   │   │   ├── Unverg/     # Universal (IDEAS) .unv
│   │   │   ├── CGNS/       # CGNS
│   │   │   ├── VTKBased/   # VTK/Ensight
│   │   │   ├── GiD/        # GiD format
│   │   │   ├── xdmf/       # XDMF (HDF5+XML)
│   │   │   ├── TextOutput/ # Plain text
│   │   │   ├── Streaming/  # WebSocket streaming
│   │   │   ├── python/     # Python-based mesher
│   │   │   ├── internalMesh/ # Internal mesh generator
│   │   │   └── RefElems/   # Reference elements
│   │   ├── ParamHandling/  # XML parameter parsing (Xerces or libxml2)
│   │   ├── ScatteredDataInOut/
│   │   └── Logging/
│   ├── Optimization/       # Topology/shape optimization (SIMP, Level Set, etc.)
│   ├── ODESolve/           # ODE solvers (Euler, RKF45, Rosenbrock)
│   ├── General/            # Environment, Exceptions, Enums
│   ├── Utils/              # Math parser, interpolation, splines, timers
│   ├── cfstool/            # CFS converter/testing tool
│   ├── cfsdat/             # Data analysis tool
│   └── unittests/          # C++ unit tests
│
├── include/                # Generated header templates (def_use_*.hh.in)
│
├── share/
│   ├── xml/                # XML schemas
│   │   ├── CFS-Simulation/ # Simulation input schema (CFS.xsd + sub-schemas)
│   │   │   └── Schemas/    # 34 XSD files defining all PDEs, solvers, BCs
│   │   ├── CFS-Material/   # Material data schema + examples
│   │   └── CFS-Dat/        # Data format schema
│   ├── python/             # Python utilities (~80+ scripts)
│   ├── docker/             # Docker development images
│   ├── doc/                # Developer documentation (markdown)
│   ├── scripts/
│   ├── matlab/
│   └── xsl/                # XSL transformations
│
├── cfsdeps/                # External dependency build scripts (37 libraries)
│
├── Testsuite/              # Comprehensive test suite
│   └── TESTSUIT/
│       ├── Singlefield/    # Single-physics tests
│       │   ├── Electrostatics/  # 27 electrostatic test cases
│       │   ├── Acoustics/
│       │   ├── Mechanics/
│       │   ├── Heat/
│       │   ├── Magnetics/
│       │   ├── Flow/
│       │   └── ...
│       ├── Coupledfield/   # Multi-physics coupling tests (19 categories)
│       ├── Optimization/   # Optimization tests (19 categories)
│       ├── Solver/         # Linear solver tests
│       └── Technical/      # Technical/infrastructure tests
│
├── cmake_modules/          # 28 CMake modules
└── terraform/              # (not present — no cloud infra)
```

---

## 3. Build System & Dependencies

### Build Tool: CMake (minimum 3.16)

**Languages**: C, C++, Fortran

### Build Commands
```bash
mkdir build && cd build
cmake ..
make          # or ninja
./bin/cfs     # Run the solver
```

### Key Build Options (CMake)
| Option | Default | Purpose |
|--------|---------|---------|
| `DEBUG` | OFF | Debug build with asserts (10x slower) |
| `USE_BLAS_LAPACK` | platform | OPENBLAS, MKL, NETLIB, or ACCELERATE |
| `USE_OPENMP` | ON | OpenMP parallelization |
| `USE_PARDISO` | ON | Pardiso direct solver (MKL or Schenk) |
| `USE_PETSC` | OFF | PETSc MPI-parallel solvers |
| `USE_SUITESPARSE` | OFF | CHOLMOD/UMFPACK (GPL) |
| `USE_SUPERLU` | OFF | SuperLU direct solver |
| `USE_LIS` | OFF | LIS iterative solvers (OpenMP) |
| `USE_GINKGO` | OFF | Ginkgo AMG (GPU/CUDA support) |
| `USE_CUDA` | OFF | CUDA acceleration (via Ginkgo) |
| `USE_ARPACK` | OFF | ARPACK eigensolvers |
| `USE_FEAST` | OFF | FEAST eigenvalue solver |
| `USE_CGNS` | OFF | CGNS mesh format |
| `USE_ENSIGHT` | OFF | Ensight Gold format |
| `USE_EMBEDDED_PYTHON` | OFF | Embedded Python optimizer |
| `USE_CGAL` | OFF | CGAL geometry library |
| `USE_METIS` | OFF | Metis graph partitioning |
| `USE_XML_READER` | xerces | Choose `xerces` or `libxml2` |
| `BUILD_CFSTOOL` | ON | Build mesh converter tool |
| `BUILD_UNIT_TESTS` | OFF | Build C++ unit tests |

### External Dependencies (cfsdeps/ — 37 libraries)
All managed via CMake — can be precompiled:

| Category | Libraries |
|----------|-----------|
| **Math** | OpenBLAS, Intel MKL, NETLIB LAPACK |
| **Solvers** | PETSc, SuiteSparse, SuperLU, LIS, Ginkgo, Pardiso (MKL/Schenk) |
| **Eigensolvers** | ARPACK, FEAST, PHIST |
| **I/O** | HDF5, CGNS, VTK, GiDPost |
| **XML** | Xerces-C++, libxml2 |
| **Mesh** | Metis, CGAL, FLANN, libfbi |
| **Math/Other** | Boost (core dep), muparser, Eigen, nlohmann_json |
| **Optimization** | IPOPT, SNOPT, DUMAS (MMA/GCMMA), SCPIP, SGP |
| **Compression** | zlib, lz4 |
| **GPU** | CUDA (via Ginkgo), GHOST |

### Platform Support
- **Linux**: Ubuntu, Debian, Fedora, RHEL/Rocky (CI-tested via Docker)
- **macOS**: Supported (Apple Accelerate for BLAS)
- **Windows**: Supported (Intel compilers + MKL)

---

## 4. Input File Format — XML

OpenCFS uses **XML** for all configuration. Input files are validated against XSD schemas at `share/xml/CFS-Simulation/CFS.xsd`.

### Root Structure
```xml
<?xml version="1.0"?>
<cfsSimulation xmlns="http://www.cfs++.org/simulation">

  <fileFormats>           <!-- I/O specifications -->
    <input>...</input>
    <output>...</output>
    <materialData file="mat.xml" format="xml"/>
  </fileFormats>

  <domain geometryType="3d">  <!-- Computational domain -->
    <regionList>...</regionList>
    <surfRegionList>...</surfRegionList>
    <nodeList>...</nodeList>
  </domain>

  <sequenceStep>          <!-- Analysis sequence (can have multiple) -->
    <analysis>
      <static/>           <!-- or transient, harmonic, eigenFrequency, etc. -->
    </analysis>

    <pdeList>             <!-- One or more PDEs -->
      <electrostatic>     <!-- PDE type -->
        <regionList>...</regionList>
        <bcsAndLoads>...</bcsAndLoads>
        <storeResults>...</storeResults>
      </electrostatic>
    </pdeList>

    <linearSystems>       <!-- Solver configuration -->
      <system>
        <solverList>
          <directLU/>     <!-- or cg, gmres, pardiso, etc. -->
        </solverList>
      </system>
    </linearSystems>
  </sequenceStep>

</cfsSimulation>
```

### Analysis Types
| Type | XML Element | Description |
|------|------------|-------------|
| Static | `<static/>` | Single-step steady state |
| Transient | `<transient>` | Time-stepping (numSteps, deltaT) |
| Harmonic | `<harmonic>` | Frequency sweep (startFreq, stopFreq, numFreq) |
| Multi-Harmonic | `<multiharmonic>` | Harmonic balance |
| Eigenfrequency | `<eigenFrequency>` | Modal analysis |
| Eigenvalue | `<eigenValue>` | General eigenvalue |
| Buckling | `<buckling>` | Buckling analysis |
| Inverse Source | `<inverseSource>` | Inverse problem |
| Harmonic 2.5D | `<harmonic25d>` | 2.5D harmonic |

### Material Data Format (XML)
Separate XML file validated against `CFS-Material/CFS_Material.xsd`:
```xml
<?xml version='1.0' encoding='utf-8'?>
<cfsMaterialDataBase xmlns="http://www.cfs++.org/material">
  <material name="silizium">
    <electric>
      <permittivity>
        <linear>
          <isotropic>
            <real>8.854000E-12</real>
          </isotropic>
          <!-- OR full tensor: -->
          <tensor dim1="3" dim2="3">
            <real>
              8.85419E-12 0.0 0.0
              0.0 8.85419E-12 0.0
              0.0 0.0 8.85419E-12
            </real>
          </tensor>
        </linear>
      </permittivity>
    </electric>
  </material>
</cfsMaterialDataBase>
```

Material schemas exist for: acoustic, electric, magnetic, electro-conduction, elec-quasistatic, magneto-strictive, mechanical, piezoelectric, pyroelectric, thermoelastic, heat conduction, flow, smooth, test.

---

## 5. Mesh Handling

### Supported Input Formats (10 formats)

| Format | XML Tag | File Extension | Notes |
|--------|---------|---------------|-------|
| **HDF5** | `<hdf5>` | `.h5` | Native CFS format — most complete (mesh + data + restart) |
| **Gmsh** | `<gmsh>` | `.msh` | Gmsh ASCII/binary mesh — widely used |
| **COMSOL** | `<mphtxt>` | `.mphtxt` | COMSOL Multiphysics text mesh |
| **ANSYS CDB** | `<cdb>` | `.cdb` | ANSYS command database |
| **ANSYS Binary** | via cfstool | `.in` | ANSYS binary format |
| **UNV** | `<unv>` | `.unv` | Universal (I-DEAS/Salome) |
| **CGNS** | `<cgns>` | `.cgns` | CFD General Notation System |
| **Ensight** | `<ensight>` | `.case` | Ensight Gold format (requires VTK) |
| **Internal** | `<internal>` | — | Built-in mesh generator |
| **Python** | `<python>` | — | Python-scripted mesh creation |

The original CFS `.mesh` format (ASCII, legacy from CAPA predecessor) is also supported via `<mesh>`.

### Input specification in XML:
```xml
<fileFormats>
  <input>
    <gmsh fileName="my_mesh.msh" scaleFac="0.001"/>
    <!-- or -->
    <hdf5 fileName="my_mesh.h5"/>
  </input>
</fileFormats>
```

### Gmsh region naming: Physical entities in Gmsh map to CFS regions. Named physical entities are used directly; integer-indexed ones can be renamed in XML:
```xml
<gmsh fileName="mesh.msh">
  <region name="myRegion" physicalEntity="1"/>
</gmsh>
```

### Element Types
- **3D**: TET4, TET10, HEX8, HEX20, HEX27, WEDGE15, WEDGE18, PYRA5, PYRA13, PYRA14
- **2D**: TRI3, TRI6, QUAD4, QUAD8, QUAD9
- **1D**: LINE2, LINE3
- Mixed meshes are supported

### Geometry Modes
- `plane` — 2D planar
- `axi` — Axisymmetric
- `3d` — Full 3D

---

## 6. Physics Modules (PDEs)

### Class Hierarchy
```
BasePDE (abstract)
  └── StdPDE (base for single + direct coupled)
        └── SinglePDE (all single-physics PDEs)
              ├── ElecPDE            — Electrostatic
              ├── ElecCurrentPDE     — Electric conduction
              ├── ElecQuasiStaticPDE — Electro-quasistatic
              ├── AcousticPDE        — Acoustics (pressure)
              ├── AcousticMixedPDE   — Mixed acoustic formulation
              ├── AcousticSplitPDE   — Split acoustic formulation
              ├── MechPDE            — Solid mechanics
              ├── HeatPDE            — Heat conduction
              ├── MagneticPDE        — Magnetic (scalar potential)
              ├── MagEdgePDE         — Magnetic (edge/Nédélec elements)
              ├── MagEdgeMixedAVPDE  — Mixed A-V magnetic
              ├── MagEdgeSpecialAVPDE
              ├── MagneticScalarPotentialPDE
              ├── DarwinPDE          — Darwin approximation (low-freq EM)
              ├── FlowPDE            — Fluid flow (Navier-Stokes)
              ├── LinFlowPDE         — Linearized flow
              ├── PerturbedFlowPDE   — Perturbed flow
              ├── SmoothPDE          — Mesh smoothing
              ├── WaterWavePDE       — Water wave propagation
              ├── LatticeBoltzmannPDE — LBM
              └── TestPDE            — Test purposes
```

### Coupling Combinations (DirectCoupledPDE, IterCoupledPDE)
- Acoustic-Mechanic (piezo speakers, vibro-acoustics)
- Piezoelectric (ElecMech)
- Magneto-strictive (MagMech)
- Fluid-Mechanic (FSI)
- Linear Flow-Acoustic (aero-acoustics)
- Flow-Heat, Flow-Mechanic
- Water Wave-Acoustic, Water Wave-Mechanic
- ElecTherm (Joule heating)
- 3-way: MagMechAcou, MechSmoothAcouElectrostatic, LinFlowMechSmooth

### Electrostatic PDE — Details

**Primary unknown**: Electric potential φ (scalar, H1 space)

**Governing equation**: ∇ · (ε ∇φ) = -ρ (Laplace/Poisson)

**Boundary conditions**:
| BC | XML Element | Description |
|----|------------|-------------|
| Ground | `<ground>` | φ = 0 (homog. Dirichlet) |
| Potential | `<potential value="V">` | φ = V (inhomog. Dirichlet) |
| Charge | `<charge>` | Total charge on nodes/surface/volume |
| Charge Density | `<chargeDensity>` | Volume charge density (RHS) |
| Flux Density | `<fluxDensity>` | Normal D-field (Neumann) |
| Polarization | `<polarization>` | Constant polarization field |
| Constraint | `<constraint>` | Equipotential surface |
| Bloch Periodic | `<blochPeriodic>` | Periodic BCs for unit cells |
| Field Parallel | `<fieldParallel>` | En=0 (tangential E only) |

**Available results**:
| Category | Results |
|----------|---------|
| Node | elecPotential, lagrangeMultiplier, elecRhsLoad |
| Element | elecFieldIntensity, elecFluxDensity, elecEnergyDensity, elecPolarization, elecElemPermittivity |
| Region | elecEnergy |
| Surface Element | elecSurfaceChargeDensity, elecForceDensity |
| Surface Region | elecCharge, elecForce |

**Nonlinearities**: Hysteresis (Preisach model), nonlinear permittivity curves

**Damping**: PML (Perfectly Matched Layer), mapping layers

---

## 7. Solver Architecture

### Discretization Approach

**Standard FEM** with:
- H1-conforming nodal elements (standard for scalar PDEs like electrostatics, acoustics, heat)
- H(curl) Nédélec edge elements (for electromagnetic vector potentials)
- L2 discontinuous elements
- Higher-order p-FEM: Legendre, Lagrange polynomial bases (arbitrary order)
- Static condensation for p-FEM efficiency

### Bilinear Form Integrators
| Integrator | Formula | Usage |
|-----------|---------|-------|
| BDBInt | B^T D B | Standard stiffness (gradient × material × gradient) |
| BBInt | B^T B | Mass-type forms |
| ABInt | A^T B | Asymmetric coupling |
| ADBInt | A^T D B | Asymmetric with material |

Where **B** is the differential operator (Gradient, Curl, Div, Identity, Strain, etc.) and **D** is the material tensor (coefficient function).

### Assembly Process (from TourCFS.md)
```
assemble_->AssembleMatrices();    // Element loop → global K, M, C
assemble_->AssembleLinRHS();      // Element loop → global RHS
PDE_.SetRhsValues();              // Apply load values
PDE_.SetBCs();                    // Apply BCs
algsys_->ConstructEffectiveMatrix(...);
algsys_->BuildInDirichlet();      // Enforce Dirichlet BCs
algsys_->Solve();                 // Solve Ax=b
algsys_->GetSolutionVal(solVec_); // Extract solution
```

### Dirichlet BC Handling
- **Elimination** (default): Rows/columns removed
- **Penalty**: Large penalty values

### Linear Solvers (OLAS Library + External)

| Solver | Type | Backend |
|--------|------|---------|
| CG | Iterative, SPD | Built-in OLAS |
| GMRES | Iterative, general | Built-in OLAS |
| MINRES | Iterative, symmetric | Built-in OLAS |
| Richardson | Iterative | Built-in OLAS |
| LU | Direct | LAPACK |
| LDL | Direct | Built-in |
| Pardiso | Direct, sparse | Intel MKL or Schenk |
| CHOLMOD | Direct, SPD | SuiteSparse (GPL) |
| UMFPACK | Direct, general | SuiteSparse (GPL) |
| SuperLU | Direct, general | SuperLU |
| LIS | Iterative (OpenMP) | LIS |
| Ginkgo | Iterative + AMG (GPU) | Ginkgo |
| PETSc | All types (MPI) | PETSc |
| PALM | Model order reduction | ARPACK+SuperLU |

### Preconditioners
IC0, ILU0, ILUK, ILUTP, Jacobi, SSOR, Algebraic Multigrid (AMG), Block-diagonal, SBM preconditioners

### Eigensolvers
ARPACK, FEAST, PHIST, quadratic eigenvalue solver

---

## 8. Output / Postprocessing

### Output Formats

| Format | XML Tag | Description |
|--------|---------|-------------|
| **HDF5** | `<hdf5/>` | Native — most complete (mesh + all results + restart data) |
| **Gmsh** | `<gmsh/>` | Gmsh .pos post-processing format |
| **XDMF** | `<xdmf/>` | XDMF+HDF5 (ParaView-compatible) |
| **Text** | `<text/>` | Plain text history data |
| **GiD** | `<gid/>` | GiD postprocessing format |
| **Ensight** | `<ensight/>` | Ensight Gold case format |
| **Streaming** | (internal) | WebSocket live streaming |

### Output Specification
```xml
<fileFormats>
  <output>
    <hdf5 id="h5"/>
    <text id="txt"/>
  </output>
</fileFormats>
```

Results can target specific outputs via `outputIds="h5,txt"`.

### Post-Processing Operations
- **sum**: Spatial or temporal reduction
- **max**: Maximum over space or time
- Custom post-processing chains via `postProcList`

### Info XML Output
Every simulation generates a `{name}.info.xml` with: status (running/finished/aborted), timing, memory usage, environment, math parser variables, warnings/errors.

---

## 9. Complete Electrostatic Simulation Example

### Files required:
1. **Mesh** (e.g., `Cube3d_TET10.h5` or `cube.msh` from Gmsh)
2. **Material** (`mat.xml`)
3. **Simulation** (`simulation.xml`)

### Step 1: Create mesh with Gmsh (`cube.geo`)
```
Point(1) = {-1, -1, -1, 2.0};
Point(2) = {1, -1, -1, 2.0};
Point(3) = {1, 1, -1, 2.0};
Point(4) = {-1, 1, -1, 2.0};
Line(1) = {1, 2}; Line(2) = {2, 3}; Line(3) = {3, 4}; Line(4) = {4, 1};
Line Loop(5) = {2, 3, 4, 1};
Plane Surface(6) = {5};
Extrude {0, 0, 2} { Surface{6}; Layers{2}; Recombine; }
Physical Surface("lower") = {27};
Physical Surface("upper") = {19};
Physical Volume("elec3d") = {1};
```
Generate: `gmsh cube.geo -3 -o cube.msh`

### Step 2: Material file (`mat.xml`)
```xml
<?xml version='1.0' encoding='utf-8'?>
<cfsMaterialDataBase xmlns="http://www.cfs++.org/material">
  <material name="silizium">
    <electric>
      <permittivity>
        <linear>
          <isotropic><real>8.854e-12</real></isotropic>
        </linear>
      </permittivity>
    </electric>
  </material>
</cfsMaterialDataBase>
```

### Step 3: Simulation file (`sim.xml`)
```xml
<?xml version="1.0"?>
<cfsSimulation xmlns="http://www.cfs++.org/simulation">
  <fileFormats>
    <input>
      <gmsh fileName="cube.msh"/>
    </input>
    <output>
      <hdf5/>
    </output>
    <materialData file="mat.xml" format="xml"/>
  </fileFormats>

  <domain geometryType="3d">
    <regionList>
      <region name="elec3d" material="silizium"/>
    </regionList>
    <nodeList>
      <nodes name="lower"/>
      <nodes name="upper"/>
    </nodeList>
  </domain>

  <sequenceStep>
    <analysis><static/></analysis>
    <pdeList>
      <electrostatic>
        <regionList>
          <region name="elec3d"/>
        </regionList>
        <bcsAndLoads>
          <ground name="lower"/>
          <potential name="upper" value="1.0"/>
        </bcsAndLoads>
        <storeResults>
          <nodeResult type="elecPotential"><allRegions/></nodeResult>
          <elemResult type="elecFieldIntensity"><allRegions/></elemResult>
          <regionResult type="elecEnergy"><allRegions/></regionResult>
        </storeResults>
      </electrostatic>
    </pdeList>
    <linearSystems>
      <system>
        <solverList><directLU/></solverList>
      </system>
    </linearSystems>
  </sequenceStep>
</cfsSimulation>
```

### Step 4: Run
```bash
./cfs sim.xml
```

### Output Files:
- `sim.cfs.h5` — HDF5 results (mesh + solution)
- `sim.info.xml` — Run metadata
- View in ParaView via XDMF, or convert with `cfstool`

---

## 10. Execution Flow (CFS.cc)

```
main(argc, argv)
  └── CFS cfs(argc, argv)        // Parse CLI, init logging, set threads
        └── cfs.Run()
              ├── ReadXMLFile()   // Parse simulation XML, validate vs XSD
              ├── SetupIO()       // Create SimInput readers + SimOutput writers
              ├── Domain()        // Create computational domain
              ├── CreateGrid()    // Read mesh from input files
              ├── PostInit()      // Create PDEs, drivers
              │     ├── CreatePDEs()    // Instantiate ElecPDE, MechPDE, etc.
              │     └── driver->Init()  // Initialize analysis driver
              └── SolveProblem()
                    └── driver->SolveProblem()
                          ├── PreStep()     // Init RHS
                          ├── SolveStep()   // Assemble K, assemble RHS,
                          │                 //   apply BCs, solve Ax=b
                          ├── PostStep()    // Post-processing
                          └── StoreResults() // Write to output files
```

---

## 11. Python Utilities & Scripting

### Location: `share/python/` (~80+ scripts)

No REST API or web interface. Python is used for:

| Script | Purpose |
|--------|---------|
| `create_mesh.py` | Mesh generation via Python |
| `mesh_tool.py` | Mesh manipulation utilities |
| `comsol_meshconvert.py` | COMSOL mesh conversion |
| `fieldviz.py` | Field visualization |
| `hdf5_tools.py` / `hdfviz.py` | HDF5 result inspection |
| `postproc.py` | Post-processing helpers |
| `optimization_tools.py` | Optimization utilities |
| `study.py` | Parameter studies |
| `material_catalogue/` | Material database tools |
| `abaqus_reader.py` | Abaqus mesh reader |

### Embedded Python
When built with `USE_EMBEDDED_PYTHON=ON`, CFS can:
- Call Python functions at hooks: `POST_GRID`, `POST_DOMAIN_INIT`, `POST_SOLVE_PROBLEM`
- Use `<python>` section in simulation XML to load scripts
- Python-based coefficient functions
- Python mesh input

### cfstool
Compiled utility for mesh format conversion, testing, and data inspection:
```bash
cfstool convert input.msh output.h5    # Convert Gmsh to HDF5
cfstool info results.cfs.h5            # Inspect HDF5 results
```

---

## 12. Docker / Containerization Support

### Development Docker Images
Located in `share/docker/`:

```dockerfile
ARG BASE_IMAGE
FROM ${BASE_IMAGE}
ARG IMAGE
ARG TAG
LABEL description="CFS++ devel image based on ${IMAGE}:${TAG}"
COPY share/scripts/mdsh .
COPY share/doc/developer/build-dependencies/${IMAGE}_${TAG}.md .
RUN ./mdsh --eval ${IMAGE}_${TAG}.md | bash -e -x
RUN useradd -ms /bin/bash developer
USER developer
```

Build:
```bash
export IMAGE=ubuntu TAG=latest
docker build -t cfs-devel-$IMAGE-$TAG \
  --build-arg BASE_IMAGE=$IMAGE:$TAG \
  --build-arg IMAGE=$IMAGE --build-arg TAG=$TAG \
  -f share/docker/Dockerfile .
```

Run:
```bash
docker run -v ~/cfs:/cfs -it cfs-devel-ubuntu-latest bash
cd /cfs && mkdir build && cd build && cmake .. && make
```

### CI/CD
GitLab CI pipeline (`.gitlab-ci.yml`) builds and tests on multiple Linux distros.

### Supported Base Images (tested in CI)
- Ubuntu 20.04, latest, rolling
- Debian 11, latest
- Fedora latest, rawhide
- Rocky Linux 8, 9
- CentOS 7

---

## 13. REST API / Web Interface

**None.** OpenCFS is a command-line batch solver. It reads XML + mesh files, runs the computation, and writes HDF5/text results. There is:
- No REST API
- No web interface
- No HTTP server
- A WebSocket **streaming** output mode (`SimOutputStreaming`) exists for real-time result visualization, but it's not a proper API

---

## 14. Key Insights for Wrapping / Re-implementation

### What CFS Does (Execution Pipeline)
1. **Parse XML** → In-memory parameter tree (ParamNode)
2. **Read Mesh** → Grid object (nodes, elements, regions, surfaces)
3. **Create Material** → Material tensors per region
4. **Create PDE** → Bilinear/linear forms, operators, FE spaces
5. **Create Driver** → Static/Transient/Harmonic loop
6. **Assemble** → Element-by-element → global sparse matrices (K, M, C)
7. **Apply BCs** → Modify matrix/RHS
8. **Solve** → Direct or iterative linear system solve
9. **Post-process** → Derived quantities (E-field, energy, forces)
10. **Write Output** → HDF5 + text

### For Docker Wrapping

**Minimum container needs:**
- Ubuntu 22.04+ base
- GCC, gfortran, CMake
- Intel MKL (for Pardiso + BLAS)
- HDF5
- Boost
- Xerces-C++ or libxml2
- ~20 min build time (parallel)

**Input interface**: XML simulation file + mesh file + material XML
**Output**: HDF5 results file + info.xml

**Suggested container architecture:**
```
[API Gateway Container]
    │
    ├── [Preprocessor] — Mesh reading/conversion (cfstool)
    ├── [Solver]       — Run CFS simulation (cfs binary)
    └── [Postprocessor] — Extract/convert results (HDF5 → JSON/VTU)
```

### For Cloud-Native Re-implementation

**Key abstractions to replicate:**
1. **XML Parameter Tree** → JSON/REST API schema
2. **Mesh Reader** → Service accepting .msh/.h5 uploads
3. **FEM Assembly** → Core compute kernel (hardest to replace)
4. **Linear Solver** → PETSc/SuiteSparse via cloud compute
5. **Result Writer** → S3 storage + streaming

**Electrostatic-specific scope:**
- Single scalar unknown (H1 nodal elements)
- Material: just permittivity tensor (isotropic or anisotropic)
- BCs: Dirichlet (potential/ground), Neumann (charge density)
- Output: potential, E-field, energy, charge, force
- Solvers: CG with IC0 preconditioner sufficient for most cases

**Complexity factors:**
- p-FEM (high-order elements) adds significant complexity
- Multi-physics coupling requires shared mesh infrastructure
- Nonlinear materials (hysteresis) need iterative Newton loops
- Frequency sweeps multiply computation

---

## 15. Testsuite Summary — Electrostatic Tests (27 cases)

| Test Case | Description |
|-----------|-------------|
| Cube3d | 3D capacitor (TET10, PYRA, WEDGE, HEX27) |
| CylCapAxi | Cylindrical capacitor (axisymmetric, p-FEM) |
| Capacitor2dPlane_DepthScaled | 2D plane capacitor |
| ConstPolarized* | Polarized sphere/electret tests (6 variants) |
| Cube2dMortar / Cube3dMortar | Non-conforming mesh tests |
| LShapedDomain | Singularity test |
| MovingMortar | Moving mesh interface |
| Periodic2D / Periodic3D | Periodic boundary conditions |
| PrismaHyst_* | Hysteresis (multi-harmonic, transient) |
| UnitCubeMH_* | Multi-harmonic (linear, nonlinear) |
| UnitCubeNL | Nonlinear electrostatics |
| *VectorPreisach* | Advanced hysteresis models |
| CylinderMH_IDBC | Inhomogeneous Dirichlet + multi-harmonic |
