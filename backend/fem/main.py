"""FEM Studio service (preview, terraform enable_fem): mesh, check, solve, export.

Requests carry the whole model (geometry + physics); the service is stateless.
Only maintainers and admins may use it while FEM is a preview, matching the
frontend gate (frontend/src/config/features.ts).
"""

import math
import os
import threading
import time

import numpy as np
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exception_handlers import http_exception_handler, request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fem_mesher import Geometry2D, Mesh, mesh_geometry
from fem_mesher.expressions import ExpressionError, evaluate, evaluate_parameters
from fem_mesher.geometry import Circle, Polygon, Rectangle
from fem_solver import EPSILON_0, Electrostatics, SetupError, check, solve
from fem_solver.opencfs import export
from pydantic import BaseModel, ConfigDict
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend.common.auth.dependencies import get_current_user
from backend.common.auth.identity import UserIdentity
from backend.common.utils.error_handler import install_error_handlers
from backend.common.utils.logging_config import configure_logging

logger = configure_logging("fem")

API = "/api/fem"
# Keeps a request well inside the Lambda limits (time, 6 MB response) — and
# classroom models are far smaller. Estimated from area / element size.
MAX_TRIANGLES = 60_000
MAX_SHAPES = 200
# Gmsh keeps global state and is not thread-safe (FastAPI runs these endpoints
# in a thread pool; Lambda itself handles one request at a time)
_GMSH = threading.Lock()

app = FastAPI(
    title="FEM Studio service (preview)",
    docs_url=f"{API}/docs",
    openapi_url=f"{API}/openapi.json",
)
if os.getenv("USE_FUNCTION_URL_CORS", "").lower() != "true":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
app.add_middleware(GZipMiddleware, minimum_size=1000)
install_error_handlers(app)


# Why a request was refused, for the logs (location and message only: no values, no tokens)
@app.exception_handler(RequestValidationError)
async def _log_invalid_request(request: Request, exc: RequestValidationError):
    reasons = "; ".join(
        f"{'.'.join(str(p) for p in e.get('loc', ()))}: {e.get('msg')}" for e in exc.errors()[:5]
    )
    logger.info("422 %s: %s", request.url.path, reasons)
    return await request_validation_exception_handler(request, exc)


@app.exception_handler(StarletteHTTPException)
async def _log_refused(request: Request, exc: StarletteHTTPException):
    if exc.status_code in (401, 403, 422):
        detail = exc.detail.get("message") if isinstance(exc.detail, dict) else exc.detail
        logger.info("%s %s: %s", exc.status_code, request.url.path, str(detail)[:300])
    return await http_exception_handler(request, exc)


def preview_user(user: UserIdentity = Depends(get_current_user)) -> UserIdentity:
    if not user.is_maintainer:
        raise HTTPException(
            status_code=403, detail="FEM Studio is a preview for maintainers and admins"
        )
    return user


class MeshRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    geometry: Geometry2D


class ModelRequest(MeshRequest):
    problem: Electrostatics


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "fem"}


def _estimated_triangles(geometry: Geometry2D) -> float:
    """Upper estimate from the shapes' total area and the smallest element size."""
    values = evaluate_parameters(geometry.parameters)
    ev = lambda e: evaluate(e, values)  # noqa: E731
    area = 0.0
    for s in geometry.shapes:
        if isinstance(s, Rectangle):
            area += abs(ev(s.width) * ev(s.height))
        elif isinstance(s, Circle):
            area += math.pi * ev(s.r) ** 2
        elif isinstance(s, Polygon):
            pts = np.array([[ev(x), ev(y)] for x, y in s.points])
            area += 0.5 * abs(
                np.dot(pts[:, 0], np.roll(pts[:, 1], -1))
                - np.dot(pts[:, 1], np.roll(pts[:, 0], -1))
            )
    sizes = [ev(geometry.mesh.size)] + [ev(v) for v in geometry.mesh.domain_sizes.values()]
    h = max(min(sizes), 1e-300)
    return area / (0.433 * h * h)  # equilateral triangle of side h


def _mesh(geometry: Geometry2D):
    if len(geometry.shapes) > MAX_SHAPES:
        raise HTTPException(status_code=422, detail=f"At most {MAX_SHAPES} shapes")
    try:
        if _estimated_triangles(geometry) > MAX_TRIANGLES:
            raise HTTPException(
                status_code=422,
                detail=f"The mesh would exceed {MAX_TRIANGLES:,} triangles: increase the element size",
            )
        with _GMSH:
            return mesh_geometry(geometry)
    except (ValueError, ExpressionError) as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


def _mesh_json(mesh: Mesh) -> dict:
    """Compact flat arrays (like the near-field response)."""
    return {
        "nodes": mesh.nodes.ravel().round(12).tolist(),
        "triangles": mesh.triangles.ravel().tolist(),
        "triangle_domain": mesh.triangle_domain.tolist(),
        "domain_names": mesh.domain_names,
        "edges": mesh.edges.ravel().tolist(),
        "boundaries": {name: ix.tolist() for name, ix in mesh.boundaries.items()},
        "quality": mesh.quality().round(4).tolist(),
        "stats": mesh.stats(),
    }


