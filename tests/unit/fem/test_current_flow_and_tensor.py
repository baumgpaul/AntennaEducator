"""Tests for tensor permittivity, current-flow PDE, and Tri6 element support.

Covers:
- Tensor (anisotropic) permittivity in electrostatic solver
- Current-flow PDE solver (∇·(σ∇V) = 0)
- Resistance/conductance extraction postprocessor
- Tri6 (quadratic) element assembly basics
- Tri6 full PDE solves (electrostatic, current flow)
- Tri6 Neumann/Robin boundary conditions
- Current-source excitations
"""

import numpy as np

from backend.common.constants import EPSILON_0
from backend.common.models.fem.boundary_conditions import (
    BCType,
    BoundaryCondition,
)
from backend.common.models.fem.config import FEMSolverConfig, PDEType
from backend.common.models.fem.materials import ConductionMaterial, ElectrostaticMaterial
from backend.common.models.fem.mesh import (
    BoundaryEdge,
    ElementType,
    FEMElement,
    FEMMesh,
    FEMNode,
    Region,
)
from backend.common.models.fem.results import VectorFieldResult
from backend.fem.solver.core.assembly import (
    assemble_neumann,
    assemble_robin,
    element_stiffness,
)
from backend.fem.solver.pde.current_flow import solve_current_flow
from backend.fem.solver.pde.electrostatic import solve_electrostatic
from backend.fem_postprocessor.integrals import (
    compute_resistance,
    integrate_boundary_current,
)

# ---------------------------------------------------------------------------
# Helper: build structured Tri3 mesh
# ---------------------------------------------------------------------------


def _make_plate_mesh(nx: int, ny: int, width: float = 1.0, height: float = 1.0) -> FEMMesh:
    """Create a structured Tri3 mesh for a [0,width]×[0,height] rectangle.

    Boundary names: bottom, top, left, right.
    Region: 'body' with material_id='mat'.
    """
    nodes = []
    for iy in range(ny + 1):
        for ix in range(nx + 1):
            nid = iy * (nx + 1) + ix
            nodes.append(FEMNode(id=nid, coords=[ix / nx * width, iy / ny * height]))

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

    regions = [Region(id=0, name="body", material_id="mat")]

    return FEMMesh(
        nodes=nodes,
        elements=elements,
        regions=regions,
        boundary_edges=boundary_edges,
        element_type=ElementType.TRI3,
    )


# ===========================================================================
# TENSOR PERMITTIVITY TESTS
# ===========================================================================


