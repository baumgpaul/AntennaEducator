"""Linear system solvers: direct (spsolve), CG, GMRES."""

from numpy import ndarray
from scipy.sparse import csr_matrix
from scipy.sparse.linalg import cg, gmres, spsolve


def solve_system(
    K: csr_matrix,
    f: ndarray,
    method: str = "direct",
    tol: float = 1e-10,
    max_iter: int = 1000,
) -> ndarray:
    """Solve the linear system K·u = f.

    Parameters
    ----------
    K : csr_matrix (n, n)
        System matrix.
    f : ndarray (n,)
        Right-hand side vector.
    method : str
        "direct" (spsolve), "cg" (conjugate gradient), or "gmres".
    tol : float
        Convergence tolerance for iterative solvers.
    max_iter : int
        Maximum iterations for iterative solvers.

    Returns
    -------
    u : ndarray (n,)
        Solution vector.
    """
    if method == "direct":
        return spsolve(K, f)

    if method == "cg":
        u, info = cg(K, f, rtol=tol, maxiter=max_iter)
        if info != 0:
            raise RuntimeError(f"CG solver did not converge (info={info})")
        return u

    if method == "gmres":
        u, info = gmres(K, f, rtol=tol, maxiter=max_iter)
        if info != 0:
            raise RuntimeError(f"GMRES solver did not converge (info={info})")
        return u

    raise ValueError(f"Unknown solver method '{method}'. Supported: 'direct', 'cg', 'gmres'")
