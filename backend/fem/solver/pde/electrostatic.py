"""Electrostatic PDE solver: ∇·(ε∇φ) = −ρ_v.

Full pipeline:
1. Build material map: region → ε₀·ε_r
2. Assemble K = ∫ ∇Nᵢ · ε · ∇Nⱼ dΩ
3. Assemble f = ∫ Nᵢ · ρ_v dΩ  + Neumann + Robin contributions
4. Apply Dirichlet BCs → K, f
5. Solve K·u = f → potential φ
6. Postprocess: E = −∇φ, D = εE, u_e = ½ε|E|², W = ∫u_e dΩ
"""

import time

import numpy as np

from backend.common.constants import EPSILON_0
from backend.common.models.fem.boundary_conditions import BCType, BoundaryCondition, Excitation
from backend.common.models.fem.config import FEMSolverConfig
from backend.common.models.fem.materials import ElectrostaticMaterial
from backend.common.models.fem.mesh import ElementType, FEMMesh
from backend.common.models.fem.results import (
    FEMSolverResult,
    IntegralQuantity,
    ScalarFieldResult,
    VectorFieldResult,
)
from backend.fem.solver.core.assembly import (
    MaterialValue,
    assemble_load_vector,
    assemble_neumann,
    assemble_robin,
    assemble_stiffness,
)
from backend.fem.solver.core.boundary import apply_dirichlet
from backend.fem.solver.core.jacobian import compute_dN_dx
from backend.fem.solver.core.quadrature import get_quadrature_rule
from backend.fem.solver.core.shape_functions import tri3_shape, tri6_shape
from backend.fem.solver.core.solver import solve_system


def solve_electrostatic(
    mesh: FEMMesh,
    materials: dict[str, ElectrostaticMaterial],
    boundary_conditions: list[BoundaryCondition],
    config: FEMSolverConfig,
    excitations: list[Excitation] | None = None,
) -> FEMSolverResult:
    """Solve the electrostatic problem on the given mesh.

    Parameters
    ----------
    mesh : FEMMesh
        Finite element mesh with region assignments.
    materials : dict[str, ElectrostaticMaterial]
        Maps material_id → ElectrostaticMaterial.
    boundary_conditions : list[BoundaryCondition]
        Dirichlet, Neumann, and/or Robin BCs.
    config : FEMSolverConfig
        Solver configuration.
    excitations : list[Excitation], optional
        Volume charge density sources per region.

    Returns
    -------
    FEMSolverResult
        Contains potential, E-field, D-field, energy density, and integrals.
    """
    t_start = time.perf_counter()

    # 1. Build material map: region → ε₀ * ε_r (scalar or 2×2 tensor)
    _VACUUM = ElectrostaticMaterial(id="__vacuum__", name="Vacuum", relative_permittivity=1.0)
    region_material = {r.id: r.material_id for r in mesh.regions}
    material_map: dict[str | None, MaterialValue] = {}
    for region in mesh.regions:
        mat_id = region.material_id
        mat = materials.get(mat_id, _VACUUM) if mat_id else _VACUUM
        eps_r = mat.relative_permittivity
        if isinstance(eps_r, list):
            material_map[mat_id] = EPSILON_0 * np.array(eps_r, dtype=float)
        else:
            material_map[mat_id] = EPSILON_0 * eps_r

    # 2. Assemble stiffness
    K = assemble_stiffness(mesh, material_map)

    # 3. Assemble load vector
    # 3a. Volume charge density from excitations
    rho_map = _build_charge_density_map(mesh, excitations or [])
    f = assemble_load_vector(mesh, rho_v=rho_map if rho_map else 0.0)

    # 3b. Neumann BC: ∂φ/∂n = q_n  →  add ∫ N·q_n dΓ to f
    neumann_bcs = _extract_neumann_bcs(boundary_conditions)
    if neumann_bcs:
        f += assemble_neumann(mesh, neumann_bcs)

    # 3c. Robin BC: α·φ + β·(∂φ/∂n) = g  →  add to K and f
    robin_bcs = _extract_robin_bcs(boundary_conditions)
    if robin_bcs:
        K_r, f_r = assemble_robin(mesh, robin_bcs)
        K = K + K_r
        f += f_r

    # 4. Build Dirichlet BC dict and apply
    bc_dict = _build_dirichlet_dict(mesh, boundary_conditions)
    K_mod, f_mod = apply_dirichlet(K, f, bc_dict)

    # 5. Solve
    solver_method = config.solver_type.value
    u = solve_system(
        K_mod,
        f_mod,
        method=solver_method,
        tol=config.tolerance,
        max_iter=config.max_iterations,
    )

    # 6. Postprocess
    coords = np.array([n.coords for n in mesh.nodes])
    e_field = _compute_e_field(mesh, u, coords)
    d_field, energy_density_vals = _compute_d_and_energy_density(
        mesh, e_field, material_map, region_material, coords
    )
    total_energy = _sum_energy(mesh, energy_density_vals, coords)

    t_end = time.perf_counter()

    # Build result
    phi_values = u.tolist()
    e_mags = [float(np.linalg.norm(e)) for e in e_field]
    d_mags = [float(np.linalg.norm(d)) for d in d_field]

    return FEMSolverResult(
        scalar_fields={
            "electric_potential": ScalarFieldResult(
                field_name="electric_potential",
                node_values=phi_values,
                unit="V",
                min_value=float(np.min(u)),
                max_value=float(np.max(u)),
            ),
            "energy_density": ScalarFieldResult(
                field_name="energy_density",
                node_values=[],
                element_values=energy_density_vals,
                unit="J/m²",
                min_value=float(min(energy_density_vals)) if energy_density_vals else 0.0,
                max_value=float(max(energy_density_vals)) if energy_density_vals else 0.0,
            ),
        },
        vector_fields={
            "electric_field": VectorFieldResult(
                field_name="electric_field",
                element_values=[e.tolist() for e in e_field],
                unit="V/m",
                max_magnitude=float(max(e_mags)) if e_mags else 0.0,
            ),
            "displacement_field": VectorFieldResult(
                field_name="displacement_field",
                element_values=[d.tolist() for d in d_field],
                unit="C/m²",
                max_magnitude=float(max(d_mags)) if d_mags else 0.0,
            ),
        },
        integrals=[
            IntegralQuantity(name="electric_energy", value=total_energy, unit="J"),
        ],
        n_dofs=len(mesh.nodes),
        n_elements=len(mesh.elements),
        solve_time=t_end - t_start,
    )