class TestTensorPermittivity:
    """Tests for anisotropic (tensor) permittivity support."""

    def test_isotropic_tensor_matches_scalar(self):
        """Tensor ε_r = [[2,0],[0,2]] should give same result as scalar ε_r = 2."""
        mesh = _make_plate_mesh(4, 4)
        bcs = [
            BoundaryCondition(boundary_name="bottom", bc_type=BCType.DIRICHLET, value=0.0),
            BoundaryCondition(boundary_name="top", bc_type=BCType.DIRICHLET, value=100.0),
        ]
        config = FEMSolverConfig(pde_type=PDEType.ELECTROSTATIC)

        # Scalar
        mat_scalar = {
            "mat": ElectrostaticMaterial(id="mat", name="scalar", relative_permittivity=2.0)
        }
        result_scalar = solve_electrostatic(mesh, mat_scalar, bcs, config)

        # Tensor (isotropic)
        mat_tensor = {
            "mat": ElectrostaticMaterial(
                id="mat",
                name="tensor",
                relative_permittivity=[[2.0, 0.0], [0.0, 2.0]],
            )
        }
        result_tensor = solve_electrostatic(mesh, mat_tensor, bcs, config)

        phi_s = result_scalar.scalar_fields["electric_potential"].node_values
        phi_t = result_tensor.scalar_fields["electric_potential"].node_values
        np.testing.assert_allclose(phi_t, phi_s, atol=1e-10)

    def test_anisotropic_tensor_d_field(self):
        """Anisotropic ε should produce D ≠ ε₀·E for off-diagonal terms."""
        mesh = _make_plate_mesh(4, 4)
        bcs = [
            BoundaryCondition(boundary_name="bottom", bc_type=BCType.DIRICHLET, value=0.0),
            BoundaryCondition(boundary_name="top", bc_type=BCType.DIRICHLET, value=100.0),
        ]
        config = FEMSolverConfig(pde_type=PDEType.ELECTROSTATIC)

        # Diagonal anisotropic: ε_x = 1, ε_y = 3
        mat = {
            "mat": ElectrostaticMaterial(
                id="mat",
                name="aniso",
                relative_permittivity=[[1.0, 0.0], [0.0, 3.0]],
            )
        }
        result = solve_electrostatic(mesh, mat, bcs, config)

        # For plate capacitor with BCs in y-direction only,
        # E = (0, -100), so D_y = ε₀ * 3 * (-100) and D_x = 0
        d_field = result.vector_fields["displacement_field"]
        for d_vals in d_field.element_values:
            np.testing.assert_allclose(d_vals[0], 0.0, atol=1e-10)
            np.testing.assert_allclose(d_vals[1], EPSILON_0 * 3.0 * (-100.0), rtol=1e-10)

    def test_anisotropic_energy(self):
        """Energy with anisotropic ε: W = ½ ∫ E·D dΩ."""
        mesh = _make_plate_mesh(4, 4)
        bcs = [
            BoundaryCondition(boundary_name="bottom", bc_type=BCType.DIRICHLET, value=0.0),
            BoundaryCondition(boundary_name="top", bc_type=BCType.DIRICHLET, value=100.0),
        ]
        config = FEMSolverConfig(pde_type=PDEType.ELECTROSTATIC)

        # ε_r = [[1,0],[0,3]],  E = (0,-100), D = ε₀(0, -300)
        # W = ½ * ε₀ * 3 * 100² * 1 (area=1, depth=1)
        mat = {
            "mat": ElectrostaticMaterial(
                id="mat",
                name="aniso",
                relative_permittivity=[[1.0, 0.0], [0.0, 3.0]],
            )
        }
        result = solve_electrostatic(mesh, mat, bcs, config)

        energy = result.integrals[0].value
        expected = 0.5 * EPSILON_0 * 3.0 * 100.0**2
        np.testing.assert_allclose(energy, expected, rtol=1e-10)

    def test_tensor_stiffness_symmetry(self):
        """Element stiffness with tensor material should be symmetric."""
        coords = np.array([[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]])
        eps_tensor = np.array([[2.0, 0.5], [0.5, 3.0]])  # SPD tensor
        K = element_stiffness(coords, eps_tensor, ElementType.TRI3)
        np.testing.assert_allclose(K, K.T, atol=1e-14)


# ===========================================================================
# CURRENT FLOW PDE TESTS
# ===========================================================================