def _issues(problem: Electrostatics, mesh: Mesh) -> list[dict]:
    return [i.__dict__ for i in check(problem, mesh.domain_names, list(mesh.boundaries))]


@app.post(f"{API}/mesh")
def mesh_endpoint(request: MeshRequest, user: UserIdentity = Depends(preview_user)):
    t0 = time.perf_counter()
    result = _mesh(request.geometry)
    return {
        "mesh": _mesh_json(result.mesh),
        "warnings": result.warnings,
        "seconds": round(time.perf_counter() - t0, 3),
    }


@app.post(f"{API}/check")
def check_endpoint(request: ModelRequest, user: UserIdentity = Depends(preview_user)):
    """The model checklist (meshes the geometry to know its domains and boundaries)."""
    result = _mesh(request.geometry)
    return {
        "issues": _issues(request.problem, result.mesh),
        "warnings": result.warnings,
        "domains": result.mesh.domain_names,
        "boundaries": sorted(result.mesh.boundaries),
    }


def _solve(request: ModelRequest):
    result = _mesh(request.geometry)
    try:
        return result, solve(request.problem, result.mesh)
    except SetupError as e:
        raise HTTPException(
            status_code=422,
            detail={"message": str(e), "issues": [i.__dict__ for i in e.issues]},
        ) from e


@app.post(f"{API}/solve/summary")
def solve_summary_endpoint(request: ModelRequest, user: UserIdentity = Depends(preview_user)):
    """Only the numbers of a solve (no mesh or fields): one point of a study."""
    t0 = time.perf_counter()
    result, r = _solve(request)
    stats = result.mesh.stats()
    return {
        "warnings": result.warnings,
        "nodes": stats["nodes"],
        "triangles": stats["triangles"],
        "energy": r.energy,
        "energy_by_domain": r.energy_by_domain,
        "charge": r.charge,
        "capacitance": r.capacitance,
        "info": r.info.__dict__,
        "seconds": round(time.perf_counter() - t0, 3),
    }


@app.post(f"{API}/solve")
def solve_endpoint(request: ModelRequest, user: UserIdentity = Depends(preview_user)):
    result, r = _solve(request)
    mesh = result.mesh
    k = r.stiffness.tocoo()
    return {
        "mesh": _mesh_json(mesh),
        "warnings": result.warnings,
        "issues": _issues(request.problem, mesh),
        "potential": r.potential.tolist(),
        "electric_field": r.electric_field.ravel().tolist(),
        "flux_density": r.flux_density.ravel().tolist(),
        "energy": r.energy,
        "energy_by_domain": r.energy_by_domain,
        "charge": r.charge,
        "charge_from_flux": r.charge_from_flux,
        "capacitance": r.capacitance,
        # for the element-matrix view: K_e = ε·depth·A·GGᵀ is computed in the browser
        "permittivity": {
            d: EPSILON_0 * request.problem.materials[d].relative_permittivity
            for d in mesh.domain_names
        },
        "depth": request.problem.depth,
        "info": r.info.__dict__,
        "sparsity": _sparsity(k.row, k.col, mesh.n_nodes),
    }


def _sparsity(rows: np.ndarray, cols: np.ndarray, n: int, max_cells: int = 200) -> dict:
    """Pattern of K: exact for small systems, else counts on a max_cells² grid."""
    if n <= max_cells:
        return {"n": n, "binned": False, "rows": rows.tolist(), "cols": cols.tolist()}
    scale = max_cells / n
    cells = np.unique(
        np.stack([(rows * scale).astype(int), (cols * scale).astype(int)], axis=1), axis=0
    )
    return {
        "n": n,
        "binned": True,
        "grid": max_cells,
        "rows": cells[:, 0].tolist(),
        "cols": cells[:, 1].tolist(),
    }


@app.post(f"{API}/export/opencfs")
def export_endpoint(request: ModelRequest, user: UserIdentity = Depends(preview_user)):
    """openCFS input files: simulation.xml, mat.xml and the mesh (Gmsh MSH 2.2)."""
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory() as tmp:
        msh = Path(tmp) / "model.msh"
        try:
            with _GMSH:
                result = mesh_geometry(request.geometry, msh_path=msh)
        except (ValueError, ExpressionError) as e:
            raise HTTPException(status_code=422, detail=str(e)) from e
        files = export(
            request.problem,
            result.mesh.domain_names,
            sorted(result.mesh.boundaries),
            mesh_file="model.msh",
        )
        files["model.msh"] = msh.read_text(encoding="utf-8")
    return {"files": files, "issues": _issues(request.problem, result.mesh)}
