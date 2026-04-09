"""End-to-end electrostatic validation tests.

Increment 11 — validates the FEM solver against analytical solutions:
1. Coaxial capacitor — logarithmic potential, O(h²) convergence for Tri3
2. L-shaped domain — reentrant corner field enhancement
3. Mesh convergence study — parallel plate on 3 mesh densities
4. Permittivity sweep — capacitance scales linearly with ε_r
"""

import math

import numpy as np
import pytest

from backend.common.constants import EPSILON_0
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

    regions = [Region(id=0, name="dielectric", material_id="mat")]
    return FEMMesh(
        nodes=nodes,
        elements=elements,
        regions=regions,
        boundary_edges=boundary_edges,
        element_type=ElementType.TRI3,
    )


def _make_annular_mesh(r_inner: float, r_outer: float, n_radial: int, n_angular: int) -> FEMMesh:
    """Create an annular Tri3 mesh for coaxial capacitor tests.

    The annulus is meshed with n_radial layers × n_angular sectors.
    Each quad cell is split into 2 triangles.
    Boundaries: "inner" (r = r_inner), "outer" (r = r_outer).
    """
    nodes = []
    nid = 0
    for ir in range(n_radial + 1):
        r = r_inner + (r_outer - r_inner) * ir / n_radial
        for ia in range(n_angular):
            theta = 2.0 * math.pi * ia / n_angular
            x = r * math.cos(theta)
            y = r * math.sin(theta)
            nodes.append(FEMNode(id=nid, coords=[x, y]))
            nid += 1

    elements = []
    eid = 0
    for ir in range(n_radial):
        for ia in range(n_angular):
            ia_next = (ia + 1) % n_angular
            n0 = ir * n_angular + ia
            n1 = ir * n_angular + ia_next
            n2 = (ir + 1) * n_angular + ia_next
            n3 = (ir + 1) * n_angular + ia
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
    # Inner boundary: first ring
    for ia in range(n_angular):
        ia_next = (ia + 1) % n_angular
        n0 = ia
        n1 = ia_next
        boundary_edges.append(BoundaryEdge(id=beid, node_ids=[n0, n1], region_name="inner"))
        beid += 1
    # Outer boundary: last ring
    for ia in range(n_angular):
        ia_next = (ia + 1) % n_angular
        n0 = n_radial * n_angular + ia
        n1 = n_radial * n_angular + ia_next
        boundary_edges.append(BoundaryEdge(id=beid, node_ids=[n0, n1], region_name="outer"))
        beid += 1

    regions = [Region(id=0, name="dielectric", material_id="mat")]
    return FEMMesh(
        nodes=nodes,
        elements=elements,
        regions=regions,
        boundary_edges=boundary_edges,
        element_type=ElementType.TRI3,
    )


