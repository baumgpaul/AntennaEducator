"""Tests for FEM postprocessor integral quantities: charge and capacitance.

Tests the integration module directly (unit) and the FastAPI endpoints (service).
"""

import numpy as np
import pytest

from backend.common.constants import EPSILON_0
from backend.common.models.fem.mesh import (
    BoundaryEdge,
    ElementType,
    FEMElement,
    FEMMesh,
    FEMNode,
    Region,
)
from backend.common.models.fem.results import VectorFieldResult
from backend.fem_postprocessor.integrals import (
    compute_capacitance,
    integrate_surface_charge,
)

# ---------------------------------------------------------------------------
# Mesh helpers
# ---------------------------------------------------------------------------


def _make_plate_capacitor_mesh(nx: int, ny: int) -> FEMMesh:
    """Structured Tri3 mesh on [0,1]×[0,1] with labelled boundaries."""
    nodes = []
    for iy in range(ny + 1):
        for ix in range(nx + 1):
            nid = iy * (nx + 1) + ix
            nodes.append(FEMNode(id=nid, coords=[ix / nx, iy / ny]))

    elements = []
    eid = 0
    for iy in range(ny):
        for ix in range(nx):
            n0 = iy * (nx + 1) + ix
            n1 = n0 + 1
            n2 = n0 + (nx + 1) + 1
            n3 = n0 + (nx + 1)
            elements.append(
                FEMElement(
                    id=eid,
                    element_type=ElementType.TRI3,
                    node_ids=[n0, n1, n2],
                    region_id=0,
                )
            )
            eid += 1
            elements.append(
                FEMElement(
                    id=eid,
                    element_type=ElementType.TRI3,
                    node_ids=[n0, n2, n3],
                    region_id=0,
                )
            )
            eid += 1

    boundary_edges = []
    beid = 0
    for ix in range(nx):
        n0 = ix
        n1 = ix + 1
        boundary_edges.append(BoundaryEdge(id=beid, node_ids=[n0, n1], region_name="bottom"))
        beid += 1
    for ix in range(nx):
        n0 = ny * (nx + 1) + ix
        n1 = n0 + 1
        boundary_edges.append(BoundaryEdge(id=beid, node_ids=[n0, n1], region_name="top"))
        beid += 1
    for iy in range(ny):
        n0 = iy * (nx + 1)
        n1 = (iy + 1) * (nx + 1)
        boundary_edges.append(BoundaryEdge(id=beid, node_ids=[n0, n1], region_name="left"))
        beid += 1
    for iy in range(ny):
        n0 = iy * (nx + 1) + nx
        n1 = (iy + 1) * (nx + 1) + nx
        boundary_edges.append(BoundaryEdge(id=beid, node_ids=[n0, n1], region_name="right"))
        beid += 1

    regions = [Region(id=0, name="dielectric", material_id="dielectric")]
    return FEMMesh(
        nodes=nodes,
        elements=elements,
        regions=regions,
        boundary_edges=boundary_edges,
        element_type=ElementType.TRI3,
    )


def _make_uniform_d_field(mesh: FEMMesh, dx: float, dy: float) -> VectorFieldResult:
    """Create a uniform D-field for all elements."""
    return VectorFieldResult(
        field_name="displacement_field",
        element_values=[[dx, dy]] * len(mesh.elements),
        unit="C/m²",
        max_magnitude=float(np.sqrt(dx**2 + dy**2)),
    )


# ---------------------------------------------------------------------------
# Unit tests for integrate_surface_charge
# ---------------------------------------------------------------------------


class TestSurfaceChargeIntegration:
    """Test Q = ∫ D·n dΓ for known D-field configurations."""

    def test_uniform_d_field_top_boundary(self):
        """Uniform D = (0, D_y) → Q on top (outward normal +y) = D_y · L.

        For unit square top boundary, L = 1, so Q = D_y.
        """
        mesh = _make_plate_capacitor_mesh(4, 4)
        D_y = EPSILON_0 * 100.0
        d_field = _make_uniform_d_field(mesh, 0.0, D_y)

        Q = integrate_surface_charge(mesh, d_field, "top")
        assert Q == pytest.approx(D_y, rel=1e-10)

    def test_uniform_d_field_bottom_boundary(self):
        """Bottom boundary normal is −y → Q = −D_y · L."""
        mesh = _make_plate_capacitor_mesh(4, 4)
        D_y = EPSILON_0 * 100.0
        d_field = _make_uniform_d_field(mesh, 0.0, D_y)

        Q = integrate_surface_charge(mesh, d_field, "bottom")
        assert Q == pytest.approx(-D_y, rel=1e-10)

    def test_charge_conservation(self):
        """For a uniform D-field, total charge on all boundaries = 0 (Gauss)."""
        mesh = _make_plate_capacitor_mesh(3, 3)
        D_y = EPSILON_0 * 50.0
        d_field = _make_uniform_d_field(mesh, 0.0, D_y)

        Q_total = 0.0
        for bname in ["top", "bottom", "left", "right"]:
            Q_total += integrate_surface_charge(mesh, d_field, bname)

        assert Q_total == pytest.approx(0.0, abs=1e-20)

    def test_nonexistent_boundary_returns_zero(self):
        """Integrating over a boundary that doesn't exist gives 0."""
        mesh = _make_plate_capacitor_mesh(2, 2)
        d_field = _make_uniform_d_field(mesh, 0.0, 1.0)

        Q = integrate_surface_charge(mesh, d_field, "nonexistent")
        assert Q == 0.0


