"""2D electrostatics with P1 triangles: assemble, solve K·u = f, post-process.

Weak form: find V with the prescribed potentials such that for every test
function v vanishing there

    ∫ ε ∇V·∇v dA = ∫ ρ v dA + ∮ σ v ds

With V = Σ uⱼ φⱼ and v = φᵢ this is the linear system K·u = f. Dirichlet
nodes are eliminated: K_ff·u_f = f_f − K_fd·u_d (f: free, d: prescribed).
"""

import time
from dataclasses import dataclass, field

import numpy as np
import scipy.sparse.linalg as spla
from fem_mesher import Mesh
from fem_mesher.expressions import evaluate_field, evaluate_parameters

from . import p1
from .problem import DIRICHLET, EPSILON_0, Electrostatics, Ground, SurfaceChargeDensity, check


class SetupError(ValueError):
    """The model cannot be solved; ``issues`` holds the checklist entries."""

    def __init__(self, message: str, issues=()):
        super().__init__(message)
        self.issues = list(issues)


@dataclass
class SolveInfo:
    """What happened inside: sizes and the linear solve."""

    n_nodes: int
    n_free: int
    n_prescribed: int
    n_elements: int
    nonzeros: int
    assembly_seconds: float
    solve_seconds: float
    relative_residual: float
    method: str = "sparse direct (LU)"


@dataclass
class ElectrostaticsResult:
    mesh: Mesh
    potential: np.ndarray  # (N,) V at the nodes [V]
    electric_field: np.ndarray  # (M, 2) E = −∇V, constant per element [V/m]
    flux_density: np.ndarray  # (M, 2) D = εE [C/m²]
    energy: float  # W = ½·uᵀKu [J] (per depth)
    energy_by_domain: dict[str, float]
    charge: dict[str, float]  # per Dirichlet boundary, from the reactions K·u − f [C]
    charge_from_flux: dict[str, float]  # the same from D·n of the adjacent elements [C]
    capacitance: dict[str, float] | None  # from charge and from energy [F], two-electrode models
    info: SolveInfo
    stiffness: object = field(repr=False)  # global K (scipy CSR), for the "inside FEM" views

    @property
    def field_magnitude(self) -> np.ndarray:
        return np.linalg.norm(self.electric_field, axis=1)


def solve(problem: Electrostatics, mesh: Mesh) -> ElectrostaticsResult:
    if mesh.order != 1:
        raise SetupError("The P1 solver needs a first-order mesh (mesh order 1)")
    errors = [
        i for i in check(problem, mesh.domain_names, list(mesh.boundaries)) if i.severity == "error"
    ]
    if errors:
        raise SetupError(errors[0].message, errors)

    names = evaluate_parameters(problem.parameters)
    n = mesh.n_nodes
    t0 = time.perf_counter()

    # ε per element
    eps_domain = np.array(
        [EPSILON_0 * problem.materials[d].relative_permittivity for d in mesh.domain_names]
    )
    eps = eps_domain[mesh.triangle_domain]
    areas, gradients = p1.geometry(mesh.nodes, mesh.triangles)
    k_e = problem.depth * p1.stiffness_matrices(areas, gradients, eps)
    stiffness = p1.assemble(mesh.triangles, k_e, n)

    # Right-hand side: volume and surface charges
    f = np.zeros(n)
    midpoints = p1.edge_midpoints(mesh.nodes, mesh.triangles)
    for src in problem.sources:
        in_domain = mesh.triangle_domain == mesh.domain_names.index(src.domain)
        rho = np.zeros((mesh.n_triangles, 3))
        mp = midpoints[in_domain]
        rho[in_domain] = evaluate_field(src.value, names, mp[..., 0], mp[..., 1])
        f += problem.depth * p1.load_vector(mesh.triangles, areas, rho, n)
    for bc in problem.boundary_conditions:
        if isinstance(bc, SurfaceChargeDensity):
            edges = mesh.edges[mesh.boundaries[bc.boundary]]

            def sigma(pts, value=bc.value):
                return evaluate_field(value, names, pts[:, 0], pts[:, 1])

            f += problem.depth * p1.edge_load_vector(mesh.nodes, edges, sigma, n)

    # Dirichlet values; nodes shared by two boundaries must agree
    u = np.zeros(n)
    owner = np.full(n, -1)
    dirichlet = [bc for bc in problem.boundary_conditions if isinstance(bc, DIRICHLET)]
    for k, bc in enumerate(dirichlet):
        ix = np.unique(mesh.edges[mesh.boundaries[bc.boundary]][:, :2])
        values = (
            np.zeros(len(ix))
            if isinstance(bc, Ground)
            else evaluate_field(bc.value, names, mesh.nodes[ix, 0], mesh.nodes[ix, 1])
        )
        clash = (owner[ix] >= 0) & ~np.isclose(u[ix], values, rtol=1e-12, atol=1e-12)
        if clash.any():
            other = dirichlet[owner[ix][clash][0]].boundary
            raise SetupError(
                f"Boundaries {other!r} and {bc.boundary!r} touch but have different potentials",
                [],
            )
        new = owner[ix] < 0
        u[ix[new]] = values[new]
        owner[ix[new]] = k
    prescribed = owner >= 0
    free = ~prescribed
    t1 = time.perf_counter()

    # Eliminate the prescribed nodes and solve
    k_ff = stiffness[free][:, free].tocsc()
    rhs = f[free] - stiffness[free][:, prescribed] @ u[prescribed]
    u[free] = spla.spsolve(k_ff, rhs) if free.any() else []
    t2 = time.perf_counter()
    residual = (
        np.linalg.norm(k_ff @ u[free] - rhs) / max(np.linalg.norm(rhs), 1e-300)
        if free.any()
        else 0.0
    )

    # Post-processing
    e_field = -np.einsum("eid,ei->ed", gradients, u[mesh.triangles[:, :3]])
    d_field = eps[:, None] * e_field
    u_e = u[mesh.triangles[:, :3]]
    w_e = 0.5 * np.einsum("ei,eij,ej->e", u_e, k_e, u_e)
    reactions = stiffness @ u - f  # = ∮ σ φᵢ on prescribed nodes: the charge they carry
    charge = {bc.boundary: float(reactions[owner == k].sum()) for k, bc in enumerate(dirichlet)}
    charge_flux = {
        bc.boundary: _flux_charge(mesh, d_field, bc.boundary, problem.depth) for bc in dirichlet
    }

    result = ElectrostaticsResult(
        mesh=mesh,
        potential=u,
        electric_field=e_field,
        flux_density=d_field,
        energy=float(w_e.sum()),
        energy_by_domain={
            d: float(w_e[mesh.triangle_domain == i].sum()) for i, d in enumerate(mesh.domain_names)
        },
        charge=charge,
        charge_from_flux=charge_flux,
        capacitance=None,
        info=SolveInfo(
            n_nodes=n,
            n_free=int(free.sum()),
            n_prescribed=int(prescribed.sum()),
            n_elements=mesh.n_triangles,
            nonzeros=int(stiffness.nnz),
            assembly_seconds=t1 - t0,
            solve_seconds=t2 - t1,
            relative_residual=float(residual),
        ),
        stiffness=stiffness,
    )
    result.capacitance = _capacitance(problem, dirichlet, u, owner, charge, result.energy)
    return result


