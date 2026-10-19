"""Linear (P1) triangle elements: shape functions, element matrices, assembly.

On a triangle with corners p₀, p₁, p₂ the shape function φᵢ is linear, 1 at
corner i and 0 at the other two. Its gradient is constant on the element:

    ∇φᵢ = (y_j − y_k, x_k − x_j) / (2A)      (i, j, k cyclic, A = area)

The element stiffness matrix of −∇·(ε∇V) is then exact without quadrature:

    K_e[i, j] = ∫ ε ∇φᵢ·∇φⱼ dA = ε · A · ∇φᵢ·∇φⱼ        (3×3, symmetric)

Every row of K_e sums to zero (a constant V has no gradient), which is why
the global matrix is singular until a potential is fixed somewhere.
"""

import numpy as np
import scipy.sparse as sp

# Shape function values at the edge midpoints (01, 12, 20): the 3-point
# midpoint rule integrates quadratics on a triangle exactly.
_MIDPOINT_SHAPES = np.array([[0.5, 0.5, 0.0], [0.0, 0.5, 0.5], [0.5, 0.0, 0.5]])


def geometry(nodes: np.ndarray, triangles: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Areas (M,) and shape function gradients (M, 3, 2) of all triangles."""
    p = nodes[triangles[:, :3]]
    x, y = p[..., 0], p[..., 1]
    b = np.stack([y[:, 1] - y[:, 2], y[:, 2] - y[:, 0], y[:, 0] - y[:, 1]], axis=1)
    c = np.stack([x[:, 2] - x[:, 1], x[:, 0] - x[:, 2], x[:, 1] - x[:, 0]], axis=1)
    two_a = (x[:, 1] - x[:, 0]) * (y[:, 2] - y[:, 0]) - (x[:, 2] - x[:, 0]) * (y[:, 1] - y[:, 0])
    if np.any(two_a <= 0):
        raise ValueError("Degenerate or clockwise triangle in the mesh")
    gradients = np.stack([b, c], axis=2) / two_a[:, None, None]
    return two_a / 2, gradients


def stiffness_matrices(
    areas: np.ndarray, gradients: np.ndarray, coefficient: np.ndarray
) -> np.ndarray:
    """K_e = coefficient · A · G Gᵀ for every element: (M, 3, 3)."""
    return (coefficient * areas)[:, None, None] * np.einsum("eid,ejd->eij", gradients, gradients)


def assemble(triangles: np.ndarray, element_matrices: np.ndarray, n_nodes: int) -> sp.csr_matrix:
    """Global matrix: add each K_e at the rows/columns of its element's nodes."""
    t = triangles[:, :3]
    rows = np.repeat(t, 3, axis=1).ravel()
    cols = np.tile(t, (1, 3)).ravel()
    return sp.coo_matrix((element_matrices.ravel(), (rows, cols)), shape=(n_nodes, n_nodes)).tocsr()


def edge_midpoints(nodes: np.ndarray, triangles: np.ndarray) -> np.ndarray:
    """(M, 3, 2) midpoints of the edges 01, 12, 20 (the quadrature points)."""
    p = nodes[triangles[:, :3]]
    return 0.5 * (p + p[:, [1, 2, 0]])


def load_vector(
    triangles: np.ndarray, areas: np.ndarray, values_at_midpoints: np.ndarray, n_nodes: int
) -> np.ndarray:
    """f_i = ∫ s φᵢ dA with the midpoint rule (exact for linear s): (N,)."""
    f_e = (areas / 3.0)[:, None] * (values_at_midpoints @ _MIDPOINT_SHAPES)
    return np.bincount(triangles[:, :3].ravel(), weights=f_e.ravel(), minlength=n_nodes)


def edge_load_vector(
    nodes: np.ndarray, edges: np.ndarray, value: "callable", n_nodes: int
) -> np.ndarray:
    """f_i = ∫ s φᵢ ds along boundary edges, Simpson's rule (exact for linear s)."""
    a, b = nodes[edges[:, 0]], nodes[edges[:, 1]]
    m = 0.5 * (a + b)
    length = np.linalg.norm(b - a, axis=1)
    sa, sm, sb = value(a), value(m), value(b)
    fa = length / 6 * (sa + 2 * sm)  # ∫ s φ_a: φ_a = 1, ½, 0 at a, m, b
    fb = length / 6 * (sb + 2 * sm)
    return np.bincount(edges[:, 0], weights=fa, minlength=n_nodes) + np.bincount(
        edges[:, 1], weights=fb, minlength=n_nodes
    )
