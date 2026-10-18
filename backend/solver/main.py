"""FastAPI application for the Solver service."""

import json
import os
import time
from datetime import datetime, timezone

import numpy as np
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.common.auth.dependencies import get_current_user
from backend.common.auth.identity import UserIdentity
from backend.common.auth.token_costs import calculate_sweep_cost
from backend.common.auth.token_dependency import (
    TokenCheckResult,
    charge_simulation_tokens,
    check_simulation_tokens,
    require_simulation_tokens,
)
from backend.common.utils.error_handler import install_error_handlers
from backend.common.utils.logging_config import configure_logging

logger = configure_logging("solver")

from .config import settings
from .jobs import JobStore, jobs_enabled
from .schemas import (
    FrequencyPointResponse,
    FrequencySweepRequest,
    MultiAntennaRequest,
    MultiAntennaSolutionResponse,
    SingleFrequencyRequest,
    SweepResultResponse,
)
from .services.estimation import estimate_from_mesh, estimate_solve_time
from .solver import (
    SolverConfiguration,
    solve_multi_antenna,
    solve_peec_frequency_sweep,
    solve_single_frequency,
)
from .system import CurrentSource, Load, VoltageSource

# Initialize FastAPI application
app = FastAPI(
    title="PEEC Antenna Simulator - Solver Service",
    description="PEEC electromagnetic solver for antenna analysis",
    version=settings.version,
    docs_url=f"{settings.api_prefix}/docs",
    redoc_url=f"{settings.api_prefix}/redoc",
    openapi_url=f"{settings.api_prefix}/openapi.json",
)

# Configure CORS
if os.getenv("USE_FUNCTION_URL_CORS", "").lower() != "true":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=settings.cors_credentials,
        allow_methods=settings.cors_methods,
        allow_headers=settings.cors_headers,
    )

install_error_handlers(app)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return JSONResponse(
        status_code=200,
        content={
            "status": "healthy",
            "service": settings.service_name,
            "version": settings.version,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )


def _ensure_finite(**values) -> None:
    """Reject results that cannot be represented in JSON (NaN/inf).

    Typically the source current is zero (open feed), which makes the input
    impedance infinite. Used to surface as an opaque 500 (B29).
    """
    bad = [name for name, v in values.items() if not np.all(np.isfinite(np.asarray(v)))]
    if bad:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Solution is undefined ({', '.join(bad)} not finite). This usually "
                "means the source current is zero — check the source amplitude and "
                "that the feed is connected."
            ),
        )


def _convert_sources(request):
    """Convert API source models to internal models."""
    voltage_sources = [
        VoltageSource(
            node_start=vs.node_start,
            node_end=vs.node_end,
            value=vs.value,
            R=vs.R,
            L=vs.L,
            C_inv=vs.C_inv,
        )
        for vs in request.voltage_sources
    ]

    current_sources = [
        CurrentSource(node=cs.node, value=cs.value, node_end=cs.node_end)
        for cs in request.current_sources
    ]

    loads = [
        Load(
            node_start=ld.node_start,
            node_end=ld.node_end,
            R=ld.R,
            L=ld.L,
            C_inv=ld.C_inv,
        )
        for ld in request.loads
    ]

    return voltage_sources, current_sources, loads


def _get_solver_config(request_config):
    """Get solver configuration."""
    if request_config is None:
        return SolverConfiguration()

    return SolverConfiguration(
        gauss_order=request_config.gauss_order,
        include_skin_effect=request_config.include_skin_effect,
        resistivity=request_config.resistivity,
        permeability=request_config.permeability,
    )