def _flux_charge(mesh: Mesh, d_field: np.ndarray, boundary: str, depth: float) -> float:
    """Charge on a boundary from D·n of the element next to each edge.

    Less accurate than the reaction charge: D is constant per element, so it is
    only first-order accurate at the boundary.
    """
    edges = mesh.edges[mesh.boundaries[boundary]][:, :2]
    owner = _edge_to_triangle(mesh)
    total = 0.0
    for a, b in edges:
        tri = owner.get((min(a, b), max(a, b)))
        if tri is None:
            continue
        for e in tri:  # interior boundaries (a|b) have two adjacent elements
            corners = mesh.triangles[e, :3]
            third = next(c for c in corners if c not in (a, b))
            pa, pb, pc = mesh.nodes[a], mesh.nodes[b], mesh.nodes[third]
            t = pb - pa
            normal = np.array([t[1], -t[0]]) / np.linalg.norm(t)
            if np.dot(normal, pc - pa) > 0:
                normal = -normal  # outward from this element
            total += -float(d_field[e] @ normal) * np.linalg.norm(t) * depth
    return float(total)


def _edge_to_triangle(mesh: Mesh) -> dict:
    owner: dict[tuple, list[int]] = {}
    for e, t in enumerate(mesh.triangles[:, :3]):
        for i in range(3):
            a, b = t[i], t[(i + 1) % 3]
            owner.setdefault((min(a, b), max(a, b)), []).append(e)
    return owner


def _capacitance(problem, dirichlet, u, owner, charge, energy) -> dict[str, float] | None:
    """C = Q/ΔV and C = 2W/ΔV² for two electrodes at constant potentials, no free charge."""
    if problem.sources or any(
        isinstance(bc, SurfaceChargeDensity) for bc in problem.boundary_conditions
    ):
        return None
    levels: dict[float, list[str]] = {}
    for k, bc in enumerate(dirichlet):
        values = u[owner == k]
        if len(values) == 0 or not np.allclose(values, values[0], rtol=1e-12, atol=1e-15):
            return None  # not an equipotential electrode
        levels.setdefault(round(float(values[0]), 12), []).append(bc.boundary)
    if len(levels) != 2:
        return None
    (v_lo, low), (v_hi, high) = sorted(levels.items())
    dv = v_hi - v_lo
    q_hi = sum(charge[b] for b in high)
    return {"from_charge": q_hi / dv, "from_energy": 2 * energy / dv**2, "voltage": dv}