class TestCurrentFlowSolver:
    """Tests for the current-flow PDE: ∇·(σ∇V) = 0."""

    def test_uniform_current_flow(self):
        """Uniform current flow in a unit square conductor.

        σ = 1e6 S/m, V(y=0) = 0, V(y=1) = 1 V
        Analytical: V = y, E = (0, -1), J = σ(0, -1)
        """
        mesh = _make_plate_mesh(4, 4)
        bcs = [
            BoundaryCondition(boundary_name="bottom", bc_type=BCType.DIRICHLET, value=0.0),
            BoundaryCondition(boundary_name="top", bc_type=BCType.DIRICHLET, value=1.0),
        ]
        config = FEMSolverConfig(pde_type=PDEType.CURRENT_FLOW)
        materials = {"mat": ConductionMaterial(id="mat", name="copper", conductivity=1e6)}

        result = solve_current_flow(mesh, materials, bcs, config)

        # Potential should be linear: V = y
        nodes = mesh.nodes
        for i, node in enumerate(nodes):
            y = node.coords[1]
            expected_v = y
            actual_v = result.scalar_fields["electric_potential"].node_values[i]
            np.testing.assert_allclose(actual_v, expected_v, atol=1e-10)

    def test_current_density_uniform(self):
        """J = σE should be uniform for uniform field."""
        mesh = _make_plate_mesh(4, 4)
        bcs = [
            BoundaryCondition(boundary_name="bottom", bc_type=BCType.DIRICHLET, value=0.0),
            BoundaryCondition(boundary_name="top", bc_type=BCType.DIRICHLET, value=1.0),
        ]
        config = FEMSolverConfig(pde_type=PDEType.CURRENT_FLOW)
        sigma = 5e5
        materials = {"mat": ConductionMaterial(id="mat", name="test", conductivity=sigma)}

        result = solve_current_flow(mesh, materials, bcs, config)

        j_field = result.vector_fields["current_density"]
        for j_vals in j_field.element_values:
            np.testing.assert_allclose(j_vals[0], 0.0, atol=1e-4)
            np.testing.assert_allclose(j_vals[1], -sigma, rtol=1e-10)

    def test_power_dissipation(self):
        """Total power P = σ|E|²·Volume = σ·(V/d)²·A·d.

        For unit square: P = σ · 1² · 1 = σ.
        """
        mesh = _make_plate_mesh(4, 4)
        bcs = [
            BoundaryCondition(boundary_name="bottom", bc_type=BCType.DIRICHLET, value=0.0),
            BoundaryCondition(boundary_name="top", bc_type=BCType.DIRICHLET, value=1.0),
        ]
        config = FEMSolverConfig(pde_type=PDEType.CURRENT_FLOW)
        sigma = 2e5
        materials = {"mat": ConductionMaterial(id="mat", name="test", conductivity=sigma)}

        result = solve_current_flow(mesh, materials, bcs, config)

        total_power = result.integrals[0].value
        expected = sigma  # σ·|E|²·Area = σ·1·1
        np.testing.assert_allclose(total_power, expected, rtol=1e-10)

    def test_result_structure(self):
        """Current flow result should contain expected fields and integrals."""
        mesh = _make_plate_mesh(2, 2)
        bcs = [
            BoundaryCondition(boundary_name="bottom", bc_type=BCType.DIRICHLET, value=0.0),
            BoundaryCondition(boundary_name="top", bc_type=BCType.DIRICHLET, value=1.0),
        ]
        config = FEMSolverConfig(pde_type=PDEType.CURRENT_FLOW)
        materials = {"mat": ConductionMaterial(id="mat", name="test", conductivity=1.0)}

        result = solve_current_flow(mesh, materials, bcs, config)

        assert "electric_potential" in result.scalar_fields
        assert "power_density" in result.scalar_fields
        assert "electric_field" in result.vector_fields
        assert "current_density" in result.vector_fields
        assert result.integrals[0].name == "total_power"
        assert result.n_dofs == len(mesh.nodes)
        assert result.n_elements == len(mesh.elements)
        assert result.solve_time > 0

    def test_tensor_conductivity(self):
        """Tensor conductivity [[σ_x, 0], [0, σ_y]] should work correctly."""
        mesh = _make_plate_mesh(4, 4)
        bcs = [
            BoundaryCondition(boundary_name="bottom", bc_type=BCType.DIRICHLET, value=0.0),
            BoundaryCondition(boundary_name="top", bc_type=BCType.DIRICHLET, value=1.0),
        ]
        config = FEMSolverConfig(pde_type=PDEType.CURRENT_FLOW)
        # Anisotropic: σ_x=1, σ_y=3 (only σ_y matters for y-direction flow)
        materials = {
            "mat": ConductionMaterial(
                id="mat",
                name="aniso",
                conductivity=[[1.0, 0.0], [0.0, 3.0]],
            )
        }

        result = solve_current_flow(mesh, materials, bcs, config)

        # J = σ·E, E = (0,-1) → J = (0, -3)
        j_field = result.vector_fields["current_density"]
        for j_vals in j_field.element_values:
            np.testing.assert_allclose(j_vals[0], 0.0, atol=1e-10)
            np.testing.assert_allclose(j_vals[1], -3.0, rtol=1e-10)


# ===========================================================================
# RESISTANCE / CONDUCTANCE EXTRACTION TESTS
# ===========================================================================


class TestResistanceExtraction:
    """Tests for boundary current integration and resistance computation."""

    def _solve_and_get_j_field(
        self, sigma: float, nx: int = 4, ny: int = 4
    ) -> tuple[FEMMesh, VectorFieldResult]:
        """Solve unit-square current flow and return mesh + J field."""
        mesh = _make_plate_mesh(nx, ny)
        bcs = [
            BoundaryCondition(boundary_name="bottom", bc_type=BCType.DIRICHLET, value=0.0),
            BoundaryCondition(boundary_name="top", bc_type=BCType.DIRICHLET, value=1.0),
        ]
        config = FEMSolverConfig(pde_type=PDEType.CURRENT_FLOW)
        materials = {"mat": ConductionMaterial(id="mat", name="test", conductivity=sigma)}
        result = solve_current_flow(mesh, materials, bcs, config)
        return mesh, result.vector_fields["current_density"]

    def test_boundary_current_integration(self):
        """∫ J·n dΓ on top boundary should equal σ (for unit square, ΔV=1)."""
        sigma = 1e5
        mesh, j_field = self._solve_and_get_j_field(sigma)

        current = integrate_boundary_current(mesh, j_field, "top")
        # Current flowing out of the top: J_y = -σ, n = (0,1) outward
        # I = ∫ J·n dΓ = σ * 1 (width) — note sign depends on J direction
        np.testing.assert_allclose(abs(current), sigma, rtol=1e-6)

    def test_resistance_extraction(self):
        """R = V/I = d/(σ·A). For unit square 2D: R = 1/σ per unit depth."""
        sigma = 2e5
        mesh, j_field = self._solve_and_get_j_field(sigma)

        resistance = compute_resistance(mesh, j_field, "top", 1.0)
        expected = 1.0 / sigma
        np.testing.assert_allclose(resistance, expected, rtol=1e-6)

    def test_conductance_is_inverse_resistance(self):
        """G = 1/R = σ·A/d = σ for unit square."""
        sigma = 3e5
        mesh, j_field = self._solve_and_get_j_field(sigma)

        resistance = compute_resistance(mesh, j_field, "top", 1.0)
        conductance = 1.0 / resistance
        np.testing.assert_allclose(conductance, sigma, rtol=1e-6)


