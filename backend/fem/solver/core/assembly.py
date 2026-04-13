"""Global FEM stiffness and load vector assembly.

Assembles element contributions into global sparse matrices
using COO format converted to CSR for efficient solving.

Supports:
- Tri3 (linear) and Tri6 (quadratic) triangle elements
- Scalar and 2×2 tensor material properties
- Gauss quadrature (required for Tri6 / tensor materials)
"""

import numpy as np
from numpy import ndarray
from scipy.sparse import coo_matrix, csr_matrix, lil_matrix

from backend.common.models.fem.mesh import ElementType, FEMMesh
from backend.fem.solver.core.jacobian import compute_dN_dx
from backend.fem.solver.core.quadrature import get_quadrature_rule
from backend.fem.solver.core.shape_functions import tri3_shape, tri6_shape

# Type alias: material property is either a scalar or a 2×2 tensor
MaterialValue = float | ndarray


def _get_shape_func(element_type: ElementType):
    """Return the shape function callable for the element type."""
    if element_type == ElementType.TRI3:
        return tri3_shape
    if element_type == ElementType.TRI6:
        return tri6_shape
    raise ValueError(f"Unsupported element type: {element_type}")


def _gauss_order_for_element(element_type: ElementType, is_tensor: bool = False) -> int:
    """Choose appropriate quadrature order."""
    if element_type == ElementType.TRI3:
        # Tri3: constant gradients → order 1 suffices for scalar
        # Tensor material doesn't change this (constant B, constant D)
        return 1
    if element_type == ElementType.TRI6:
        # Tri6: linear gradients → need order 2 minimum
        return 3  # use order 3 for robustness
    return 2


def element_stiffness(
    node_coords: ndarray,
    material: MaterialValue,
    element_type: ElementType = ElementType.TRI3,
) -> ndarray:
    """Compute element stiffness matrix with quadrature.

    K_e = ∫ B^T · D · B dΩ

    where D is the material tensor (scalar ε·I or 2×2 tensor).

    Parameters
    ----------
    node_coords : ndarray (n_nodes, 2)
        Physical coordinates of the element nodes.
    material : float or ndarray (2, 2)
        Scalar (isotropic) or 2×2 tensor material property.
    element_type : ElementType
        TRI3 or TRI6.

    Returns
    -------
    K_e : ndarray (n_nodes, n_nodes)
        Element stiffness matrix.
    """
    shape_func = _get_shape_func(element_type)
    n_nodes_elem = node_coords.shape[0]
    gauss_order = _gauss_order_for_element(element_type, isinstance(material, ndarray))
    points, weights = get_quadrature_rule("triangle", gauss_order)

    # Material tensor: scalar → D = eps * I
    if isinstance(material, (int, float)):
        D_mat = material * np.eye(2)
    else:
        D_mat = np.asarray(material)

    K_e = np.zeros((n_nodes_elem, n_nodes_elem))

    for qp, w in zip(points, weights):
        xi, eta = qp[0], qp[1]
        _, dN_dxi = shape_func(xi, eta)
        dN_dx, det_J = compute_dN_dx(node_coords, dN_dxi)

        # B = dN_dx is (n_nodes, 2), each row is [dNi/dx, dNi/dy]
        # K_e += w * |det_J| * B · D · B^T
        BDB = dN_dx @ D_mat @ dN_dx.T  # (n_nodes, n_nodes)
        K_e += w * abs(det_J) * BDB

    return K_e


# Keep backward-compatible alias
def element_stiffness_tri3(node_coords: ndarray, eps: float) -> ndarray:
    """Compute element stiffness matrix for a Tri3 element (legacy API)."""
    return element_stiffness(node_coords, eps, ElementType.TRI3)


