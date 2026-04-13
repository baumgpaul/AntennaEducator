"""Tests for extended electrostatic solver features.

Covers: Neumann BCs, Robin BCs, charge density excitations,
D-field output, energy density output, and integral quantities.
"""

import numpy as np
import pytest

from backend.common.constants import EPSILON_0
from backend.common.models.fem.boundary_conditions import (
    BCType,
    BoundaryCondition,
    Excitation,
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


def _default_materials() -> dict[str, ElectrostaticMaterial]:
    return {
        "dielectric": ElectrostaticMaterial(
            id="dielectric", name="Vacuum", relative_permittivity=1.0
        ),
    }


def _default_config() -> FEMSolverConfig:
    return FEMSolverConfig(pde_type=PDEType.ELECTROSTATIC)


# ---------------------------------------------------------------------------
# D-field and energy density output
# ---------------------------------------------------------------------------


class TestDFieldOutput:
    """Verify D = εE is returned correctly."""

    def test_displacement_field_present(self):
        """Result must contain displacement_field."""
        mesh = _make_plate_capacitor_mesh(3, 3)
        bcs = [
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="bottom", value=0.0),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="top", value=100.0),
        ]
        result = solve_electrostatic(mesh, _default_materials(), bcs, _default_config())

        assert "displacement_field" in result.vector_fields

    def test_d_equals_eps_e_vacuum(self):
        """For vacuum, D = ε₀·E exactly."""
        mesh = _make_plate_capacitor_mesh(3, 3)
        bcs = [
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="bottom", value=0.0),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="top", value=100.0),
        ]
        result = solve_electrostatic(mesh, _default_materials(), bcs, _default_config())

        e_field = np.array(result.vector_fields["electric_field"].element_values)
        d_field = np.array(result.vector_fields["displacement_field"].element_values)

        np.testing.assert_allclose(d_field, EPSILON_0 * e_field, rtol=1e-12)

    def test_d_scales_with_permittivity(self):
        """D = ε₀·ε_r·E — D should scale with ε_r."""
        mesh = _make_plate_capacitor_mesh(3, 3)
        eps_r = 5.0
        materials = {
            "dielectric": ElectrostaticMaterial(
                id="dielectric", name="HiK", relative_permittivity=eps_r
            ),
        }
        bcs = [
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="bottom", value=0.0),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="top", value=100.0),
        ]
        result = solve_electrostatic(mesh, materials, bcs, _default_config())

        e_field = np.array(result.vector_fields["electric_field"].element_values)
        d_field = np.array(result.vector_fields["displacement_field"].element_values)

        np.testing.assert_allclose(d_field, EPSILON_0 * eps_r * e_field, rtol=1e-12)

    def test_d_field_unit(self):
        """D-field unit should be C/m²."""
        mesh = _make_plate_capacitor_mesh(2, 2)
        bcs = [
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="bottom", value=0.0),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="top", value=1.0),
        ]
        result = solve_electrostatic(mesh, _default_materials(), bcs, _default_config())
        assert result.vector_fields["displacement_field"].unit == "C/m²"


class TestEnergyDensityOutput:
    """Verify energy density u_e = ½ε|E|² is returned per element."""

    def test_energy_density_present(self):
        mesh = _make_plate_capacitor_mesh(3, 3)
        bcs = [
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="bottom", value=0.0),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="top", value=100.0),
        ]
        result = solve_electrostatic(mesh, _default_materials(), bcs, _default_config())

        assert "energy_density" in result.scalar_fields
        ed = result.scalar_fields["energy_density"]
        assert len(ed.element_values) == len(mesh.elements)
        # node_values should be empty (element-based field)
        assert len(ed.node_values) == 0

    def test_energy_density_uniform_field(self):
        """For a uniform E-field of (0, -100) in vacuum:
        u_e = ½ε₀·100² = 5000ε₀ everywhere.
        """
        mesh = _make_plate_capacitor_mesh(3, 3)
        bcs = [
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="bottom", value=0.0),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="top", value=100.0),
        ]
        result = solve_electrostatic(mesh, _default_materials(), bcs, _default_config())

        ed = result.scalar_fields["energy_density"]
        expected_ue = 0.5 * EPSILON_0 * 100**2

        for val in ed.element_values:
            assert val == pytest.approx(expected_ue, rel=1e-10)

    def test_energy_density_unit(self):
        mesh = _make_plate_capacitor_mesh(2, 2)
        bcs = [
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="bottom", value=0.0),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="top", value=1.0),
        ]
        result = solve_electrostatic(mesh, _default_materials(), bcs, _default_config())
        assert result.scalar_fields["energy_density"].unit == "J/m²"