# ===========================================================================
# TRI6 ELEMENT STIFFNESS TESTS
# ===========================================================================


class TestTri6Assembly:
    """Tests for Tri6 (quadratic) element stiffness matrix properties."""

    def _make_tri6_coords(self) -> np.ndarray:
        """Reference Tri6: corners + midside nodes."""
        return np.array(
            [
                [0.0, 0.0],  # 0: corner
                [1.0, 0.0],  # 1: corner
                [0.0, 1.0],  # 2: corner
                [0.5, 0.0],  # 3: midside 0-1
                [0.5, 0.5],  # 4: midside 1-2
                [0.0, 0.5],  # 5: midside 2-0
            ]
        )

    def test_tri6_stiffness_is_6x6(self):
        """Tri6 element stiffness should be 6×6."""
        coords = self._make_tri6_coords()
        K = element_stiffness(coords, 1.0, ElementType.TRI6)
        assert K.shape == (6, 6)

    def test_tri6_stiffness_is_symmetric(self):
        """Tri6 element stiffness should be symmetric."""
        coords = self._make_tri6_coords()
        K = element_stiffness(coords, 2.5, ElementType.TRI6)
        np.testing.assert_allclose(K, K.T, atol=1e-14)

    def test_tri6_stiffness_positive_semidefinite(self):
        """Eigenvalues should be ≥ 0 (with one zero for rigid-body mode)."""
        coords = self._make_tri6_coords()
        K = element_stiffness(coords, 1.0, ElementType.TRI6)
        eigvals = np.linalg.eigvalsh(K)
        assert np.all(eigvals > -1e-12)
        # Exactly one zero eigenvalue (constant mode)
        assert np.sum(np.abs(eigvals) < 1e-10) == 1

    def test_tri6_constant_field_gives_zero(self):
        """K @ [1,1,1,1,1,1]^T should be zero (constant potential, no gradient)."""
        coords = self._make_tri6_coords()
        K = element_stiffness(coords, 1.0, ElementType.TRI6)
        ones = np.ones(6)
        np.testing.assert_allclose(K @ ones, 0.0, atol=1e-13)

    def test_tri6_tensor_material_symmetric(self):
        """Tri6 with tensor material should give symmetric stiffness."""
        coords = self._make_tri6_coords()
        eps_tensor = np.array([[2.0, 0.3], [0.3, 4.0]])
        K = element_stiffness(coords, eps_tensor, ElementType.TRI6)
        np.testing.assert_allclose(K, K.T, atol=1e-14)

    def test_tri6_scaled_by_material(self):
        """Scaling material by α should scale stiffness by α."""
        coords = self._make_tri6_coords()
        K1 = element_stiffness(coords, 1.0, ElementType.TRI6)
        K5 = element_stiffness(coords, 5.0, ElementType.TRI6)
        np.testing.assert_allclose(K5, 5.0 * K1, atol=1e-13)


# ===========================================================================
# FEM SOLVER SERVICE INTEGRATION (current flow dispatch)
# ===========================================================================


class TestFEMSolverServiceCurrentFlow:
    """Test that the FEM solver service correctly dispatches current_flow."""

    def test_pde_type_current_flow_registered(self):
        """PDEType.CURRENT_FLOW should be in the solver dispatch table."""
        from backend.fem_solver.main import _PDE_SOLVERS

        assert PDEType.CURRENT_FLOW in _PDE_SOLVERS

    def test_schema_accepts_conduction_material(self):
        """FEMSolveRequest should accept ConductionMaterial."""
        from backend.fem_solver.schemas import FEMSolveRequest

        mesh = _make_plate_mesh(2, 2)
        req = FEMSolveRequest(
            mesh=mesh,
            pde_type=PDEType.CURRENT_FLOW,
            materials={"mat": ConductionMaterial(id="mat", name="test", conductivity=1e6)},
            boundary_conditions=[
                BoundaryCondition(
                    boundary_name="bottom",
                    bc_type=BCType.DIRICHLET,
                    value=0.0,
                ),
            ],
            config=FEMSolverConfig(pde_type=PDEType.CURRENT_FLOW),
        )
        assert req.pde_type == PDEType.CURRENT_FLOW