def assemble_stiffness(
    mesh: FEMMesh,
    material_map: dict[str | None, MaterialValue],
) -> csr_matrix:
    """Assemble global stiffness matrix K.

    Parameters
    ----------
    mesh : FEMMesh
        The finite element mesh.
    material_map : dict[str | None, MaterialValue]
        Maps material_id → scalar or 2×2 tensor material property.

    Returns
    -------
    K : csr_matrix (n_nodes, n_nodes)
        Global stiffness matrix in CSR format.
    """
    n_nodes = len(mesh.nodes)
    region_material = {r.id: r.material_id for r in mesh.regions}

    rows = []
    cols = []
    data = []

    coords = np.array([n.coords for n in mesh.nodes])

    for elem in mesh.elements:
        nids = np.array(elem.node_ids)
        elem_coords = coords[nids]

        mat_id = region_material[elem.region_id]
        mat_val = material_map[mat_id]

        K_e = element_stiffness(elem_coords, mat_val, elem.element_type)

        for i_local in range(len(nids)):
            for j_local in range(len(nids)):
                rows.append(nids[i_local])
                cols.append(nids[j_local])
                data.append(K_e[i_local, j_local])

    K = coo_matrix((data, (rows, cols)), shape=(n_nodes, n_nodes))
    return K.tocsr()


def assemble_load_vector(
    mesh: FEMMesh,
    rho_v: float | dict[str | None, float] = 0.0,
) -> ndarray:
    """Assemble global load vector f from a volumetric source.

    f_i = ∫ N_i · ρ_v dΩ

    Uses quadrature appropriate for the element type.

    Parameters
    ----------
    mesh : FEMMesh
        The finite element mesh.
    rho_v : float or dict
        Uniform volumetric source, or dict mapping material_id → ρ_v per region.

    Returns
    -------
    f : ndarray (n_nodes,)
        Global load vector.
    """
    n_nodes = len(mesh.nodes)
    f = np.zeros(n_nodes)

    coords = np.array([n.coords for n in mesh.nodes])
    region_material = {r.id: r.material_id for r in mesh.regions}

    for elem in mesh.elements:
        nids = np.array(elem.node_ids)
        elem_coords = coords[nids]

        # Per-region or uniform charge density
        if isinstance(rho_v, dict):
            mat_id = region_material.get(elem.region_id)
            rho = rho_v.get(mat_id, 0.0)
        else:
            rho = rho_v

        if abs(rho) < 1e-30:
            continue

        shape_func = _get_shape_func(elem.element_type)
        gauss_order = _gauss_order_for_element(elem.element_type)
        points, weights = get_quadrature_rule("triangle", gauss_order)

        for qp, w in zip(points, weights):
            N, dN_dxi = shape_func(qp[0], qp[1])
            _, det_J = compute_dN_dx(elem_coords, dN_dxi)

            # f_e += w * |det_J| * N * rho
            for i_local in range(len(nids)):
                f[nids[i_local]] += w * abs(det_J) * N[i_local] * rho

    return f


def assemble_neumann(
    mesh: FEMMesh,
    neumann_bcs: dict[str, float],
) -> ndarray:
    """Assemble Neumann BC contribution to the load vector.

    For electrostatics: ∂φ/∂n = q_n on Γ_N
    Adds ∫ N_i · q_n dΓ to f for each boundary edge.

    Supports 2-node (linear) and 3-node (quadratic) boundary edges.

    Parameters
    ----------
    mesh : FEMMesh
        The finite element mesh.
    neumann_bcs : dict[str, float]
        Maps boundary_name → normal flux value q_n.

    Returns
    -------
    f_n : ndarray (n_nodes,)
        Neumann contribution to load vector.
    """
    n_nodes = len(mesh.nodes)
    f_n = np.zeros(n_nodes)
    coords = np.array([n.coords for n in mesh.nodes])

    for edge in mesh.boundary_edges:
        q_n = neumann_bcs.get(edge.region_name)
        if q_n is None:
            continue

        nids = edge.node_ids
        n0, n1 = nids[0], nids[1]
        edge_len = np.linalg.norm(coords[n1] - coords[n0])

        if len(nids) == 2:
            # Linear edge: ∫ N_i dΓ = L/2 for each node
            f_n[n0] += q_n * edge_len / 2.0
            f_n[n1] += q_n * edge_len / 2.0
        elif len(nids) == 3:
            # Quadratic edge: Simpson's 1/3 rule
            # ∫ N₁ dΓ = L/6, ∫ N₂ dΓ = L/6, ∫ N₃(mid) dΓ = 4L/6
            f_n[n0] += q_n * edge_len / 6.0
            f_n[n1] += q_n * edge_len / 6.0
            f_n[nids[2]] += q_n * edge_len * 4.0 / 6.0

    return f_n


