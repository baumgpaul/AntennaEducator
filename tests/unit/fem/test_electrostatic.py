"""Tests for the electrostatic PDE solver pipeline.

Tests the full pipeline: mesh → assembly → BCs → solve → postprocess.
Includes the parallel-plate capacitor validation test (exact for linear elements).
"""

import numpy as np
import pytest

from backend.common.models.fem.boundary_conditions import (
    BCType,
    BoundaryCondition,
)
from backend.common.models.fem.config import FEMSolverConfig, PDEType
from backend.common.models.fem.materials import ElectrostaticMaterial
from backend.common.models.fem.mesh import (
    BoundaryEdge,
    ElementType,
    FEMElement,
    FEMMesh,
    FEMNode,
    Region,
)
from backend.fem.solver.pde.electrostatic import solve_electrostatic


def _make_plate_capacitor_mesh(nx: int, ny: int) -> FEMMesh:
    """Create a structured Tri3 mesh for a unit-square plate capacitor.

    Nodes numbered row-by-row: node(ix, iy) = iy*(nx+1) + ix
    Each quad cell split into 2 triangles.

    Boundary names: bottom (y=0), top (y=1), left (x=0), right (x=1).
    """
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
            # Lower-right triangle
            elements.append(
                FEMElement(
                    id=eid,
                    element_type=ElementType.TRI3,
                    node_ids=[n0, n1, n2],
                    region_id=0,
                )
            )
            eid += 1
            # Upper-left triangle
            elements.append(
                FEMElement(
                    id=eid,
                    element_type=ElementType.TRI3,
                    node_ids=[n0, n2, n3],
                    region_id=0,
                )
            )
            eid += 1

    # Boundary edges
    boundary_edges = []
    beid = 0
    # Bottom: y=0
    for ix in range(nx):
        n0 = ix
        n1 = ix + 1
        boundary_edges.append(BoundaryEdge(id=beid, node_ids=[n0, n1], region_name="bottom"))
        beid += 1
    # Top: y=1
    for ix in range(nx):
        n0 = ny * (nx + 1) + ix
        n1 = n0 + 1
        boundary_edges.append(BoundaryEdge(id=beid, node_ids=[n0, n1], region_name="top"))
        beid += 1
    # Left: x=0
    for iy in range(ny):
        n0 = iy * (nx + 1)
        n1 = (iy + 1) * (nx + 1)
        boundary_edges.append(BoundaryEdge(id=beid, node_ids=[n0, n1], region_name="left"))
        beid += 1
    # Right: x=1
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


class TestParallelPlateCapacitor:
    """Gold-standard validation: parallel-plate capacitor.

    Geometry: unit square [0,1]×[0,1]
    BCs: φ=0 on bottom (y=0), φ=100 on top (y=1), Neumann on sides
    Material: vacuum (ε_r = 1)

    Analytical solution:
        φ(x,y) = 100·y        (linear in y)
        E = -∇φ = (0, -100)   (uniform, pointing down)
        W = ½ε₀|E|²·A·d      (energy)
        C = ε₀·A/d = ε₀       (capacitance per unit depth, A=d=1)
    """

    @pytest.fixture
    def plate_problem(self):
        """Set up the plate capacitor problem."""
        mesh = _make_plate_capacitor_mesh(nx=4, ny=4)

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

        return mesh, materials, bcs, config

    def test_potential_exact(self, plate_problem):
        """Linear elements solve the linear problem exactly."""
        mesh, materials, bcs, config = plate_problem
        result = solve_electrostatic(mesh, materials, bcs, config)

        # Check potential at every node
        coords = np.array([n.coords for n in mesh.nodes])
        phi = np.array(result.scalar_fields["electric_potential"].node_values)

        expected_phi = 100.0 * coords[:, 1]
        np.testing.assert_allclose(phi, expected_phi, atol=1e-10)

    def test_e_field_uniform(self, plate_problem):
        """E-field should be uniform (0, -100) everywhere."""
        mesh, materials, bcs, config = plate_problem
        result = solve_electrostatic(mesh, materials, bcs, config)

        e_field = np.array(result.vector_fields["electric_field"].element_values)
        for e_elem in e_field:
            np.testing.assert_allclose(e_elem, [0.0, -100.0], atol=1e-10)

    def test_energy(self, plate_problem):
        """Electric energy W = ½ε₀|E|²·Volume.

        For unit square, |E|=100, ε=ε₀:
        W = 0.5 * ε₀ * 100² * 1 = 5000ε₀
        """
        from backend.common.constants import EPSILON_0

        mesh, materials, bcs, config = plate_problem
        result = solve_electrostatic(mesh, materials, bcs, config)

        energy_integral = None
        for iq in result.integrals:
            if iq.name == "electric_energy":
                energy_integral = iq
                break

        assert energy_integral is not None
        expected_energy = 0.5 * EPSILON_0 * 100**2 * 1.0
        assert energy_integral.value == pytest.approx(expected_energy, rel=1e-10)

    def test_result_structure(self, plate_problem):
        """Result should contain expected fields and metadata."""
        mesh, materials, bcs, config = plate_problem
        result = solve_electrostatic(mesh, materials, bcs, config)

        assert "electric_potential" in result.scalar_fields
        assert "electric_field" in result.vector_fields
        assert result.n_dofs == len(mesh.nodes)
        assert result.n_elements == len(mesh.elements)
        assert result.solve_time >= 0.0


class TestCoarserMesh:
    """Verify the solver works on the coarsest possible mesh (2×2)."""

    def test_2x2_plate_capacitor(self):
        mesh = _make_plate_capacitor_mesh(nx=2, ny=2)
        materials = {
            "dielectric": ElectrostaticMaterial(
                id="dielectric", name="Vacuum", relative_permittivity=1.0
            ),
        }
        bcs = [
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="bottom", value=0.0),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="top", value=50.0),
        ]
        config = FEMSolverConfig(pde_type=PDEType.ELECTROSTATIC)

        result = solve_electrostatic(mesh, materials, bcs, config)

        coords = np.array([n.coords for n in mesh.nodes])
        phi = np.array(result.scalar_fields["electric_potential"].node_values)
        expected = 50.0 * coords[:, 1]
        np.testing.assert_allclose(phi, expected, atol=1e-10)


class TestNonUnitPermittivity:
    """Verify material property is correctly used."""

    def test_high_permittivity(self):
        """With ε_r=10, potential is still φ=100y but energy scales by ε_r."""
        from backend.common.constants import EPSILON_0

        mesh = _make_plate_capacitor_mesh(nx=3, ny=3)
        eps_r = 10.0
        materials = {
            "dielectric": ElectrostaticMaterial(
                id="dielectric", name="SiO2", relative_permittivity=eps_r
            ),
        }
        bcs = [
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="bottom", value=0.0),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="top", value=100.0),
        ]
        config = FEMSolverConfig(pde_type=PDEType.ELECTROSTATIC)

        result = solve_electrostatic(mesh, materials, bcs, config)

        # Potential is geometry-dependent, not material-dependent
        coords = np.array([n.coords for n in mesh.nodes])
        phi = np.array(result.scalar_fields["electric_potential"].node_values)
        np.testing.assert_allclose(phi, 100.0 * coords[:, 1], atol=1e-10)

        # Energy scales with ε_r
        energy = next(iq for iq in result.integrals if iq.name == "electric_energy")
        expected_energy = 0.5 * EPSILON_0 * eps_r * 100**2 * 1.0
        assert energy.value == pytest.approx(expected_energy, rel=1e-10)