def _build_dirichlet_dict(
    mesh: FEMMesh,
    boundary_conditions: list[BoundaryCondition],
) -> dict[int, float]:
    """Map boundary names to DOF indices with prescribed values."""
    boundary_nodes: dict[str, set[int]] = {}
    for edge in mesh.boundary_edges:
        boundary_nodes.setdefault(edge.region_name, set()).update(edge.node_ids)

    bc_dict: dict[int, float] = {}
    for bc in boundary_conditions:
        if bc.bc_type != BCType.DIRICHLET:
            continue
        if isinstance(bc.value, str):
            raise NotImplementedError("Expression BCs not yet supported")
        node_ids = boundary_nodes.get(bc.boundary_name, set())
        for nid in node_ids:
            bc_dict[nid] = bc.value

    return bc_dict


def _extract_neumann_bcs(
    boundary_conditions: list[BoundaryCondition],
) -> dict[str, float]:
    """Extract Neumann BCs: boundary_name → flux value."""
    result: dict[str, float] = {}
    for bc in boundary_conditions:
        if bc.bc_type != BCType.NEUMANN:
            continue
        if isinstance(bc.value, str):
            raise NotImplementedError("Expression BCs not yet supported")
        result[bc.boundary_name] = bc.value
    return result


def _extract_robin_bcs(
    boundary_conditions: list[BoundaryCondition],
) -> dict[str, tuple[float, float]]:
    """Extract Robin BCs: boundary_name → (alpha/beta, g/beta).

    Robin BC: α·φ + β·(∂φ/∂n) = g.
    alpha and beta come from BC fields; g = bc.value.
    """
    result: dict[str, tuple[float, float]] = {}
    for bc in boundary_conditions:
        if bc.bc_type != BCType.ROBIN:
            continue
        if isinstance(bc.value, str):
            raise NotImplementedError("Expression BCs not yet supported")
        alpha = bc.alpha if bc.alpha is not None else 1.0
        beta = bc.beta if bc.beta is not None else 1.0
        if abs(beta) < 1e-30:
            raise ValueError(f"Robin BC beta must be non-zero on '{bc.boundary_name}'")
        result[bc.boundary_name] = (alpha / beta, bc.value / beta)
    return result


