# FDTD Solver — Guide & Progress Tracker

> **Goal**: Add a Finite-Difference Time-Domain (FDTD) electromagnetic solver to the Antenna Educator platform. The implementation should be educational (readable by graduate students), cost-effective (serverless-first), and follow the same microservice architecture as the existing PEEC solver.

## What is FDTD?

The **Finite-Difference Time-Domain** method is a numerical technique for solving Maxwell's equations directly in the time domain. It discretizes space into a uniform grid (Yee cells) and marches field values forward in time using explicit update equations derived from Maxwell's curl equations.

**Key advantages over PEEC**:
- Handles arbitrary 3D geometries (not limited to wire structures)
- Naturally broadband (one simulation covers all frequencies via Fourier transform)
- Can model dielectric and lossy materials, biological tissues, PCB substrates
- Intuitive time-domain visualization (watch fields propagate)

**Key trade-offs**:
- Memory-intensive (full 3D grid must be stored)
- Requires absorbing boundary conditions (Mur ABC, PML) to truncate the domain
- Staircase approximation of curved surfaces on Cartesian grid
- CFL stability condition limits time step size

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (React)                         │
│  /fdtd/:projectId/design                                        │
│  ┌──────────┐  ┌──────────┐  ┌────────────────┐                │
│  │  Design   │  │  Solver  │  │ Postprocessing │                │
│  │   Tab     │  │   Tab    │  │     Tab        │                │
│  └─────┬─────┘  └────┬─────┘  └──────┬─────────┘               │
└────────┼──────────────┼───────────────┼─────────────────────────┘
         │              │               │
    ┌────▼────┐   ┌─────▼─────┐   ┌────▼──────┐
    │  FDTD   │   │   FDTD    │   │   FDTD    │
    │ Prepro- │   │  Solver   │   │  Postpro- │
    │ cessor  │   │ (Lambda / │   │  cessor   │
    │ :8004   │   │  Fargate) │   │  :8006    │
    │         │   │  :8005    │   │           │
    └─────────┘   └───────────┘   └───────────┘
         │              │               │
    ┌────▼──────────────▼───────────────▼─────┐
    │              Shared Services              │
    │  DynamoDB │ S3 │ Cognito │ Constants     │
    └─────────────────────────────────────────┘
```

## Target Deployment

| Environment | Domain | Purpose |
|---|---|---|
| **FDTD Staging** | `fdtd-stage.nyakyagyawa.com` | Feature branch deployment (isolated) |
| **Production** | `antennaeducator.nyakyagyawa.com` | Merged with PEEC (after `fdtd-integration` → `main`) |

## Implementation Phases

| Phase | Description | Status |
|---|---|---|
| **0.1** | Branch + Copilot instructions + guide files | ✅ Done |
| **0.2** | Project type infrastructure (PEEC/FDTD selection) | ⬜ Not started |
| **1.1** | FDTD domain models (`backend/common/models/fdtd.py`) | ⬜ Not started |
| **1.2** | FDTD Preprocessor service | ⬜ Not started |
| **1.3** | FDTD Solver — 1D + 2D engines | ⬜ Not started |
| **1.4** | FDTD Postprocessor service | ⬜ Not started |
| **2.1** | Frontend Redux slices | ⬜ Not started |
| **2.2** | Frontend API clients | ⬜ Not started |
| **2.3** | Frontend FDTD Design Page + components | ⬜ Not started |
| **2.4** | Frontend TypeScript types | ⬜ Not started |
| **3.1** | Terraform — FDTD staging environment | ⬜ Not started |
| **3.2** | CI/CD pipeline for fdtd-integration | ⬜ Not started |
| **3.3** | Docker Compose — FDTD services | ⬜ Not started |
| **3.4** | Deployment scripts | ⬜ Not started |
| **4.1** | Unit tests (TDD — alongside implementation) | ⬜ Not started |
| **4.2** | Physics validation tests | ⬜ Not started |
| **4.3** | Integration tests | ⬜ Not started |
| **4.4** | Frontend tests | ⬜ Not started |
| **5** | Demo examples (4 projects) | ⬜ Not started |
| **6** | GPU solver (Fargate Spot + CuPy) | ⬜ Not started |

## Demo Examples

| # | Demo | Purpose | Key Physics |
|---|---|---|---|
| 1 | **Broadband Antenna** (bow-tie) | Wideband antenna characterization | S11, impedance bandwidth, radiation pattern |
| 2 | **Ground Penetrating Radar** | Pulse propagation in layered media | B-scan, reflectometry, target detection |
| 3 | **Bio EM SAR** | RF exposure safety assessment | SAR distribution, tissue penetration depth |
| 4 | **EMC/EMI** (PCB trace) | Signal integrity & interference | Near-field emissions, S-parameters, coupling |

Each demo has two presets:
- **Small** (Lambda-friendly): grid ≤ 50³, solves in < 30s
- **Large** (GPU): realistic dimensions, requires Fargate Spot

## Key Reference Files

| What | Where |
|---|---|
| Full implementation plan | `docs/FDTD_IMPLEMENTATION_PLAN.md` |
| FDTD Copilot instructions | `.github/copilot-instructions-fdtd.md` |
| General Copilot instructions | `.github/copilot-instructions.md` |
| Physical constants | `backend/common/constants.py` |
| Solver type enum | `backend/common/models/solver_results.py` |
| FDTD solver stub | `backend/solver_fdtd/main.py` |
| PEEC solver (reference pattern) | `backend/solver/` |
| PEEC frontend (reference pattern) | `frontend/src/features/design/` |
| Terraform staging (reference) | `terraform/environments/staging/main.tf` |
| CI/CD pipeline (reference) | `.github/workflows/aws-build-and-merge.yml` |

## FDTD Physics Checklist

These analytical benchmarks must pass (`@pytest.mark.critical`) before the solver is considered correct:

- [ ] **Free-space propagation**: Gaussian pulse travels at c₀, no numerical dispersion at small Courant number
- [ ] **Dielectric interface**: Reflection coefficient matches Fresnel equation $R = (n_1 - n_2)/(n_1 + n_2)$
- [ ] **PEC cavity resonance** (1D): Resonant frequencies at $f_n = nc_0/(2L)$
- [ ] **Rectangular waveguide cutoff**: TE₁₀ mode cutoff at $f_c = c_0/(2a)$