# ---------------------------------------------------------------------------
# Neumann BC tests
# ---------------------------------------------------------------------------


class TestNeumannBC:
    """Neumann BC: ε·∂φ/∂n = q_n on a boundary (flux BC).

    The Neumann value is the normal flux D_n = ε·∂φ/∂n.
    For ∇·(ε∇φ) = 0 with Dirichlet φ=0 on bottom and Neumann D_n on top:
        φ(y) = (D_n / ε) · y
        E = (0, −D_n / ε)
    """

    def test_neumann_on_top(self):
        """Dirichlet=0 on bottom, Neumann flux D_n on top.

        D_n = ε₀ · V  gives φ = V·y exactly on the structured mesh.
        """
        V = 50.0  # desired potential at y=1
        D_n = EPSILON_0 * V  # Neumann value = ε₀ · ∂φ/∂n

        mesh = _make_plate_capacitor_mesh(4, 4)
        bcs = [
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="bottom", value=0.0),
            BoundaryCondition(bc_type=BCType.NEUMANN, boundary_name="top", value=D_n),
        ]
        result = solve_electrostatic(mesh, _default_materials(), bcs, _default_config())

        coords = np.array([n.coords for n in mesh.nodes])
        phi = np.array(result.scalar_fields["electric_potential"].node_values)

        # φ = V · y
        expected_phi = V * coords[:, 1]
        np.testing.assert_allclose(phi, expected_phi, atol=1e-8)

    def test_neumann_e_field(self):
        """E-field with Neumann BC should be uniform."""
        V = 30.0
        D_n = EPSILON_0 * V

        mesh = _make_plate_capacitor_mesh(4, 4)
        bcs = [
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="bottom", value=0.0),
            BoundaryCondition(bc_type=BCType.NEUMANN, boundary_name="top", value=D_n),
        ]
        result = solve_electrostatic(mesh, _default_materials(), bcs, _default_config())

        e_field = np.array(result.vector_fields["electric_field"].element_values)
        for e_elem in e_field:
            np.testing.assert_allclose(e_elem, [0.0, -V], atol=1e-8)


# ---------------------------------------------------------------------------
# Robin BC tests
# ---------------------------------------------------------------------------