# ---------------------------------------------------------------------------
# Helper: build structured Tri6 mesh
# ---------------------------------------------------------------------------


def _make_plate_mesh_tri6(nx: int, ny: int, width: float = 1.0, height: float = 1.0) -> FEMMesh:
    """Create a structured Tri6 mesh for a [0,width]×[0,height] rectangle.

    Each quad is split into 2 Tri6 elements with midside nodes.
    Boundary edges have 3 nodes (corner-midside-corner).
    """
    # Step 1: create corner nodes on a (2*nx+1)×(2*ny+1) grid
    # so midpoints align with the half-grid
    fine_nx, fine_ny = 2 * nx, 2 * ny
    n_fine_x, n_fine_y = fine_nx + 1, fine_ny + 1
    all_nodes = []
    for iy in range(n_fine_y):
        for ix in range(n_fine_x):
            nid = iy * n_fine_x + ix
            x = ix / fine_nx * width
            y = iy / fine_ny * height
            all_nodes.append(FEMNode(id=nid, coords=[x, y]))

    def nid(ix, iy):
        return iy * n_fine_x + ix

    # Step 2: create Tri6 elements
    elements = []
    eid = 0
    for iy in range(ny):
        for ix in range(nx):
            # Corners of the quad in fine-grid coords
            cx, cy = 2 * ix, 2 * iy
            # Quad corners: BL, BR, TR, TL
            bl = nid(cx, cy)
            br = nid(cx + 2, cy)
            tr = nid(cx + 2, cy + 2)
            tl = nid(cx, cy + 2)

            # Midside nodes
            bot_mid = nid(cx + 1, cy)
            right_mid = nid(cx + 2, cy + 1)
            top_mid = nid(cx + 1, cy + 2)
            left_mid = nid(cx, cy + 1)
            diag_mid = nid(cx + 1, cy + 1)

            # Lower-right triangle: BL → BR → TR  (midsides: bot, right, diag)
            elements.append(
                FEMElement(
                    id=eid,
                    element_type=ElementType.TRI6,
                    node_ids=[bl, br, tr, bot_mid, right_mid, diag_mid],
                    region_id=0,
                )
            )
            eid += 1
            # Upper-left triangle: BL → TR → TL  (midsides: diag, top, left)
            elements.append(
                FEMElement(
                    id=eid,
                    element_type=ElementType.TRI6,
                    node_ids=[bl, tr, tl, diag_mid, top_mid, left_mid],
                    region_id=0,
                )
            )
            eid += 1

    # Step 3: boundary edges (3-node: corner, corner, midside)
    boundary_edges = []
    beid = 0
    # Bottom: y=0
    for ix in range(nx):
        cx = 2 * ix
        boundary_edges.append(
            BoundaryEdge(
                id=beid,
                node_ids=[nid(cx, 0), nid(cx + 2, 0), nid(cx + 1, 0)],
                region_name="bottom",
            )
        )
        beid += 1
    # Top: y=height
    for ix in range(nx):
        cx = 2 * ix
        boundary_edges.append(
            BoundaryEdge(
                id=beid,
                node_ids=[nid(cx, fine_ny), nid(cx + 2, fine_ny), nid(cx + 1, fine_ny)],
                region_name="top",
            )
        )
        beid += 1
    # Left: x=0
    for iy in range(ny):
        cy = 2 * iy
        boundary_edges.append(
            BoundaryEdge(
                id=beid,
                node_ids=[nid(0, cy), nid(0, cy + 2), nid(0, cy + 1)],
                region_name="left",
            )
        )
        beid += 1
    # Right: x=width
    for iy in range(ny):
        cy = 2 * iy
        boundary_edges.append(
            BoundaryEdge(
                id=beid,
                node_ids=[nid(fine_nx - 1, cy), nid(fine_nx - 1, cy + 2), nid(fine_nx - 1, cy + 1)],
                region_name="right",
            )
        )
        beid += 1

    regions = [Region(id=0, name="body", material_id="mat")]

    return FEMMesh(
        nodes=all_nodes,
        elements=elements,
        regions=regions,
        boundary_edges=boundary_edges,
        element_type=ElementType.TRI6,
    )


