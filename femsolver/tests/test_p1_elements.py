"""P1 element building blocks against closed-form values (one or two triangles)."""

import numpy as np
import pytest
from fem_solver import p1

# Reference triangle (0,0), (1,0), (0,1): area 1/2
REF_NODES = np.array([[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]])
REF_TRI = np.array([[0, 1, 2]])


def test_reference_triangle_gradients_and_stiffness():
    areas, grads = p1.geometry(REF_NODES, REF_TRI)
    assert areas[0] == pytest.approx(0.5)
    np.testing.assert_allclose(grads[0], [[-1, -1], [1, 0], [0, 1]])
    k = p1.stiffness_matrices(areas, grads, np.ones(1))[0]
    np.testing.assert_allclose(k, 0.5 * np.array([[2, -1, -1], [-1, 1, 0], [-1, 0, 1]]))


def test_shape_functions_interpolate_linear_functions_exactly():
    """Σ φᵢ = 1 and Σ xᵢ∇φᵢ = (1, 0): gradients of the nodal interpolant of x and y."""
    rng = np.random.default_rng(0)
    nodes = rng.random((3, 2)) + [[0, 0], [1, 0], [0, 1]]
    _, grads = p1.geometry(nodes, REF_TRI)
    np.testing.assert_allclose(grads[0].sum(axis=0), 0, atol=1e-12)
    np.testing.assert_allclose(nodes.T @ grads[0], np.eye(2), atol=1e-12)


def test_clockwise_triangle_is_rejected():
    with pytest.raises(ValueError):
        p1.geometry(REF_NODES, np.array([[0, 2, 1]]))


def test_assembly_adds_shared_entries():
    """Two triangles of a unit square share the diagonal edge 1–2."""
    nodes = np.array([[0.0, 0.0], [1.0, 0.0], [0.0, 1.0], [1.0, 1.0]])
    tris = np.array([[0, 1, 2], [1, 3, 2]])
    areas, grads = p1.geometry(nodes, tris)
    k_e = p1.stiffness_matrices(areas, grads, np.ones(2))
    k = p1.assemble(tris, k_e, 4).toarray()
    assert k[1, 2] == pytest.approx(k_e[0, 1, 2] + k_e[1, 0, 2])
    assert k[0, 3] == 0  # opposite corners do not share an element
    np.testing.assert_allclose(k, k.T)


def test_load_vector_is_exact_for_linear_sources():
    """∫ s φᵢ dA = A/12 · (2sᵢ + sⱼ + sₖ) for linear s."""
    nodes = np.array([[0.0, 0.0], [2.0, 0.0], [0.5, 1.5]])
    areas, _ = p1.geometry(nodes, REF_TRI)
    s = lambda p: 3 * p[..., 0] - 2 * p[..., 1] + 1  # noqa: E731
    mid = p1.edge_midpoints(nodes, REF_TRI)
    f = p1.load_vector(REF_TRI, areas, s(mid), 3)
    sv = s(nodes)
    exact = areas[0] / 12 * (sv + sv.sum())
    np.testing.assert_allclose(f, exact, rtol=1e-12)


def test_edge_load_is_exact_for_linear_densities():
    """∫ s φ_a ds = L/6 · (2s_a + s_b) along an edge a→b."""
    nodes = np.array([[0.0, 0.0], [3.0, 4.0]])  # L = 5
    edges = np.array([[0, 1]])
    s = lambda p: 1 + p[:, 0]  # noqa: E731  s_a = 1, s_b = 4
    f = p1.edge_load_vector(nodes, edges, s, 2)
    np.testing.assert_allclose(f, [5 / 6 * (2 + 4), 5 / 6 * (8 + 1)])
