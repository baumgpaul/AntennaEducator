"""Tests for global FEM stiffness and load assembly.

Verifies:
1. Single-element stiffness matrix properties (symmetry, positive semi-definiteness)
2. Two-element patch assembly with shared nodes
3. Load vector from uniform source term
4. Stiffness row sums = 0 (from partition-of-unity property)
"""

import numpy as np
import pytest
from scipy.sparse import issparse

from backend.common.models.fem.mesh import (
    ElementType,
    FEMElement,
    FEMMesh,
    FEMNode,
    Region,
)
from backend.fem.solver.core.assembly import (
    assemble_load_vector,
    assemble_stiffness,
    element_stiffness_tri3,
)


class TestElementStiffnessTri3:
    """Element-level stiffness matrix for a linear triangle."""

    @pytest.fixture
    def unit_right_triangle(self):
        """Node coords for the unit right triangle."""
        return np.array([[0.0, 0.0], [1.0, 0.0], [0.0, 1.0]])

    def test_shape(self, unit_right_triangle):
        """3×3 matrix for Tri3."""
        K_e = element_stiffness_tri3(unit_right_triangle, eps=1.0)
        assert K_e.shape == (3, 3)

    def test_symmetric(self, unit_right_triangle):
        """Stiffness matrix must be symmetric."""
        K_e = element_stiffness_tri3(unit_right_triangle, eps=1.0)
        np.testing.assert_allclose(K_e, K_e.T, atol=1e-14)

    def test_row_sums_zero(self, unit_right_triangle):
        """Row sums must be zero (constant field has zero energy)."""
        K_e = element_stiffness_tri3(unit_right_triangle, eps=1.0)
        np.testing.assert_allclose(K_e.sum(axis=1), [0.0, 0.0, 0.0], atol=1e-14)

    def test_positive_semidefinite(self, unit_right_triangle):
        """Eigenvalues >= 0 (one zero eigenvalue for rigid-body mode)."""
        K_e = element_stiffness_tri3(unit_right_triangle, eps=1.0)
        eigenvalues = np.linalg.eigvalsh(K_e)
        assert np.all(eigenvalues >= -1e-14)
        # Exactly one zero eigenvalue (constant mode)
        assert np.sum(np.abs(eigenvalues) < 1e-10) == 1

    def test_known_values_unit_triangle(self, unit_right_triangle):
        r"""Known K for unit right triangle with eps=1.

        For the unit right triangle, area = 0.5:
        K = (area) * B^T B where B = [[-1, 1, 0], [-1, 0, 1]]

        K = 0.5 * [[ 2, -1, -1],
                    [-1,  1,  0],
                    [-1,  0,  1]]
        """
        K_e = element_stiffness_tri3(unit_right_triangle, eps=1.0)
        expected = 0.5 * np.array(
            [
                [2.0, -1.0, -1.0],
                [-1.0, 1.0, 0.0],
                [-1.0, 0.0, 1.0],
            ]
        )
        np.testing.assert_allclose(K_e, expected, atol=1e-14)

    def test_scaled_by_permittivity(self, unit_right_triangle):
        """K scales linearly with material property."""
        K1 = element_stiffness_tri3(unit_right_triangle, eps=1.0)
        K5 = element_stiffness_tri3(unit_right_triangle, eps=5.0)
        np.testing.assert_allclose(K5, 5.0 * K1, atol=1e-14)

    def test_scaled_triangle(self):
        """Triangle with side length 2: area = 2, gradients halved."""
        node_coords = np.array([[0.0, 0.0], [2.0, 0.0], [0.0, 2.0]])
        K_e = element_stiffness_tri3(node_coords, eps=1.0)
        # Same matrix as unit triangle (area × grad^2 cancels)
        np.testing.assert_allclose(K_e.sum(axis=1), [0.0, 0.0, 0.0], atol=1e-14)
        assert K_e[0, 0] == pytest.approx(1.0)  # 2 * (1/2)^2 * 2 = 1.0