# ===========================================================================
# TRI6 FULL SOLVE TESTS
# ===========================================================================


class TestTri6FullSolve:
    """Tests for full PDE solves with Tri6 (quadratic) elements."""

    def test_tri6_electrostatic_plate_capacitor(self):
        """Tri6 plate capacitor: φ = 100·y (exact for quadratic elements)."""
        mesh = _make_plate_mesh_tri6(2, 2)
        bcs = [
            BoundaryCondition(boundary_name="bottom", bc_type=BCType.DIRICHLET, value=0.0),
            BoundaryCondition(boundary_name="top", bc_type=BCType.DIRICHLET, value=100.0),
        ]
        config = FEMSolverConfig(pde_type=PDEType.ELECTROSTATIC)
        materials = {"mat": ElectrostaticMaterial(id="mat", name="vac", relative_permittivity=1.0)}

        result = solve_electrostatic(mesh, materials, bcs, config)

        # Potential should be linear: φ = 100·y
        for i, node in enumerate(mesh.nodes):
            y = node.coords[1]
            phi = result.scalar_fields["electric_potential"].node_values[i]
            np.testing.assert_allclose(phi, 100.0 * y, atol=1e-10)

    def test_tri6_electrostatic_e_field(self):
        """E-field from Tri6 solve: E = (0, -100) everywhere."""
        mesh = _make_plate_mesh_tri6(2, 2)
        bcs = [
            BoundaryCondition(boundary_name="bottom", bc_type=BCType.DIRICHLET, value=0.0),
            BoundaryCondition(boundary_name="top", bc_type=BCType.DIRICHLET, value=100.0),
        ]
        config = FEMSolverConfig(pde_type=PDEType.ELECTROSTATIC)
        materials = {"mat": ElectrostaticMaterial(id="mat", name="vac", relative_permittivity=1.0)}

        result = solve_electrostatic(mesh, materials, bcs, config)

        for e_vals in result.vector_fields["electric_field"].element_values:
            np.testing.assert_allclose(e_vals[0], 0.0, atol=1e-10)
            np.testing.assert_allclose(e_vals[1], -100.0, atol=1e-10)

    def test_tri6_electrostatic_energy(self):
        """Energy from Tri6: W = ½ε₀|E|²·Area = ½·ε₀·10000."""
        mesh = _make_plate_mesh_tri6(2, 2)
        bcs = [
            BoundaryCondition(boundary_name="bottom", bc_type=BCType.DIRICHLET, value=0.0),
            BoundaryCondition(boundary_name="top", bc_type=BCType.DIRICHLET, value=100.0),
        ]
        config = FEMSolverConfig(pde_type=PDEType.ELECTROSTATIC)
        materials = {"mat": ElectrostaticMaterial(id="mat", name="vac", relative_permittivity=1.0)}

        result = solve_electrostatic(mesh, materials, bcs, config)

        energy = result.integrals[0].value
        expected = 0.5 * EPSILON_0 * 100.0**2
        np.testing.assert_allclose(energy, expected, rtol=1e-10)

    def test_tri6_current_flow(self):
        """Tri6 current flow: uniform J = σ(0, -1) for V=0..1."""
        mesh = _make_plate_mesh_tri6(2, 2)
        bcs = [
            BoundaryCondition(boundary_name="bottom", bc_type=BCType.DIRICHLET, value=0.0),
            BoundaryCondition(boundary_name="top", bc_type=BCType.DIRICHLET, value=1.0),
        ]
        config = FEMSolverConfig(pde_type=PDEType.CURRENT_FLOW)
        sigma = 1e5
        materials = {"mat": ConductionMaterial(id="mat", name="cond", conductivity=sigma)}

        result = solve_current_flow(mesh, materials, bcs, config)

        for j_vals in result.vector_fields["current_density"].element_values:
            np.testing.assert_allclose(j_vals[0], 0.0, atol=1e-4)
            np.testing.assert_allclose(j_vals[1], -sigma, rtol=1e-10)

    def test_tri6_tensor_permittivity_full_solve(self):
        """Tri6 with tensor ε should produce correct anisotropic D-field."""
        mesh = _make_plate_mesh_tri6(2, 2)
        bcs = [
            BoundaryCondition(boundary_name="bottom", bc_type=BCType.DIRICHLET, value=0.0),
            BoundaryCondition(boundary_name="top", bc_type=BCType.DIRICHLET, value=100.0),
        ]
        config = FEMSolverConfig(pde_type=PDEType.ELECTROSTATIC)
        materials = {
            "mat": ElectrostaticMaterial(
                id="mat",
                name="aniso",
                relative_permittivity=[[1.0, 0.0], [0.0, 5.0]],
            )
        }

        result = solve_electrostatic(mesh, materials, bcs, config)

        for d_vals in result.vector_fields["displacement_field"].element_values:
            np.testing.assert_allclose(d_vals[0], 0.0, atol=1e-10)
            np.testing.assert_allclose(d_vals[1], EPSILON_0 * 5.0 * (-100.0), rtol=1e-10)