def _make_l_shaped_mesh(n: int) -> FEMMesh:
    """Create an L-shaped domain mesh on [0,1]×[0,1] minus [0.5,1]×[0.5,1].

    The domain is the lower-left 3/4 of the unit square.
    Uses a structured approach: mesh 3 sub-rectangles:
      - Bottom strip [0,1]×[0,0.5]
      - Left-top strip [0,0.5]×[0.5,1]
    A reentrant corner exists at (0.5, 0.5).

    Boundaries: "outer" for the entire outer boundary, "corner_left" and
    "corner_bottom" for the interior edges adjacent to the missing quadrant.
    """
    half = n  # cells per half-side
    # Node grid for the full domain (2n+1)×(2n+1), but skip the top-right
    node_map: dict[tuple[int, int], int] = {}
    nodes = []
    nid = 0
    for iy in range(2 * n + 1):
        for ix in range(2 * n + 1):
            # Skip top-right quadrant: ix > n and iy > n
            if ix > n and iy > n:
                continue
            node_map[(ix, iy)] = nid
            x = ix / (2 * n)
            y = iy / (2 * n)
            nodes.append(FEMNode(id=nid, coords=[x, y]))
            nid += 1

    elements = []
    eid = 0
    for iy in range(2 * n):
        for ix in range(2 * n):
            # Skip cells in the top-right quadrant
            if ix >= n and iy >= n:
                continue
            corners = [(ix, iy), (ix + 1, iy), (ix + 1, iy + 1), (ix, iy + 1)]
            if any(c not in node_map for c in corners):
                continue
            n0, n1 = node_map[corners[0]], node_map[corners[1]]
            n2, n3 = node_map[corners[2]], node_map[corners[3]]
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

    def _add_edge(ix0, iy0, ix1, iy1, name):
        nonlocal beid
        if (ix0, iy0) in node_map and (ix1, iy1) in node_map:
            boundary_edges.append(
                BoundaryEdge(
                    id=beid,
                    node_ids=[node_map[(ix0, iy0)], node_map[(ix1, iy1)]],
                    region_name=name,
                )
            )
            beid += 1

    # Bottom y=0
    for ix in range(2 * n):
        _add_edge(ix, 0, ix + 1, 0, "bottom")
    # Right x=1 (only from y=0 to y=0.5)
    for iy in range(n):
        _add_edge(2 * n, iy, 2 * n, iy + 1, "right")
    # Top of lower strip at y=0.5, from x=0.5 to x=1 (interior corner edges)
    for ix in range(n, 2 * n):
        _add_edge(ix, n, ix + 1, n, "corner_bottom")
    # Right of left-top strip at x=0.5, from y=0.5 to y=1
    for iy in range(n, 2 * n):
        _add_edge(n, iy, n, iy + 1, "corner_left")
    # Top y=1 (only from x=0 to x=0.5)
    for ix in range(n):
        _add_edge(ix, 2 * n, ix + 1, 2 * n, "top")
    # Left x=0
    for iy in range(2 * n):
        _add_edge(0, iy, 0, iy + 1, "left")

    regions = [Region(id=0, name="domain", material_id="mat")]
    return FEMMesh(
        nodes=nodes,
        elements=elements,
        regions=regions,
        boundary_edges=boundary_edges,
        element_type=ElementType.TRI3,
    )


# ---------------------------------------------------------------------------
# Test 1: Coaxial capacitor
# ---------------------------------------------------------------------------


class TestCoaxialCapacitor:
    """Coaxial capacitor: annular domain with logarithmic potential.

    Geometry: annulus R₁ ≤ r ≤ R₂
    BCs: φ(R₁) = V₀, φ(R₂) = 0
    Analytical: φ(r) = V₀ · ln(R₂/r) / ln(R₂/R₁)
    Capacitance per unit length: C/L = 2πε₀ / ln(R₂/R₁)
    """

    R1 = 0.3
    R2 = 1.0
    V0 = 100.0

    def _solve(self, n_radial: int, n_angular: int):
        mesh = _make_annular_mesh(self.R1, self.R2, n_radial, n_angular)
        materials = {
            "mat": ElectrostaticMaterial(id="mat", name="Vacuum", relative_permittivity=1.0),
        }
        bcs = [
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="inner", value=self.V0),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="outer", value=0.0),
        ]
        config = FEMSolverConfig(pde_type=PDEType.ELECTROSTATIC)
        return mesh, solve_electrostatic(mesh, materials, bcs, config)

    def test_potential_log_profile(self):
        """Potential should approximate logarithmic profile."""
        mesh, result = self._solve(n_radial=8, n_angular=24)

        coords = np.array([n.coords for n in mesh.nodes])
        phi = np.array(result.scalar_fields["electric_potential"].node_values)

        r = np.sqrt(coords[:, 0] ** 2 + coords[:, 1] ** 2)
        phi_analytical = self.V0 * np.log(self.R2 / r) / np.log(self.R2 / self.R1)

        # Not exact for Tri3 (logarithmic ≠ linear), but should be close
        rel_error = np.linalg.norm(phi - phi_analytical) / np.linalg.norm(phi_analytical)
        assert rel_error < 0.05, f"Relative L2 error {rel_error:.4f} > 5%"

    def test_convergence_order(self):
        """Refining the mesh should show O(h²) convergence for Tri3."""
        errors = []
        h_values = []

        for n_radial, n_angular in [(4, 12), (8, 24), (16, 48)]:
            mesh, result = self._solve(n_radial, n_angular)

            coords = np.array([n.coords for n in mesh.nodes])
            phi = np.array(result.scalar_fields["electric_potential"].node_values)

            r = np.sqrt(coords[:, 0] ** 2 + coords[:, 1] ** 2)
            phi_analytical = self.V0 * np.log(self.R2 / r) / np.log(self.R2 / self.R1)

            l2_error = np.linalg.norm(phi - phi_analytical) / np.linalg.norm(phi_analytical)
            errors.append(l2_error)
            h_values.append((self.R2 - self.R1) / n_radial)

        # Compute convergence rates between successive refinements
        rates = []
        for i in range(len(errors) - 1):
            rate = math.log(errors[i] / errors[i + 1]) / math.log(h_values[i] / h_values[i + 1])
            rates.append(rate)

        # Expect order ≥ 1.5 (theoretical O(h²), but mesh quality effects)
        for rate in rates:
            assert rate > 1.5, f"Convergence rate {rate:.2f} < 1.5"

    def test_energy_convergence(self):
        """Energy should converge to analytical value with refinement."""
        # Analytical energy per unit length:
        # W/L = πε₀V₀² / ln(R₂/R₁)
        log_ratio = math.log(self.R2 / self.R1)
        w_analytical = math.pi * EPSILON_0 * self.V0**2 / log_ratio

        # Fine mesh
        _, result = self._solve(n_radial=16, n_angular=48)
        energy = next(iq for iq in result.integrals if iq.name == "electric_energy")

        rel_error = abs(energy.value - w_analytical) / w_analytical
        assert rel_error < 0.02, f"Energy relative error {rel_error:.4f} > 2%"