def assemble_robin(
    mesh: FEMMesh,
    robin_bcs: dict[str, tuple[float, float]],
) -> tuple[csr_matrix, ndarray]:
    """Assemble Robin BC contributions to stiffness and load vector.

    Robin BC: α·φ + β·(∂φ/∂n) = g  →  rewritten as ∂φ/∂n = (g - α·φ)/β.

    This adds:
      K_robin += (α/β) · ∫ N_i · N_j dΓ   (boundary mass matrix)
      f_robin += (g/β) · ∫ N_i dΓ          (boundary load)

    Supports 2-node (linear) and 3-node (quadratic) boundary edges.

    Parameters
    ----------
    mesh : FEMMesh
        The finite element mesh.
    robin_bcs : dict[str, tuple[float, float]]
        Maps boundary_name → (alpha/beta, g/beta).

    Returns
    -------
    K_r : csr_matrix (n_nodes, n_nodes)
        Robin stiffness contribution.
    f_r : ndarray (n_nodes,)
        Robin load contribution.
    """
    n_nodes = len(mesh.nodes)
    K_r = lil_matrix((n_nodes, n_nodes))
    f_r = np.zeros(n_nodes)
    coords = np.array([n.coords for n in mesh.nodes])

    for edge in mesh.boundary_edges:
        robin = robin_bcs.get(edge.region_name)
        if robin is None:
            continue

        alpha_over_beta, g_over_beta = robin
        nids = edge.node_ids
        n0, n1 = nids[0], nids[1]
        edge_len = np.linalg.norm(coords[n1] - coords[n0])

        if len(nids) == 2:
            # Linear edge: mass matrix = (L/6) [[2, 1], [1, 2]]
            K_r[n0, n0] += alpha_over_beta * edge_len * 2.0 / 6.0
            K_r[n0, n1] += alpha_over_beta * edge_len * 1.0 / 6.0
            K_r[n1, n0] += alpha_over_beta * edge_len * 1.0 / 6.0
            K_r[n1, n1] += alpha_over_beta * edge_len * 2.0 / 6.0

            f_r[n0] += g_over_beta * edge_len / 2.0
            f_r[n1] += g_over_beta * edge_len / 2.0
        elif len(nids) == 3:
            # Quadratic edge: mass matrix via Simpson's rule
            # M = (L/30) [[4, 2, -1], [2, 4, -1], [-1, -1, 16]]
            # (using 3-node Gauss-Lobatto for proper quadratic)
            n2 = nids[2]
            K_r[n0, n0] += alpha_over_beta * edge_len * 4.0 / 30.0
            K_r[n0, n1] += alpha_over_beta * edge_len * 2.0 / 30.0
            K_r[n0, n2] += alpha_over_beta * edge_len * (-1.0) / 30.0
            K_r[n1, n0] += alpha_over_beta * edge_len * 2.0 / 30.0
            K_r[n1, n1] += alpha_over_beta * edge_len * 4.0 / 30.0
            K_r[n1, n2] += alpha_over_beta * edge_len * (-1.0) / 30.0
            K_r[n2, n0] += alpha_over_beta * edge_len * (-1.0) / 30.0
            K_r[n2, n1] += alpha_over_beta * edge_len * (-1.0) / 30.0
            K_r[n2, n2] += alpha_over_beta * edge_len * 16.0 / 30.0

            f_r[n0] += g_over_beta * edge_len / 6.0
            f_r[n1] += g_over_beta * edge_len / 6.0
            f_r[n2] += g_over_beta * edge_len * 4.0 / 6.0

    return K_r.tocsr(), f_r