class TestRobinBC:
    """Robin BC: α·φ + β·(∂φ/∂n) = g.

    Test case: radiation-like BC on top boundary with large α
    (makes the boundary behave almost like Dirichlet).
    """

    def test_robin_approaches_dirichlet(self):
        """With very large α/β, Robin → Dirichlet.

        Robin: α·φ + β·ε·dφ/dn = g  with α very large → φ ≈ g/α on boundary.
        Set α=1e18, β=1, g=100·α → φ ≈ 100 on top.
        Bottom: Dirichlet φ=0.
        Expected: φ ≈ 100·y.
        """
        alpha = 1e18
        beta = 1.0
        g = 100.0 * alpha  # so g/β → 100·α, α/β → α → strong pinning at 100

        mesh = _make_plate_capacitor_mesh(4, 4)
        bcs = [
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="bottom", value=0.0),
            BoundaryCondition(
                bc_type=BCType.ROBIN,
                boundary_name="top",
                value=g,
                alpha=alpha,
                beta=beta,
            ),
        ]
        result = solve_electrostatic(mesh, _default_materials(), bcs, _default_config())

        coords = np.array([n.coords for n in mesh.nodes])
        phi = np.array(result.scalar_fields["electric_potential"].node_values)

        # Should be very close to 100·y
        expected_phi = 100.0 * coords[:, 1]
        np.testing.assert_allclose(phi, expected_phi, atol=0.1)

    def test_robin_zero_beta_raises(self):
        """Beta = 0 should raise ValueError."""
        mesh = _make_plate_capacitor_mesh(2, 2)
        bcs = [
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="bottom", value=0.0),
            BoundaryCondition(
                bc_type=BCType.ROBIN,
                boundary_name="top",
                value=100.0,
                alpha=1.0,
                beta=0.0,
            ),
        ]
        with pytest.raises(ValueError, match="beta must be non-zero"):
            solve_electrostatic(mesh, _default_materials(), bcs, _default_config())


# ---------------------------------------------------------------------------
# Volume charge density tests
# ---------------------------------------------------------------------------


class TestChargeDensity:
    """Volume charge density excitations via Excitation model."""

    def test_charge_density_poisson(self):
        """∇²φ = −ρ/ε on unit square with Dirichlet=0 on all sides.

        Analytical solution for constant ρ on [0,1]×[0,1] with φ=0 on all
        boundaries is complex (double Fourier series). We just verify:
        - The solver runs without error.
        - The solution is non-trivial (max |φ| > 0) when ρ ≠ 0.
        """
        mesh = _make_plate_capacitor_mesh(4, 4)
        bcs = [
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="bottom", value=0.0),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="top", value=0.0),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="left", value=0.0),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="right", value=0.0),
        ]
        excitations = [
            Excitation(
                region_name="dielectric",
                excitation_type="charge_density",
                value=1e-6,
            ),
        ]
        result = solve_electrostatic(
            mesh,
            _default_materials(),
            bcs,
            _default_config(),
            excitations=excitations,
        )

        phi = np.array(result.scalar_fields["electric_potential"].node_values)
        # Non-trivial solution
        assert np.max(np.abs(phi)) > 0.0

    def test_no_charge_density_gives_laplace(self):
        """Without charge density, Poisson reduces to Laplace → same as capacitor."""
        mesh = _make_plate_capacitor_mesh(3, 3)
        bcs = [
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="bottom", value=0.0),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="top", value=100.0),
        ]
        result = solve_electrostatic(mesh, _default_materials(), bcs, _default_config())

        coords = np.array([n.coords for n in mesh.nodes])
        phi = np.array(result.scalar_fields["electric_potential"].node_values)
        np.testing.assert_allclose(phi, 100.0 * coords[:, 1], atol=1e-10)


# ---------------------------------------------------------------------------
# Integral quantities
# ---------------------------------------------------------------------------


class TestIntegralQuantities:
    """Verify the electric_energy integral is returned."""

    def test_energy_integral_present(self):
        mesh = _make_plate_capacitor_mesh(3, 3)
        bcs = [
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="bottom", value=0.0),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="top", value=1.0),
        ]
        result = solve_electrostatic(mesh, _default_materials(), bcs, _default_config())

        names = [iq.name for iq in result.integrals]
        assert "electric_energy" in names

    def test_zero_field_zero_energy(self):
        """If φ=0 everywhere, energy = 0."""
        mesh = _make_plate_capacitor_mesh(2, 2)
        bcs = [
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="bottom", value=0.0),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="top", value=0.0),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="left", value=0.0),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="right", value=0.0),
        ]
        result = solve_electrostatic(mesh, _default_materials(), bcs, _default_config())

        energy = next(iq for iq in result.integrals if iq.name == "electric_energy")
        assert energy.value == pytest.approx(0.0, abs=1e-20)