# ---------------------------------------------------------------------------
# Test 2: L-shaped domain — reentrant corner singularity
# ---------------------------------------------------------------------------


class TestLShapedDomain:
    """L-shaped domain: verify field enhancement near the reentrant corner.

    Geometry: [0,1]×[0,1] minus [0.5,1]×[0.5,1]
    BCs: φ=0 on left+bottom, φ=100 on top+right
    The reentrant corner at (0.5, 0.5) should produce enhanced E-field.
    """

    def _solve(self, n: int):
        mesh = _make_l_shaped_mesh(n)
        materials = {
            "mat": ElectrostaticMaterial(id="mat", name="Vacuum", relative_permittivity=1.0),
        }
        bcs = [
            BoundaryCondition(
                bc_type=BCType.DIRICHLET,
                boundary_name="bottom",
                value=0.0,
            ),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="left", value=0.0),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="top", value=100.0),
            BoundaryCondition(bc_type=BCType.DIRICHLET, boundary_name="right", value=100.0),
            BoundaryCondition(
                bc_type=BCType.DIRICHLET,
                boundary_name="corner_bottom",
                value=100.0,
            ),
            BoundaryCondition(
                bc_type=BCType.DIRICHLET,
                boundary_name="corner_left",
                value=100.0,
            ),
        ]
        config = FEMSolverConfig(pde_type=PDEType.ELECTROSTATIC)
        return mesh, solve_electrostatic(mesh, materials, bcs, config)

    def test_field_enhancement_at_corner(self):
        """E-field magnitude near the reentrant corner exceeds the average."""
        mesh, result = self._solve(n=8)

        e_field = np.array(result.vector_fields["electric_field"].element_values)
        e_magnitudes = np.linalg.norm(e_field, axis=1)

        # Find elements near the reentrant corner (0.5, 0.5)
        coords = np.array([n.coords for n in mesh.nodes])
        corner_mags = []
        other_mags = []
        for i, elem in enumerate(mesh.elements):
            centroid = coords[elem.node_ids].mean(axis=0)
            dist_to_corner = np.sqrt((centroid[0] - 0.5) ** 2 + (centroid[1] - 0.5) ** 2)
            if dist_to_corner < 0.15:
                corner_mags.append(e_magnitudes[i])
            else:
                other_mags.append(e_magnitudes[i])

        avg_corner = np.mean(corner_mags)
        avg_elsewhere = np.mean(other_mags)

        # The field near the corner should be significantly enhanced
        assert avg_corner > avg_elsewhere, (
            f"Corner avg |E|={avg_corner:.1f} "
            f"not greater than elsewhere avg={avg_elsewhere:.1f}"
        )

    def test_solution_bounded(self):
        """Potential must lie within the Dirichlet BC range [0, 100]."""
        _, result = self._solve(n=6)
        phi = np.array(result.scalar_fields["electric_potential"].node_values)
        assert np.all(phi >= -1e-10), f"Min phi={phi.min():.4f} < 0"
        assert np.all(phi <= 100.0 + 1e-10), f"Max phi={phi.max():.4f} > 100"

    def test_energy_positive(self):
        """Electric energy must be positive for a non-trivial solution."""
        _, result = self._solve(n=4)
        energy = next(iq for iq in result.integrals if iq.name == "electric_energy")
        assert energy.value > 0.0


