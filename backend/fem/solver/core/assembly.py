"""Global FEM stiffness and load vector assembly.

Assembles element contributions into global sparse matrices
using COO format converted to CSR for efficient solving.
"""

import numpy as np
from numpy import ndarray
from scipy.sparse import coo_matrix, csr_matrix

from backend.common.models.fem.mesh import FEMMesh
from backend.fem.solver.core.jacobian import compute_dN_dx
from backend.fem.solver.core.shape_functions import tri3_shape


def element_stiffness_tri3(
    node_coords: ndarray,
    eps: float,
) -> ndarray:
    """Compute element stiffness matrix for a Tri3 element.

    K_e = ∫ B^T · ε · B dΩ = ε · A · B^T · B

    For linear triangles the integrand is constant, so no quadrature
    loop is needed — the integral is simply (area × integrand).

    Parameters
    ----------
    node_coords : ndarray (3, 2)
        Physical coordinates of the three nodes.
    eps : float
        Isotropic material property (e.g. permittivity).

    Returns
    -------
    K_e : ndarray (3, 3)
        Element stiffness matrix.
    """
    # Shape function gradients (constant for Tri3)
    _, dN_dxi = tri3_shape(0.0, 0.0)
    dN_dx, det_J = compute_dN_dx(node_coords, dN_dxi)

    area = 0.5 * abs(det_J)

    # K_e = eps * area * (dN_dx @ dN_dx^T)
    # dN_dx is (3,2), so dN_dx @ dN_dx^T is (3,3)
    K_e = eps * area * (dN_dx @ dN_dx.T)
    return K_e


def assemble_stiffness(
    mesh: FEMMesh,
    material_map: dict[str, float],
) -> csr_matrix:
    """Assemble global stiffness matrix K.

    Parameters
    ----------
    mesh : FEMMesh
        The finite element mesh.
    material_map : dict[str, float]
        Maps material_id → scalar material property value.

    Returns
    -------
    K : csr_matrix (n_nodes, n_nodes)
        Global stiffness matrix in CSR format.
    """
    n_nodes = len(mesh.nodes)
    # Build region_id → material_id lookup
    region_material = {r.id: r.material_id for r in mesh.regions}

    rows = []
    cols = []
    data = []

    # Build node coordinate array
    coords = np.array([n.coords for n in mesh.nodes])

    for elem in mesh.elements:
        nids = np.array(elem.node_ids)
        elem_coords = coords[nids]

        mat_id = region_material[elem.region_id]
        eps = material_map[mat_id]

        K_e = element_stiffness_tri3(elem_coords, eps)

        # Scatter into COO
        for i_local in range(len(nids)):
            for j_local in range(len(nids)):
                rows.append(nids[i_local])
                cols.append(nids[j_local])
                data.append(K_e[i_local, j_local])

    K = coo_matrix((data, (rows, cols)), shape=(n_nodes, n_nodes))
    return K.tocsr()


def assemble_load_vector(
    mesh: FEMMesh,
    rho_v: float,
) -> ndarray:
    """Assemble global load vector f from a uniform volumetric source.

    f_i = ∫ N_i · ρ_v dΩ

    For Tri3 with constant ρ_v: f_i = ρ_v · area / 3  per node.

    Parameters
    ----------
    mesh : FEMMesh
        The finite element mesh.
    rho_v : float
        Uniform volumetric source (e.g. charge density).

    Returns
    -------
    f : ndarray (n_nodes,)
        Global load vector.
    """
    n_nodes = len(mesh.nodes)
    f = np.zeros(n_nodes)

    coords = np.array([n.coords for n in mesh.nodes])

    for elem in mesh.elements:
        nids = np.array(elem.node_ids)
        elem_coords = coords[nids]

        # Compute element area
        _, dN_dxi = tri3_shape(0.0, 0.0)
        _, det_J = compute_dN_dx(elem_coords, dN_dxi)
        area = 0.5 * abs(det_J)

        # For Tri3: ∫ N_i dA = area/3 for each node
        f_e = rho_v * area / 3.0

        for i_local, gid in enumerate(nids):
            f[gid] += f_e

    return f