# ---------------------------------------------------------------------------
# Unit tests for compute_capacitance
# ---------------------------------------------------------------------------


class TestCapacitance:
    """Test C = Q / V for parallel plate capacitor."""

    def test_parallel_plate_capacitance(self):
        """For unit square vacuum capacitor: C = ε₀·A/d = ε₀.

        With V = 100, D = ε₀·E = ε₀·100.
        Q = D · L = ε₀ · 100 · 1 = 100·ε₀.
        C = Q / V = ε₀.
        """
        mesh = _make_plate_capacitor_mesh(4, 4)
        D_y = EPSILON_0 * 100.0
        d_field = _make_uniform_d_field(mesh, 0.0, D_y)

        C = compute_capacitance(mesh, d_field, "top", voltage_difference=100.0)
        assert C == pytest.approx(EPSILON_0, rel=1e-10)

    def test_zero_voltage_raises(self):
        """V = 0 should raise ValueError."""
        mesh = _make_plate_capacitor_mesh(2, 2)
        d_field = _make_uniform_d_field(mesh, 0.0, 1.0)

        with pytest.raises(ValueError, match="non-zero"):
            compute_capacitance(mesh, d_field, "top", voltage_difference=0.0)


# ---------------------------------------------------------------------------
# End-to-end: solver → charge → capacitance
# ---------------------------------------------------------------------------


class TestSolverToCapacitance:
    """Full pipeline: solve electrostatics → extract charge → compute C."""

    def test_capacitance_from_solver(self):
        """Solve plate capacitor, then extract Q and C from D-field.

        Analytical: C = ε₀ for unit square with d=1, A=1.
        """
        from backend.common.models.fem.boundary_conditions import (
            BCType,
            BoundaryCondition,
        )
        from backend.common.models.fem.config import FEMSolverConfig, PDEType
        from backend.common.models.fem.materials import ElectrostaticMaterial
        from backend.fem.solver.pde.electrostatic import solve_electrostatic

        mesh = _make_plate_capacitor_mesh(4, 4)
        materials = {
            "dielectric": ElectrostaticMaterial(
                id="dielectric", name="Vacuum", relative_permittivity=1.0
            ),
        }
        bcs = [
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="bottom", value=0.0),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="top", value=100.0),
        ]
        config = FEMSolverConfig(pde_type=PDEType.ELECTROSTATIC)

        result = solve_electrostatic(mesh, materials, bcs, config)

        # Extract D-field from solver result
        d_field = result.vector_fields["displacement_field"]

        # Charge on top electrode: D·n with outward normal +y and D=(0,-ε₀·100)
        # gives Q = -ε₀·100 (negative = charge flows into capacitor)
        Q_top = integrate_surface_charge(mesh, d_field, "top")
        assert abs(Q_top) == pytest.approx(EPSILON_0 * 100.0, rel=1e-6)

        # Capacitance
        C = compute_capacitance(mesh, d_field, "top", voltage_difference=100.0)
        assert C == pytest.approx(EPSILON_0, rel=1e-6)

    def test_capacitance_scales_with_permittivity(self):
        """C should scale linearly with ε_r."""
        from backend.common.models.fem.boundary_conditions import (
            BCType,
            BoundaryCondition,
        )
        from backend.common.models.fem.config import FEMSolverConfig, PDEType
        from backend.common.models.fem.materials import ElectrostaticMaterial
        from backend.fem.solver.pde.electrostatic import solve_electrostatic

        mesh = _make_plate_capacitor_mesh(4, 4)
        eps_r = 10.0
        materials = {
            "dielectric": ElectrostaticMaterial(
                id="dielectric", name="HiK", relative_permittivity=eps_r
            ),
        }
        bcs = [
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="bottom", value=0.0),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="top", value=50.0),
        ]
        config = FEMSolverConfig(pde_type=PDEType.ELECTROSTATIC)

        result = solve_electrostatic(mesh, materials, bcs, config)
        d_field = result.vector_fields["displacement_field"]

        C = compute_capacitance(mesh, d_field, "top", voltage_difference=50.0)
        assert C == pytest.approx(EPSILON_0 * eps_r, rel=1e-6)