# ---------------------------------------------------------------------------
# Test 3: Mesh convergence study — parallel plate
# ---------------------------------------------------------------------------


class TestMeshConvergence:
    """Verify convergence order for parallel plate with Tri3 elements.

    For linear elements and a linear exact solution, the error should be
    at machine precision (since Tri3 can represent φ = a + bx + cy exactly).
    We also verify the energy converges.
    """

    def test_plate_exact_at_all_densities(self):
        """Tri3 reproduces linear potential exactly at any mesh density."""
        for nx, ny in [(2, 2), (4, 4), (8, 8)]:
            mesh = _make_plate_capacitor_mesh(nx, ny)
            materials = {
                "mat": ElectrostaticMaterial(id="mat", name="Vacuum", relative_permittivity=1.0),
            }
            bcs = [
                BoundaryCondition(
                    bc_type=BCType.DIRICHLET,
                    boundary_name="bottom",
                    value=0.0,
                ),
                BoundaryCondition(
                    bc_type=BCType.DIRICHLET,
                    boundary_name="top",
                    value=100.0,
                ),
            ]
            config = FEMSolverConfig(pde_type=PDEType.ELECTROSTATIC)
            result = solve_electrostatic(mesh, materials, bcs, config)

            coords = np.array([n.coords for n in mesh.nodes])
            phi = np.array(result.scalar_fields["electric_potential"].node_values)
            expected = 100.0 * coords[:, 1]
            np.testing.assert_allclose(
                phi,
                expected,
                atol=1e-10,
                err_msg=f"Failed on {nx}×{ny} mesh",
            )

    def test_energy_exact_at_all_densities(self):
        """Energy W = ½ε₀|E|²·V exact for linear solution at any density."""
        expected_energy = 0.5 * EPSILON_0 * 100.0**2 * 1.0

        for nx, ny in [(2, 2), (4, 4), (8, 8)]:
            mesh = _make_plate_capacitor_mesh(nx, ny)
            materials = {
                "mat": ElectrostaticMaterial(id="mat", name="Vacuum", relative_permittivity=1.0),
            }
            bcs = [
                BoundaryCondition(
                    bc_type=BCType.DIRICHLET,
                    boundary_name="bottom",
                    value=0.0,
                ),
                BoundaryCondition(
                    bc_type=BCType.DIRICHLET,
                    boundary_name="top",
                    value=100.0,
                ),
            ]
            config = FEMSolverConfig(pde_type=PDEType.ELECTROSTATIC)
            result = solve_electrostatic(mesh, materials, bcs, config)

            energy = next(iq for iq in result.integrals if iq.name == "electric_energy")
            assert energy.value == pytest.approx(
                expected_energy, rel=1e-10
            ), f"Failed on {nx}×{ny} mesh"

    def test_coaxial_convergence_with_refinement(self):
        """Coaxial error decreases monotonically with mesh refinement."""
        R1, R2, V0 = 0.3, 1.0, 50.0
        errors = []

        for n_r, n_a in [(4, 12), (8, 24), (16, 48)]:
            mesh = _make_annular_mesh(R1, R2, n_r, n_a)
            materials = {
                "mat": ElectrostaticMaterial(id="mat", name="Vacuum", relative_permittivity=1.0),
            }
            bcs = [
                BoundaryCondition(
                    bc_type=BCType.DIRICHLET,
                    boundary_name="inner",
                    value=V0,
                ),
                BoundaryCondition(
                    bc_type=BCType.DIRICHLET,
                    boundary_name="outer",
                    value=0.0,
                ),
            ]
            config = FEMSolverConfig(pde_type=PDEType.ELECTROSTATIC)
            result = solve_electrostatic(mesh, materials, bcs, config)

            coords = np.array([n.coords for n in mesh.nodes])
            phi = np.array(result.scalar_fields["electric_potential"].node_values)
            r = np.sqrt(coords[:, 0] ** 2 + coords[:, 1] ** 2)
            phi_exact = V0 * np.log(R2 / r) / np.log(R2 / R1)
            l2_err = np.linalg.norm(phi - phi_exact) / np.linalg.norm(phi_exact)
            errors.append(l2_err)

        # Error should be strictly decreasing
        for i in range(len(errors) - 1):
            assert errors[i + 1] < errors[i], (
                f"Error not decreasing: "
                f"e[{i}]={errors[i]:.6f} >= e[{i + 1}]={errors[i + 1]:.6f}"
            )


