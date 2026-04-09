"""Electrostatic PDE solver: ∇·(ε∇φ) = −ρ_v.

Full pipeline:
1. Build material map: region → ε₀·ε_r
2. Assemble K = ∫ ∇Nᵢ · ε · ∇Nⱼ dΩ
3. Assemble f = ∫ Nᵢ · ρ_v dΩ  (zero for pure Laplace)
4. Apply Dirichlet BCs → K, f
5. Solve K·u = f → potential φ
6. Postprocess: E = −∇φ, W = ½∫ε|E|²dΩ
"""

import time

import numpy as np

from backend.common.constants import EPSILON_0
from backend.common.models.fem.boundary_conditions import (
    BCType,
    BoundaryCondition,
)
from backend.common.models.fem.config import FEMSolverConfig
from backend.common.models.fem.materials import ElectrostaticMaterial
from backend.common.models.fem.mesh import FEMMesh
from backend.common.models.fem.results import (
    FEMSolverResult,
    IntegralQuantity,
    ScalarFieldResult,
    VectorFieldResult,
)
from backend.fem.solver.core.assembly import (
    assemble_load_vector,
    assemble_stiffness,
)
from backend.fem.solver.core.boundary import apply_dirichlet
from backend.fem.solver.core.jacobian import compute_dN_dx
from backend.fem.solver.core.shape_functions import tri3_shape
from backend.fem.solver.core.solver import solve_system


def solve_electrostatic(
    mesh: FEMMesh,
    materials: dict[str, ElectrostaticMaterial],
    boundary_conditions: list[BoundaryCondition],
    config: FEMSolverConfig,
) -> FEMSolverResult:
    """Solve the electrostatic problem on the given mesh.

    Parameters
    ----------
    mesh : FEMMesh
        Finite element mesh with region assignments.
    materials : dict[str, ElectrostaticMaterial]
        Maps material_id → ElectrostaticMaterial.
    boundary_conditions : list[BoundaryCondition]
        Dirichlet and/or Neumann BCs.
    config : FEMSolverConfig
        Solver configuration.

    Returns
    -------
    FEMSolverResult
        Contains potential field, E-field, and integral quantities.
    """
    t_start = time.perf_counter()

    # 1. Build material map: region → ε₀ * ε_r (scalar)
    region_material = {r.id: r.material_id for r in mesh.regions}
    material_map: dict[str, float] = {}
    for region in mesh.regions:
        mat_id = region.material_id
        mat = materials[mat_id]
        eps_r = mat.relative_permittivity
        if isinstance(eps_r, list):
            raise NotImplementedError("Tensor permittivity not yet supported")
        material_map[mat_id] = EPSILON_0 * eps_r

    # 2. Assemble stiffness
    K = assemble_stiffness(mesh, material_map)

    # 3. Assemble load vector (zero for pure Laplace / no charge density)
    f = assemble_load_vector(mesh, rho_v=0.0)

    # 4. Build Dirichlet BC dict: DOF index → value
    bc_dict = _build_dirichlet_dict(mesh, boundary_conditions)

    # 5. Apply Dirichlet BCs
    K_mod, f_mod = apply_dirichlet(K, f, bc_dict)

    # 6. Solve
    solver_method = config.solver_type.value
    u = solve_system(
        K_mod,
        f_mod,
        method=solver_method,
        tol=config.tolerance,
        max_iter=config.max_iterations,
    )

    # 7. Postprocess
    e_field = _compute_e_field(mesh, u)
    energy = _compute_energy(mesh, u, e_field, material_map, region_material)

    t_end = time.perf_counter()

    # Build result
    phi_values = u.tolist()
    return FEMSolverResult(
        scalar_fields={
            "electric_potential": ScalarFieldResult(
                field_name="electric_potential",
                node_values=phi_values,
                unit="V",
                min_value=float(np.min(u)),
                max_value=float(np.max(u)),
            ),
        },
        vector_fields={
            "electric_field": VectorFieldResult(
                field_name="electric_field",
                element_values=[e.tolist() for e in e_field],
                unit="V/m",
                max_magnitude=float(max(np.linalg.norm(e) for e in e_field) if e_field else 0.0),
            ),
        },
        integrals=[
            IntegralQuantity(name="electric_energy", value=energy, unit="J"),
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
    # Group boundary edges by name
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


def _compute_e_field(
    mesh: FEMMesh,
    u: np.ndarray,
) -> list[np.ndarray]:
    """Compute E = −∇φ per element."""
    e_field = []
    coords = np.array([n.coords for n in mesh.nodes])

    for elem in mesh.elements:
        nids = np.array(elem.node_ids)
        elem_coords = coords[nids]
        phi_elem = u[nids]

        _, dN_dxi = tri3_shape(0.0, 0.0)
        dN_dx, _ = compute_dN_dx(elem_coords, dN_dxi)

        # ∇φ = Σ dN_i/dx · φ_i
        grad_phi = dN_dx.T @ phi_elem  # (2,)
        e_field.append(-grad_phi)

    return e_field


def _compute_energy(
    mesh: FEMMesh,
    u: np.ndarray,
    e_field: list[np.ndarray],
    material_map: dict[str, float],
    region_material: dict[int, str],
) -> float:
    """Compute electric energy W = ½∫ε|E|²dΩ."""
    coords = np.array([n.coords for n in mesh.nodes])
    total_energy = 0.0

    for i, elem in enumerate(mesh.elements):
        nids = np.array(elem.node_ids)
        elem_coords = coords[nids]

        # Element area
        _, dN_dxi = tri3_shape(0.0, 0.0)
        _, det_J = compute_dN_dx(elem_coords, dN_dxi)
        area = 0.5 * abs(det_J)

        mat_id = region_material[elem.region_id]
        eps = material_map[mat_id]

        e_mag_sq = float(np.dot(e_field[i], e_field[i]))
        total_energy += 0.5 * eps * e_mag_sq * area

    return total_energy
