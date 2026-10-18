"""FastAPI application for the Postprocessor service."""

# noqa: trigger CI build
import os
import time
from datetime import datetime, timezone

import numpy as np
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from backend.common.auth.dependencies import get_current_user
from backend.common.auth.identity import UserIdentity
from backend.common.auth.token_dependency import TokenCheckResult, require_simulation_tokens
from backend.common.utils.error_handler import install_error_handlers
from backend.common.utils.logging_config import configure_logging

from .compute import TooManyPointsError, estimate_near_field, far_field_result, near_field_result
from .config import settings
from .models import (
    FarFieldRequest,
    FieldRequest,
    PortQuantitiesRequest,
    PortQuantitiesResponse,
    PortResult,
    RadiationPatternResponse,
)

logger = configure_logging("postprocessor", level=settings.log_level)

# Initialize FastAPI application
app = FastAPI(
    title="PEEC Antenna Simulator - Postprocessor Service",
    description="Field computation and antenna parameter extraction service",
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

# Compress responses to stay within Lambda 6 MB payload limit.
# GZip middleware is added after CORS so it wraps outermost —
# the body is compressed while CORS headers remain unaffected.
app.add_middleware(GZipMiddleware, minimum_size=1000)

install_error_handlers(app)

logger.info(
    "Postprocessor service v%s starting (debug=%s, log_level=%s, log_timing=%s)",
    settings.version,
    settings.debug,
    settings.log_level,
    settings.log_timing,
)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "postprocessor",
        "version": settings.version,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post(
    f"{settings.api_prefix}/fields/near",
    response_model=dict,
    summary="Compute near-field at observation points",
)
async def compute_near_field(
    request: FieldRequest,
    user: UserIdentity = Depends(get_current_user),
    _tokens: TokenCheckResult = Depends(require_simulation_tokens(3)),
):
    """Compute electric and magnetic fields at specified observation points."""
    t_start = time.perf_counter()
    try:
        return near_field_result(request)
    except TooManyPointsError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        total_duration = time.perf_counter() - t_start
        logger.exception("Near-field computation error after %.2f s: %s", total_duration, str(e))
        raise HTTPException(status_code=500, detail=f"Near-field computation failed: {str(e)}")


@app.post(
    f"{settings.api_prefix}/fields/far",
    response_model=RadiationPatternResponse,
    summary="Compute far-field radiation pattern",
)
async def compute_far_field_endpoint(
    request: FarFieldRequest,
    user: UserIdentity = Depends(get_current_user),
    _tokens: TokenCheckResult = Depends(require_simulation_tokens(3)),
):
    """Compute far-field radiation pattern over angular grid."""
    try:
        return far_field_result(request)
    except ValueError as e:
        # Physically undefined input (e.g. zero currents) -> client error, not a crash
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.exception("Far-field computation error")
        raise HTTPException(status_code=500, detail=f"Far-field computation failed: {str(e)}")


@app.get(f"{settings.api_prefix}/debug/config")
async def debug_config(user: UserIdentity = Depends(get_current_user)):
    """Return current configuration for debugging (no secrets)."""
    import sys

    return {
        "service": "postprocessor",
        "version": settings.version,
        "python_version": sys.version,
        "debug": settings.debug,
        "log_level": settings.log_level,
        "log_timing": settings.log_timing,
        "max_observation_points": settings.max_observation_points,
        "default_theta_points": settings.default_theta_points,
        "default_phi_points": settings.default_phi_points,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post(f"{settings.api_prefix}/debug/estimate")
async def estimate_computation(
    request: FieldRequest,
    user: UserIdentity = Depends(get_current_user),
):
    """Estimate computation time without actually computing.

    Useful for pre-flight checks before committing to a long computation.
    """
    n_points = len(request.observation_points)
    n_edges = len(request.edges)
    n_freq = len(request.frequencies)
    estimate = estimate_near_field(n_points, n_edges, n_freq)
    lambda_timeout = 300  # current Lambda config
    return {
        **estimate,
        "lambda_timeout_seconds": lambda_timeout,
        "will_likely_timeout": estimate["estimated_seconds"] > lambda_timeout * 0.8,
        "recommendation": (
            f"Reduce observation points from {n_points} to "
            f"~{max(1, int(n_points * lambda_timeout * 0.7 / max(estimate['estimated_seconds'], 1)))} "
            "for safe execution within Lambda timeout."
            if estimate["estimated_seconds"] > lambda_timeout * 0.8
            else "Computation should complete within Lambda timeout."
        ),
    }


@app.get(f"{settings.api_prefix}/info")
async def get_info():
    """Get information about available postprocessing capabilities."""
    return {
        "service": "postprocessor",
        "version": settings.version,
        "capabilities": {
            "near_field": {
                "description": "Compute E and H fields at observation points",
                "endpoint": f"{settings.api_prefix}/fields/near",
            },
            "far_field": {
                "description": "Compute radiation patterns and directivity",
                "endpoint": f"{settings.api_prefix}/fields/far",
            },
            "vtu_export": {
                "description": "Export field data to VTU format for ParaView",
                "endpoint": f"{settings.api_prefix}/export/vtu",
            },
        },
        "default_settings": {
            "theta_resolution": f"{settings.default_theta_points} points (0 to 180 deg)",
            "phi_resolution": f"{settings.default_phi_points} points (0 to 360 deg)",
            "far_field_criterion": f"{settings.far_field_distance_factor} lambda",
        },
    }


# ============================================================================
# Port Quantities
# ============================================================================


def _parse_complex_list(raw: list) -> list[complex]:
    """Parse a flat list of complex values from various serialisation formats."""
    result: list[complex] = []
    for c in raw:
        if isinstance(c, (list, tuple)) and len(c) == 2:
            result.append(complex(c[0], c[1]))
        elif isinstance(c, dict):
            result.append(complex(c.get("real", 0), c.get("imag", 0)))
        elif isinstance(c, str):
            result.append(complex(c.replace(" ", "")))
        else:
            result.append(complex(c))
    return result


def _compute_port_quantities(
    port_id: str,
    node_start: int,
    node_end: int,
    z0: float,
    node_voltages: list[complex],
    edges: list[list[int]],
    branch_currents: list[complex],
    appended_voltages: list[complex],
) -> dict:
    """Compute port quantities for a single port definition."""

    # Get port voltage: V = V(node_start) - V(node_end)
    # Node indices are 1-based; voltages array is 0-indexed
    # node_end=0 means ground → V=0
    if node_start > 0:
        v_start = node_voltages[node_start - 1] if node_start <= len(node_voltages) else 0j
    elif node_start < 0:
        # Appended node (negative index → appended_voltages)
        app_idx = abs(node_start) - 1
        v_start = appended_voltages[app_idx] if app_idx < len(appended_voltages) else 0j
    else:
        v_start = 0j  # ground

    if node_end > 0:
        v_end = node_voltages[node_end - 1] if node_end <= len(node_voltages) else 0j
    elif node_end < 0:
        app_idx = abs(node_end) - 1
        v_end = appended_voltages[app_idx] if app_idx < len(appended_voltages) else 0j
    else:
        v_end = 0j  # ground

    v_port = v_start - v_end

    # Get port current: find edge connecting node_start to node_end
    # and use the corresponding branch current
    i_port = 0j
    for edge_idx, edge in enumerate(edges):
        if edge_idx >= len(branch_currents):
            break
        if edge[0] == node_start and edge[1] == node_end:
            i_port = branch_currents[edge_idx]
            break
        elif edge[0] == node_end and edge[1] == node_start:
            i_port = -branch_currents[edge_idx]
            break

    # If no direct edge found, use V/I from node perspective
    # Sum currents into node_start from all connected edges
    if i_port == 0j and v_port != 0j:
        for edge_idx, edge in enumerate(edges):
            if edge_idx >= len(branch_currents):
                break
            if edge[1] == node_start:
                i_port += branch_currents[edge_idx]
            elif edge[0] == node_start:
                i_port -= branch_currents[edge_idx]

    # Compute impedance
    if abs(i_port) > 1e-30:
        z_in = v_port / i_port
    else:
        z_in = complex(1e12, 0)  # Open circuit

    # Reflection coefficient Γ = (Z_in - Z0) / (Z_in + Z0)
    gamma = (z_in - z0) / (z_in + z0) if abs(z_in + z0) > 1e-30 else complex(1, 0)

    # S11 [dB] = 20·log10|Γ| (negative); the solver's return_loss is its negative
    gamma_mag = abs(gamma)
    s11_db = 20 * np.log10(gamma_mag) if gamma_mag > 1e-30 else -200.0

    # VSWR
    if gamma_mag < 1.0 - 1e-10:
        vswr = (1 + gamma_mag) / (1 - gamma_mag)
    else:
        vswr = 1e6  # Effectively infinite

    # Input power
    power_in = 0.5 * (v_port * i_port.conjugate()).real

    return {
        "port_id": port_id,
        "z_in": z_in,
        "gamma": gamma,
        "s11_db": float(s11_db),
        "vswr": float(vswr),
        "voltage": v_port,
        "current": i_port,
        "power_in": float(power_in),
    }


@app.post(
    f"{settings.api_prefix}/port-quantities",
    response_model=PortQuantitiesResponse,
    tags=["Port Analysis"],
    summary="Compute port quantities (Z, Γ, S11, VSWR, V, I, P)",
)
async def compute_port_quantities(
    request: PortQuantitiesRequest,
    user: UserIdentity = Depends(get_current_user),
    _tokens: TokenCheckResult = Depends(require_simulation_tokens(1)),
):
    """Compute input impedance, reflection coefficient, VSWR, and other quantities
    for each defined port using solver results."""
    try:
        node_voltages = _parse_complex_list(request.node_voltages)
        branch_currents = _parse_complex_list(request.branch_currents)
        appended_voltages = _parse_complex_list(request.appended_voltages)

        port_results = []
        for port in request.ports:
            result = _compute_port_quantities(
                port_id=port.port_id,
                node_start=port.node_start,
                node_end=port.node_end,
                z0=port.z0,
                node_voltages=node_voltages,
                edges=request.edges,
                branch_currents=branch_currents,
                appended_voltages=appended_voltages,
            )
            port_results.append(PortResult(**result))

        return PortQuantitiesResponse(
            antenna_id=request.antenna_id,
            frequency=request.frequency,
            port_results=port_results,
        )

    except IndexError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Node index out of range: {e}",
        )
    except Exception as e:
        logger.exception("Port quantities computation failed")
        raise HTTPException(
            status_code=500,
            detail=f"Port quantities error: {e}",
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8003)