# ===========================================================================
# TRI6 NEUMANN / ROBIN BOUNDARY CONDITION TESTS
# ===========================================================================


class TestTri6NeumannRobin:
    """Tests for 3-node boundary edge integration (Neumann/Robin)."""

    def test_tri6_neumann_load_vector(self):
        """Neumann on 3-node edge should integrate correctly via Simpson's 1/3.

        For a unit-length edge with q_n = 6, Simpson's rule gives:
        f[n0] = 6 * 1/6 = 1, f[n1] = 6 * 1/6 = 1, f[mid] = 6 * 4/6 = 4.
        """
        nodes = [
            FEMNode(id=0, coords=[0.0, 0.0]),
            FEMNode(id=1, coords=[1.0, 0.0]),
            FEMNode(id=2, coords=[0.5, 0.0]),  # midside
            FEMNode(id=3, coords=[0.5, 1.0]),  # dummy node for mesh
        ]
        edges = [
            BoundaryEdge(id=0, node_ids=[0, 1, 2], region_name="flux_edge"),
        ]
        # Minimal mesh with one element
        elements = [
            FEMElement(
                id=0,
                element_type=ElementType.TRI6,
                node_ids=[0, 1, 3, 2, 3, 3],  # not used by neumann
                region_id=0,
            )
        ]
        mesh = FEMMesh(
            nodes=nodes,
            elements=elements,
            regions=[Region(id=0, name="body", material_id="mat")],
            boundary_edges=edges,
            element_type=ElementType.TRI6,
        )

        f_n = assemble_neumann(mesh, {"flux_edge": 6.0})

        np.testing.assert_allclose(f_n[0], 1.0, atol=1e-14)
        np.testing.assert_allclose(f_n[1], 1.0, atol=1e-14)
        np.testing.assert_allclose(f_n[2], 4.0, atol=1e-14)

    def test_tri6_robin_mass_matrix_symmetry(self):
        """Robin on 3-node edge: boundary mass matrix should be symmetric.

        Mass matrix M = (L/30) [[4, 2, -1], [2, 4, -1], [-1, -1, 16]]
        For L=1, α/β=1, g/β=0 → only K_r gets contributions.
        """
        nodes = [
            FEMNode(id=0, coords=[0.0, 0.0]),
            FEMNode(id=1, coords=[1.0, 0.0]),
            FEMNode(id=2, coords=[0.5, 0.0]),  # midside
            FEMNode(id=3, coords=[0.5, 1.0]),  # dummy
        ]
        edges = [
            BoundaryEdge(id=0, node_ids=[0, 1, 2], region_name="robin_edge"),
        ]
        elements = [
            FEMElement(
                id=0,
                element_type=ElementType.TRI6,
                node_ids=[0, 1, 3, 2, 3, 3],
                region_id=0,
            )
        ]
        mesh = FEMMesh(
            nodes=nodes,
            elements=elements,
            regions=[Region(id=0, name="body", material_id="mat")],
            boundary_edges=edges,
            element_type=ElementType.TRI6,
        )

        K_r, f_r = assemble_robin(mesh, {"robin_edge": (1.0, 0.0)})

        # Check symmetry of the 3×3 subblock
        K_dense = K_r.toarray()
        np.testing.assert_allclose(K_dense, K_dense.T, atol=1e-14)

        # Check specific values: M = (1/30) [[4,2,-1],[2,4,-1],[-1,-1,16]]
        np.testing.assert_allclose(K_dense[0, 0], 4.0 / 30.0, atol=1e-14)
        np.testing.assert_allclose(K_dense[0, 1], 2.0 / 30.0, atol=1e-14)
        np.testing.assert_allclose(K_dense[0, 2], -1.0 / 30.0, atol=1e-14)
        np.testing.assert_allclose(K_dense[2, 2], 16.0 / 30.0, atol=1e-14)

    def test_tri6_robin_load_vector(self):
        """Robin load: (g/β) ∫ N_i dΓ should be Simpson's 1/3 weights."""
        nodes = [
            FEMNode(id=0, coords=[0.0, 0.0]),
            FEMNode(id=1, coords=[1.0, 0.0]),
            FEMNode(id=2, coords=[0.5, 0.0]),
            FEMNode(id=3, coords=[0.5, 1.0]),
        ]
        edges = [
            BoundaryEdge(id=0, node_ids=[0, 1, 2], region_name="robin_edge"),
        ]
        elements = [
            FEMElement(
                id=0,
                element_type=ElementType.TRI6,
                node_ids=[0, 1, 3, 2, 3, 3],
                region_id=0,
            )
        ]
        mesh = FEMMesh(
            nodes=nodes,
            elements=elements,
            regions=[Region(id=0, name="body", material_id="mat")],
            boundary_edges=edges,
            element_type=ElementType.TRI6,
        )

        # g/β = 6, α/β = 0  → only load vector
        _, f_r = assemble_robin(mesh, {"robin_edge": (0.0, 6.0)})

        # Same Simpson weights as Neumann: L/6, L/6, 4L/6 → 1, 1, 4
        np.testing.assert_allclose(f_r[0], 1.0, atol=1e-14)
        np.testing.assert_allclose(f_r[1], 1.0, atol=1e-14)
        np.testing.assert_allclose(f_r[2], 4.0, atol=1e-14)

    def test_tri6_neumann_full_solve(self):
        """Tri6 electrostatic with Neumann BC should produce correct solution.

        Plate capacitor: Dirichlet φ=0 on bottom, Neumann flux on top.
        For flux = ε₀·E_n = ε₀·100, solution should be φ = 100·y.
        """
        mesh = _make_plate_mesh_tri6(2, 2)
        bcs = [
            BoundaryCondition(boundary_name="bottom", bc_type=BCType.DIRICHLET, value=0.0),
            BoundaryCondition(boundary_name="top", bc_type=BCType.NEUMANN, value=EPSILON_0 * 100.0),
        ]
        config = FEMSolverConfig(pde_type=PDEType.ELECTROSTATIC)
        materials = {"mat": ElectrostaticMaterial(id="mat", name="vac", relative_permittivity=1.0)}

        result = solve_electrostatic(mesh, materials, bcs, config)

        for i, node in enumerate(mesh.nodes):
            y = node.coords[1]
            phi = result.scalar_fields["electric_potential"].node_values[i]
            np.testing.assert_allclose(phi, 100.0 * y, atol=1e-6)