@app.post(
    f"{settings.api_prefix}/solve/single",
    response_model=FrequencyPointResponse,
    tags=["Solver"],
    summary="Solve at single frequency",
)
async def solve_single_frequency_endpoint(
    request: SingleFrequencyRequest,
    user: UserIdentity = Depends(get_current_user),
    _tokens: TokenCheckResult = Depends(require_simulation_tokens(5)),
):
    """Solve PEEC system at a single frequency."""
    try:
        # Validate inputs
        if len(request.nodes) < 2:
            raise HTTPException(status_code=400, detail="At least 2 nodes required")

        if len(request.edges) < 1:
            raise HTTPException(status_code=400, detail="At least 1 edge required")

        if len(request.radii) != len(request.edges):
            raise HTTPException(
                status_code=400,
                detail=f"Number of radii ({len(request.radii)}) must match edges ({len(request.edges)})",
            )

        if len(request.voltage_sources) == 0 and len(request.current_sources) == 0:
            raise HTTPException(
                status_code=400, detail="At least one voltage or current source required"
            )

        # Convert to numpy arrays
        nodes = np.array(request.nodes)
        radii = np.array(request.radii)

        # Convert sources
        voltage_sources, current_sources, loads = _convert_sources(request)

        # Get configuration
        config = _get_solver_config(request.config)

        # Solve
        start_time = time.time()

        # Call with positional arguments to avoid any keyword argument issues
        result = solve_single_frequency(
            nodes,
            request.edges,
            radii,
            request.frequency,
            voltage_sources,
            current_sources,
            loads,
            config,
        )

        solve_time = time.time() - start_time

        _ensure_finite(
            input_impedance=result.input_impedance,
            reflection_coefficient=result.reflection_coefficient,
            return_loss=result.return_loss,
            input_power=result.input_power,
            branch_currents=result.branch_currents,
        )

        # Build response
        return FrequencyPointResponse(
            frequency=result.frequency,
            omega=result.omega,
            branch_currents=[complex(c) for c in result.branch_currents],
            node_voltages=[complex(v) for v in result.node_voltages],
            appended_voltages=[complex(v) for v in result.appended_voltages],
            input_impedance=complex(result.input_impedance),
            input_current=complex(result.input_current),
            reflection_coefficient=complex(result.reflection_coefficient),
            return_loss=float(result.return_loss),
            input_power=float(result.input_power),
            reflected_power=float(result.reflected_power),
            accepted_power=float(result.accepted_power),
            power_dissipated=float(result.power_dissipated),
            solve_time=solve_time,
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Solver error: {str(e)}")


@app.post(
    f"{settings.api_prefix}/solve/sweep",
    response_model=SweepResultResponse,
    tags=["Solver"],
    summary="Solve frequency sweep",
)
async def solve_frequency_sweep_endpoint(
    request: FrequencySweepRequest,
    user: UserIdentity = Depends(get_current_user),
):
    """Solve PEEC system across multiple frequencies."""
    # Sweep cost scales with number of frequencies (capped at 250)
    # Checked now, charged only after the sweep succeeded (B43).
    token_check = check_simulation_tokens(user, calculate_sweep_cost(len(request.frequencies)))
    try:
        # Validate inputs
        if len(request.nodes) < 2:
            raise HTTPException(status_code=400, detail="At least 2 nodes required")

        if len(request.edges) < 1:
            raise HTTPException(status_code=400, detail="At least 1 edge required")

        if len(request.radii) != len(request.edges):
            raise HTTPException(
                status_code=400,
                detail=f"Number of radii ({len(request.radii)}) must match edges ({len(request.edges)})",
            )

        if len(request.voltage_sources) == 0 and len(request.current_sources) == 0:
            raise HTTPException(
                status_code=400, detail="At least one voltage or current source required"
            )

        if len(request.frequencies) > settings.max_frequency_points:
            raise HTTPException(
                status_code=400,
                detail=f"Too many frequency points (max {settings.max_frequency_points})",
            )

        # Convert to numpy arrays
        nodes = np.array(request.nodes)
        radii = np.array(request.radii)
        frequencies = np.array(request.frequencies)

        # Convert sources
        voltage_sources, current_sources, loads = _convert_sources(request)

        # Get configuration
        config = _get_solver_config(request.config)

        # Solve
        start_time = time.time()

        # Call with positional arguments
        result = solve_peec_frequency_sweep(
            nodes,
            request.edges,
            radii,
            frequencies,
            voltage_sources,
            current_sources,
            loads,
            config,
            request.reference_impedance,
        )

        total_time = time.time() - start_time

        # Build frequency solutions
        freq_solutions = []
        for sol in result.frequency_solutions:
            freq_solutions.append(
                FrequencyPointResponse(
                    frequency=sol.frequency,
                    omega=sol.omega,
                    branch_currents=[complex(c) for c in sol.branch_currents],
                    node_voltages=[complex(v) for v in sol.node_voltages],
                    appended_voltages=[complex(v) for v in sol.appended_voltages],
                    input_impedance=complex(sol.input_impedance),
                    input_current=complex(sol.input_current),
                    reflection_coefficient=complex(sol.reflection_coefficient),
                    return_loss=float(sol.return_loss),
                    input_power=float(sol.input_power),
                    reflected_power=float(sol.reflected_power),
                    accepted_power=float(sol.accepted_power),
                    power_dissipated=float(sol.power_dissipated),
                    solve_time=sol.solve_time,
                )
            )

        _ensure_finite(
            impedance=result.impedance_magnitude,
            impedance_phase=result.impedance_phase,
            return_loss=result.return_loss,
            vswr=result.vswr,
            mismatch_loss=result.mismatch_loss,
        )

        # Build response
        response = SweepResultResponse(
            frequencies=request.frequencies,
            reference_impedance=request.reference_impedance,
            frequency_solutions=freq_solutions,
            impedance_magnitude=[float(z) for z in result.impedance_magnitude],
            impedance_phase=[float(p) for p in result.impedance_phase],
            return_loss=[float(rl) for rl in result.return_loss],
            vswr=[float(v) for v in result.vswr],
            mismatch_loss=[float(ml) for ml in result.mismatch_loss],
            n_nodes=result.n_nodes,
            n_edges=result.n_edges,
            n_branches=result.n_branches,
            total_solve_time=total_time,
        )
        charge_simulation_tokens(user, token_check, endpoint="solve/sweep")
        return response

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Solver error: {str(e)}")


@app.post(
    f"{settings.api_prefix}/solve/multi",
    response_model=MultiAntennaSolutionResponse,
    tags=["Solver"],
    summary="Solve multiple antennas at single frequency",
)
async def solve_multi_antenna_endpoint(
    request: MultiAntennaRequest,
    user: UserIdentity = Depends(get_current_user),
    _tokens: TokenCheckResult = Depends(require_simulation_tokens(5)),
):
    """Solve multiple antennas at a single frequency."""
    return solve_multi_request(request)


def solve_multi_request(request: MultiAntennaRequest) -> MultiAntennaSolutionResponse:
    """Validate and solve a multi-antenna request (sync endpoint and async jobs)."""
    try:
        # Validate inputs
        if len(request.antennas) < 1:
            raise HTTPException(status_code=400, detail="At least 1 antenna required")

        # Validate each antenna's geometry
        for i, antenna in enumerate(request.antennas):
            if len(antenna.nodes) < 2:
                raise HTTPException(
                    status_code=400,
                    detail=f"Antenna {antenna.antenna_id}: At least 2 nodes required",
                )

            if len(antenna.edges) < 1:
                raise HTTPException(
                    status_code=400,
                    detail=f"Antenna {antenna.antenna_id}: At least 1 edge required",
                )

            if len(antenna.radii) != len(antenna.edges):
                raise HTTPException(
                    status_code=400,
                    detail=f"Antenna {antenna.antenna_id}: Number of radii must match edges",
                )

        # At least one antenna in the system must have a source
        # (parasitic elements like Yagi reflectors/directors have no source)
        has_any_source = any(
            len(a.voltage_sources) > 0 or len(a.current_sources) > 0 for a in request.antennas
        )
        if not has_any_source:
            raise HTTPException(
                status_code=400,
                detail="At least one antenna must have a voltage or current source",
            )

        # Get solver configuration
        config = _get_solver_config(request.config)

        # Solve multi-antenna system
        start_time = time.time()
        result = solve_multi_antenna(
            antennas=request.antennas, frequency=request.frequency, config=config
        )
        solve_time = time.time() - start_time

        # Update solve time
        result["solve_time"] = solve_time

        # Optional impedance: undefined (zero feed current) -> null, not a JSON 500 (B29)
        for sol in result.get("antenna_solutions", []):
            z = sol.get("input_impedance") if isinstance(sol, dict) else None
            if z is not None and not np.isfinite(z):
                sol["input_impedance"] = None
        _ensure_finite(
            branch_currents=[
                c
                for sol in result.get("antenna_solutions", [])
                for c in sol.get("branch_currents", [])
            ]
        )

        # Return response matching schema
        return MultiAntennaSolutionResponse(**result)

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Multi-antenna solver error: {str(e)}")


# ── Asynchronous jobs (ASYNC_JOBS=lambda, see backend/solver/jobs.py) ─────────


@app.post(
    f"{settings.api_prefix}/jobs/solve",
    status_code=202,
    tags=["Jobs"],
    summary="Queue a multi-antenna solve (for solves longer than the 60 s API limit)",
)
async def submit_solve_job(
    request: MultiAntennaRequest,
    user: UserIdentity = Depends(get_current_user),
    tokens: TokenCheckResult = Depends(require_simulation_tokens(5)),
):
    if not jobs_enabled():
        raise HTTPException(status_code=404, detail="Asynchronous jobs are not enabled")
    job_id = await JobStore().submit(
        user.id,
        json.loads(request.model_dump_json()),
        tokens_charged=tokens.cost if tokens.should_deduct else 0,
    )
    return {"job_id": job_id, "status": "queued"}


@app.get(f"{settings.api_prefix}/jobs/{{job_id}}", tags=["Jobs"], summary="Job status and result")
async def get_solve_job(job_id: str, user: UserIdentity = Depends(get_current_user)):
    if not jobs_enabled():
        raise HTTPException(status_code=404, detail="Asynchronous jobs are not enabled")
    store = JobStore()
    job = store.get(user.id, job_id)  # keyed by the caller: other users' jobs are 404
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    response = {"job_id": job_id, "status": job["Status"]}
    if job["Status"] == "done":
        response["result"] = await store.result(job_id)
    elif job["Status"] == "failed":
        response["error"] = job.get("Error", "Solve failed")
    return response


@app.get(
    f"{settings.api_prefix}/info/materials",
    tags=["Info"],
    summary="Get material properties",
)
async def get_materials():
    """
    Get common conductor material properties.

    Returns resistivity and relative permeability for common materials.
    """
    return {
        "materials": {
            "copper": {
                "resistivity": 1.68e-8,
                "permeability": 1.0,
                "description": "Pure copper (default)",
            },
            "aluminum": {"resistivity": 2.82e-8, "permeability": 1.0, "description": "Aluminum"},
            "silver": {
                "resistivity": 1.59e-8,
                "permeability": 1.0,
                "description": "Silver (best conductor)",
            },
            "gold": {"resistivity": 2.44e-8, "permeability": 1.0, "description": "Gold"},
            "brass": {
                "resistivity": 7.0e-8,
                "permeability": 1.0,
                "description": "Brass (Cu-Zn alloy)",
            },
        }
    }


@app.post(
    f"{settings.api_prefix}/estimate",
    tags=["Solver"],
    summary="Estimate solve time",
)
async def estimate_complexity(
    request: dict,
    user: UserIdentity = Depends(get_current_user),
):
    """Estimate solve time based on problem complexity."""
    try:
        # Check if this is a full mesh structure or simple parameters
        if "edges" in request:
            # Full mesh data
            result = estimate_from_mesh(request)
        else:
            # Simple parameters
            n_edges = request.get("n_edges", 0)
            n_frequencies = request.get("n_frequencies", 1)
            has_lumped_elements = request.get("has_lumped_elements", False)
            solver_type = request.get("solver_type", "direct")

            if n_edges == 0:
                raise ValueError("n_edges must be provided and > 0")

            result = estimate_solve_time(
                n_edges=n_edges,
                n_frequencies=n_frequencies,
                has_lumped_elements=has_lumped_elements,
                solver_type=solver_type,
            )

        return JSONResponse(status_code=200, content=result)

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Estimation error: {str(e)}")
        raise HTTPException(status_code=500, detail="Estimation failed")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8002)