class TestGlobalAssembly:
    """Global stiffness assembly for multi-element meshes."""

    @pytest.fixture
    def two_tri_mesh(self):
        r"""Two-triangle unit square mesh.

        3---2
        |\ |
        | \|
        0---1
        """
        nodes = [
            FEMNode(id=0, coords=[0.0, 0.0]),
            FEMNode(id=1, coords=[1.0, 0.0]),
            FEMNode(id=2, coords=[1.0, 1.0]),
            FEMNode(id=3, coords=[0.0, 1.0]),
        ]
        elements = [
            FEMElement(
                id=0,
                element_type=ElementType.TRI3,
                node_ids=[0, 1, 2],
                region_id=0,
            ),
            FEMElement(
                id=1,
                element_type=ElementType.TRI3,
                node_ids=[0, 2, 3],
                region_id=0,
            ),
        ]
        regions = [Region(id=0, name="domain", material_id="mat1")]
        return FEMMesh(
            nodes=nodes,
            elements=elements,
            regions=regions,
            boundary_edges=[],
            element_type=ElementType.TRI3,
        )

    def test_global_matrix_shape(self, two_tri_mesh):
        """4 nodes → 4×4 global stiffness."""
        material_map = {"mat1": 1.0}
        K = assemble_stiffness(two_tri_mesh, material_map)
        assert K.shape == (4, 4)

    def test_global_matrix_sparse(self, two_tri_mesh):
        """Result should be a sparse matrix."""
        material_map = {"mat1": 1.0}
        K = assemble_stiffness(two_tri_mesh, material_map)
        assert issparse(K)

    def test_global_matrix_symmetric(self, two_tri_mesh):
        """Global stiffness must be symmetric."""
        material_map = {"mat1": 1.0}
        K = assemble_stiffness(two_tri_mesh, material_map)
        K_dense = K.toarray()
        np.testing.assert_allclose(K_dense, K_dense.T, atol=1e-14)

    def test_global_row_sums_zero(self, two_tri_mesh):
        """Row sums of global K must be zero."""
        material_map = {"mat1": 1.0}
        K = assemble_stiffness(two_tri_mesh, material_map)
        row_sums = np.array(K.sum(axis=1)).flatten()
        np.testing.assert_allclose(row_sums, 0.0, atol=1e-14)

    def test_global_positive_semidefinite(self, two_tri_mesh):
        """All eigenvalues >= 0, exactly 1 zero eigenvalue (rigid body)."""
        material_map = {"mat1": 1.0}
        K = assemble_stiffness(two_tri_mesh, material_map)
        eigenvalues = np.linalg.eigvalsh(K.toarray())
        assert np.all(eigenvalues >= -1e-10)
        assert np.sum(np.abs(eigenvalues) < 1e-10) == 1

    def test_shared_edge_coupling(self, two_tri_mesh):
        """Nodes 1 and 2 share an edge in element 0 — should have nonzero K[1,2]."""
        material_map = {"mat1": 1.0}
        K = assemble_stiffness(two_tri_mesh, material_map)
        assert abs(K[1, 2]) > 1e-10

    def test_material_scaling(self, two_tri_mesh):
        """K with eps=5 should be 5× K with eps=1."""
        K1 = assemble_stiffness(two_tri_mesh, {"mat1": 1.0})
        K5 = assemble_stiffness(two_tri_mesh, {"mat1": 5.0})
        np.testing.assert_allclose(K5.toarray(), 5.0 * K1.toarray(), atol=1e-14)


class TestLoadVector:
    """Global load vector assembly."""

    @pytest.fixture
    def single_tri_mesh(self):
        """A single unit right triangle."""
        nodes = [
            FEMNode(id=0, coords=[0.0, 0.0]),
            FEMNode(id=1, coords=[1.0, 0.0]),
            FEMNode(id=2, coords=[0.0, 1.0]),
        ]
        elements = [
            FEMElement(
                id=0,
                element_type=ElementType.TRI3,
                node_ids=[0, 1, 2],
                region_id=0,
            ),
        ]
        regions = [Region(id=0, name="domain", material_id="mat1")]
        return FEMMesh(
            nodes=nodes,
            elements=elements,
            regions=regions,
            boundary_edges=[],
            element_type=ElementType.TRI3,
        )

    def test_uniform_source(self, single_tri_mesh):
        """Uniform source rho=1 on unit triangle.

        ∫ N_i * 1 dA = area/3 = 1/6 for each node (equal distribution).
        """
        f = assemble_load_vector(single_tri_mesh, rho_v=1.0)
        assert f.shape == (3,)
        np.testing.assert_allclose(f, [1 / 6, 1 / 6, 1 / 6], atol=1e-14)

    def test_zero_source(self, single_tri_mesh):
        """Zero source should give zero load vector."""
        f = assemble_load_vector(single_tri_mesh, rho_v=0.0)
        np.testing.assert_allclose(f, [0.0, 0.0, 0.0], atol=1e-14)

    def test_scaled_source(self, single_tri_mesh):
        """Load vector scales linearly with source magnitude."""
        f1 = assemble_load_vector(single_tri_mesh, rho_v=1.0)
        f3 = assemble_load_vector(single_tri_mesh, rho_v=3.0)
        np.testing.assert_allclose(f3, 3.0 * f1, atol=1e-14)

    def test_total_load_equals_integral(self, single_tri_mesh):
        """Sum of load vector = ∫ rho_v dA = rho_v * area."""
        rho = 2.5
        f = assemble_load_vector(single_tri_mesh, rho_v=rho)
        area = 0.5  # unit right triangle
        assert f.sum() == pytest.approx(rho * area)