# ===========================================================================
# CURRENT FLOW NEUMANN / EXCITATION TESTS
# ===========================================================================


class TestCurrentFlowExcitations:
    """Tests for current-flow with Neumann BCs and volume current sources."""

    def test_current_flow_neumann_bc(self):
        """Current flow with Neumann BC: injected current on one side."""
        mesh = _make_plate_mesh(4, 4)
        # Fix voltage on bottom, inject current on top
        sigma = 1e5
        bcs = [
            BoundaryCondition(boundary_name="bottom", bc_type=BCType.DIRICHLET, value=0.0),
            BoundaryCondition(boundary_name="top", bc_type=BCType.NEUMANN, value=sigma),
        ]
        config = FEMSolverConfig(pde_type=PDEType.CURRENT_FLOW)
        materials = {"mat": ConductionMaterial(id="mat", name="cond", conductivity=sigma)}

        result = solve_current_flow(mesh, materials, bcs, config)

        # With Neumann flux = σ on top, E_y = 1, so V ≈ y (V=0 at y=0, V≈1 at y=1)
        for i, node in enumerate(mesh.nodes):
            y = node.coords[1]
            phi = result.scalar_fields["electric_potential"].node_values[i]
            np.testing.assert_allclose(phi, y, atol=1e-6)

    def test_current_flow_robin_bc(self):
        """Current flow with Robin BC should run without error."""
        mesh = _make_plate_mesh(4, 4)
        sigma = 1e5
        bcs = [
            BoundaryCondition(boundary_name="bottom", bc_type=BCType.DIRICHLET, value=0.0),
            BoundaryCondition(
                boundary_name="top",
                bc_type=BCType.ROBIN,
                value=100.0,
                alpha=1.0,
                beta=1.0,
            ),
        ]
        config = FEMSolverConfig(pde_type=PDEType.CURRENT_FLOW)
        materials = {"mat": ConductionMaterial(id="mat", name="cond", conductivity=sigma)}

        result = solve_current_flow(mesh, materials, bcs, config)

        # Just verify it ran and produced valid results
        assert result.n_dofs > 0
        assert result.solve_time > 0
        assert len(result.scalar_fields["electric_potential"].node_values) == result.n_dofs