# ---------------------------------------------------------------------------
# Test 4: Permittivity sweep — capacitance linearity
# ---------------------------------------------------------------------------


class TestPermittivitySweep:
    """Sweep ε_r and verify capacitance scales linearly.

    For a parallel-plate capacitor: C = ε₀·ε_r·A/d.
    Energy W = ½CV² = ½ε₀ε_r·|E|²·V.
    Doubling ε_r should double the energy.
    """

    def test_energy_scales_linearly_with_eps_r(self):
        """Energy should be proportional to ε_r."""
        mesh = _make_plate_capacitor_mesh(nx=4, ny=4)
        eps_r_values = [1.0, 2.0, 5.0, 10.0, 50.0, 100.0]
        energies = []

        for eps_r in eps_r_values:
            materials = {
                "mat": ElectrostaticMaterial(
                    id="mat", name="Dielectric", relative_permittivity=eps_r
                ),
            }
            bcs = [
                BoundaryCondition(
                    bc_type=BCType.DIRICHLET,
                    boundary_name="bottom",
                    value=0.0,
                ),
                BoundaryCondition(
                    bc_type=BCType.DIRICHLET,
                    boundary_name="top",
                    value=100.0,
                ),
            ]
            config = FEMSolverConfig(pde_type=PDEType.ELECTROSTATIC)
            result = solve_electrostatic(mesh, materials, bcs, config)

            energy = next(iq for iq in result.integrals if iq.name == "electric_energy")
            energies.append(energy.value)

        # Verify linear scaling: W(ε_r) / W(1) ≈ ε_r
        base_energy = energies[0]
        for eps_r, energy in zip(eps_r_values, energies):
            ratio = energy / base_energy
            assert ratio == pytest.approx(
                eps_r, rel=1e-10
            ), f"Energy ratio at ε_r={eps_r}: {ratio:.6f} ≠ {eps_r}"

    def test_capacitance_exact(self):
        """Capacitance C = W/(½V²) = ε₀·ε_r·A/d for each ε_r."""
        mesh = _make_plate_capacitor_mesh(nx=4, ny=4)

        for eps_r in [1.0, 4.2, 10.0]:
            materials = {
                "mat": ElectrostaticMaterial(id="mat", name="D", relative_permittivity=eps_r),
            }
            bcs = [
                BoundaryCondition(
                    bc_type=BCType.DIRICHLET,
                    boundary_name="bottom",
                    value=0.0,
                ),
                BoundaryCondition(
                    bc_type=BCType.DIRICHLET,
                    boundary_name="top",
                    value=100.0,
                ),
            ]
            config = FEMSolverConfig(pde_type=PDEType.ELECTROSTATIC)
            result = solve_electrostatic(mesh, materials, bcs, config)

            energy = next(iq for iq in result.integrals if iq.name == "electric_energy")
            # C = 2W / V²
            capacitance = 2.0 * energy.value / 100.0**2
            expected_c = EPSILON_0 * eps_r * 1.0 / 1.0  # A=1, d=1
            assert capacitance == pytest.approx(
                expected_c, rel=1e-10
            ), f"C at ε_r={eps_r}: {capacitance:.4e} ≠ {expected_c:.4e}"