def _build_charge_density_map(
    mesh: FEMMesh,
    excitations: list[Excitation],
) -> dict[str | None, float]:
    """Build per-region charge density map from excitations.

    Only 'charge_density' excitation_type is handled.
    """
    # Map region name → region material_id
    region_name_to_mat: dict[str, str | None] = {}
    for r in mesh.regions:
        region_name_to_mat[r.name] = r.material_id

    rho_map: dict[str | None, float] = {}
    for exc in excitations:
        if exc.excitation_type != "charge_density":
            continue
        if isinstance(exc.value, str):
            raise NotImplementedError("Expression sources not yet supported")
        mat_id = region_name_to_mat.get(exc.region_name)
        rho_map[mat_id] = exc.value

    return rho_map


def _compute_e_field(
    mesh: FEMMesh,
    u: np.ndarray,
    coords: np.ndarray,
) -> list[np.ndarray]:
    """Compute E = −∇φ per element.

    For Tri3, the gradient is constant over the element.
    For Tri6, the gradient is evaluated at the centroid (1/3, 1/3).
    """
    e_field = []

    for elem in mesh.elements:
        nids = np.array(elem.node_ids)
        elem_coords = coords[nids]
        phi_elem = u[nids]

        if elem.element_type == ElementType.TRI6:
            _, dN_dxi = tri6_shape(1.0 / 3.0, 1.0 / 3.0)
        else:
            _, dN_dxi = tri3_shape(0.0, 0.0)
        dN_dx, _ = compute_dN_dx(elem_coords, dN_dxi)

        grad_phi = dN_dx.T @ phi_elem  # (2,)
        e_field.append(-grad_phi)

    return e_field


def _compute_d_and_energy_density(
    mesh: FEMMesh,
    e_field: list[np.ndarray],
    material_map: dict[str | None, MaterialValue],
    region_material: dict[int, str | None],
    coords: np.ndarray,
) -> tuple[list[np.ndarray], list[float]]:
    """Compute D = εE and u_e = ½ E·D per element.

    Handles both scalar ε (isotropic) and 2×2 tensor ε (anisotropic).
    """
    d_field: list[np.ndarray] = []
    energy_density: list[float] = []

    for i, elem in enumerate(mesh.elements):
        mat_id = region_material[elem.region_id]
        eps = material_map[mat_id]
        e = e_field[i]

        if isinstance(eps, np.ndarray):
            d = eps @ e
        else:
            d = eps * e
        d_field.append(d)

        # u_e = ½ E · D  (works for both scalar and tensor)
        energy_density.append(0.5 * float(np.dot(e, d)))

    return d_field, energy_density


def _sum_energy(
    mesh: FEMMesh,
    energy_density: list[float],
    coords: np.ndarray,
) -> float:
    """Compute total energy W = ∫ u_e dΩ  =  Σ u_e · A_e.

    Uses quadrature-based area for Tri6 elements, analytic for Tri3.
    """
    total = 0.0
    for i, elem in enumerate(mesh.elements):
        nids = np.array(elem.node_ids)
        elem_coords = coords[nids]

        if elem.element_type == ElementType.TRI6:
            # Compute area via quadrature (handles curved edges)
            points, weights = get_quadrature_rule("triangle", 3)
            area = 0.0
            for pt, w in zip(points, weights):
                _, dN_dxi = tri6_shape(pt[0], pt[1])
                _, det_J = compute_dN_dx(elem_coords, dN_dxi)
                area += w * abs(det_J)
        else:
            _, dN_dxi = tri3_shape(0.0, 0.0)
            _, det_J = compute_dN_dx(elem_coords, dN_dxi)
            area = 0.5 * abs(det_J)

        total += energy_density[i] * area

    return total
