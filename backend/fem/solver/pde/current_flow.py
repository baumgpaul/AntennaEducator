"""Current-flow PDE solver: ∇·(σ∇V) = −J_source.

Full pipeline:
1. Build material map: region → σ (scalar or 2×2 tensor)
2. Assemble K = ∫ ∇Nᵢ · σ · ∇Nⱼ dΩ
3. Assemble f = ∫ Nᵢ · J_source dΩ  + Neumann + Robin contributions
4. Apply Dirichlet BCs → K, f
5. Solve K·u = f → potential V
6. Postprocess: E = −∇V, J = σE, p = J·E, P = ∫ p dΩ
"""

import time

import numpy as np

from backend.common.models.fem.boundary_conditions import BCType, BoundaryCondition, Excitation
from backend.common.models.fem.config import FEMSolverConfig
from backend.common.models.fem.materials import ConductionMaterial
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


def solve_current_flow(
    mesh: FEMMesh,
    materials: dict[str, ConductionMaterial],
    boundary_conditions: list[BoundaryCondition],
    config: FEMSolverConfig,
    excitations: list[Excitation] | None = None,
) -> FEMSolverResult:
    """Solve the steady-state current-flow problem on the given mesh.

    PDE: ∇·(σ∇V) = −J_source

    Parameters
    ----------
    mesh : FEMMesh
        Finite element mesh with region assignments.
    materials : dict[str, ConductionMaterial]
        Maps material_id → ConductionMaterial (with conductivity).
    boundary_conditions : list[BoundaryCondition]
        Dirichlet, Neumann, and/or Robin BCs.
    config : FEMSolverConfig
        Solver configuration.
    excitations : list[Excitation], optional
        Volume current-source density per region.

    Returns
    -------
    FEMSolverResult
        Contains potential, E-field, current density, power density, and integrals.
    """
    t_start = time.perf_counter()

    # 1. Build material map: region → σ (scalar or 2×2 tensor)
    _DEFAULT = ConductionMaterial(id="__default__", name="Default", conductivity=1.0)
    region_material = {r.id: r.material_id for r in mesh.regions}
    material_map: dict[str | None, MaterialValue] = {}
    for region in mesh.regions:
        mat_id = region.material_id
        mat = materials.get(mat_id, _DEFAULT) if mat_id else _DEFAULT
        sigma = mat.conductivity
        if isinstance(sigma, list):
            material_map[mat_id] = np.array(sigma, dtype=float)
        else:
            material_map[mat_id] = sigma

    # 2. Assemble stiffness
    K = assemble_stiffness(mesh, material_map)

    # 3. Assemble load vector
    # 3a. Volume current source from excitations
    j_map = _build_source_map(mesh, excitations or [])
    f = assemble_load_vector(mesh, rho_v=j_map if j_map else 0.0)

    # 3b. Neumann BC: ∂V/∂n = q_n → add ∫ N·q_n dΓ to f
    neumann_bcs = _extract_neumann_bcs(boundary_conditions)
    if neumann_bcs:
        f += assemble_neumann(mesh, neumann_bcs)

    # 3c. Robin BC
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
    j_field, power_density_vals = _compute_j_and_power_density(
        mesh, e_field, material_map, region_material, coords
    )
    total_power = _sum_power(mesh, power_density_vals, coords)

    t_end = time.perf_counter()

    # Build result
    v_values = u.tolist()
    e_mags = [float(np.linalg.norm(e)) for e in e_field]
    j_mags = [float(np.linalg.norm(j)) for j in j_field]

    return FEMSolverResult(
        scalar_fields={
            "electric_potential": ScalarFieldResult(
                field_name="electric_potential",
                node_values=v_values,
                unit="V",
                min_value=float(np.min(u)),
                max_value=float(np.max(u)),
            ),
            "power_density": ScalarFieldResult(
                field_name="power_density",
                node_values=[],
                element_values=power_density_vals,
                unit="W/m²",
                min_value=(float(min(power_density_vals)) if power_density_vals else 0.0),
                max_value=(float(max(power_density_vals)) if power_density_vals else 0.0),
            ),
        },
        vector_fields={
            "electric_field": VectorFieldResult(
                field_name="electric_field",
                element_values=[e.tolist() for e in e_field],
                unit="V/m",
                max_magnitude=float(max(e_mags)) if e_mags else 0.0,
            ),
            "current_density": VectorFieldResult(
                field_name="current_density",
                element_values=[j.tolist() for j in j_field],
                unit="A/m",
                max_magnitude=float(max(j_mags)) if j_mags else 0.0,
            ),
        },
        integrals=[
            IntegralQuantity(name="total_power", value=total_power, unit="W"),
        ],
        n_dofs=len(mesh.nodes),
        n_elements=len(mesh.elements),
        solve_time=t_end - t_start,
    )


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


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
    """Extract Robin BCs: boundary_name → (alpha/beta, g/beta)."""
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


def _build_source_map(
    mesh: FEMMesh,
    excitations: list[Excitation],
) -> dict[str | None, float]:
    """Build per-region current source map from excitations.

    Only 'current_source' excitation_type is handled.
    """
    region_name_to_mat: dict[str, str | None] = {}
    for r in mesh.regions:
        region_name_to_mat[r.name] = r.material_id

    source_map: dict[str | None, float] = {}
    for exc in excitations:
        if exc.excitation_type != "current_source":
            continue
        if isinstance(exc.value, str):
            raise NotImplementedError("Expression sources not yet supported")
        mat_id = region_name_to_mat.get(exc.region_name)
        source_map[mat_id] = exc.value

    return source_map


def _compute_e_field(
    mesh: FEMMesh,
    u: np.ndarray,
    coords: np.ndarray,
) -> list[np.ndarray]:
    """Compute E = −∇V per element."""
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

        grad_phi = dN_dx.T @ phi_elem
        e_field.append(-grad_phi)

    return e_field


def _compute_j_and_power_density(
    mesh: FEMMesh,
    e_field: list[np.ndarray],
    material_map: dict[str | None, MaterialValue],
    region_material: dict[int, str | None],
    coords: np.ndarray,
) -> tuple[list[np.ndarray], list[float]]:
    """Compute J = σE and power density p = J·E per element.

    Handles both scalar σ (isotropic) and 2×2 tensor σ (anisotropic).
    """
    j_field: list[np.ndarray] = []
    power_density: list[float] = []

    for i, elem in enumerate(mesh.elements):
        mat_id = region_material[elem.region_id]
        sigma = material_map[mat_id]
        e = e_field[i]

        if isinstance(sigma, np.ndarray):
            j = sigma @ e
        else:
            j = sigma * e
        j_field.append(j)

        # p = J · E  (works for both scalar and tensor)
        power_density.append(float(np.dot(j, e)))

    return j_field, power_density


def _sum_power(
    mesh: FEMMesh,
    power_density: list[float],
    coords: np.ndarray,
) -> float:
    """Compute total power P = ∫ p dΩ  =  Σ p · A_e."""
    total = 0.0
    for i, elem in enumerate(mesh.elements):
        nids = np.array(elem.node_ids)
        elem_coords = coords[nids]

        if elem.element_type == ElementType.TRI6:
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

        total += power_density[i] * area

    return total
