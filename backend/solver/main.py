"""FastAPI application for the Solver service."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime
import numpy as np
import time
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

from .config import settings
from .schemas import (
    SingleFrequencyRequest,
    FrequencySweepRequest,
    FrequencyPointResponse,
    SweepResultResponse,
    ErrorResponse,
    MultiAntennaRequest,
    MultiAntennaSolutionResponse
)
from .solver import solve_single_frequency, solve_peec_frequency_sweep, solve_multi_antenna, SolverConfiguration
from .system import VoltageSource, CurrentSource, Load


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
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=settings.cors_credentials,
    allow_methods=settings.cors_methods,
    allow_headers=settings.cors_headers,
)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return JSONResponse(
        status_code=200,
        content={
            "status": "healthy",
            "service": settings.service_name,
            "version": settings.version,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )


@app.get(f"{settings.api_prefix}/status")
async def get_status():
    """Get service status and configuration."""
    return {
        "service": settings.service_name,
        "version": settings.version,
        "debug": settings.debug,
        "limits": {
            "max_frequency_points": settings.max_frequency_points,
            "max_edges": settings.max_edges,
            "max_branches": settings.max_branches,
            "timeout_seconds": settings.timeout_seconds,
        },
        "endpoints": {
            "health": "/health",
            "docs": f"{settings.api_prefix}/docs",
            "openapi": f"{settings.api_prefix}/openapi.json",
        },
    }


def _convert_sources(request):
    """Convert API source models to internal models."""
    voltage_sources = [
        VoltageSource(
            node_start=vs.node_start,
            node_end=vs.node_end,
            value=vs.value,
            # Backward compatibility: if impedance provided, use as R
            R=vs.R if vs.impedance is None else vs.impedance,
            L=vs.L,
            C_inv=vs.C_inv
        )
        for vs in request.voltage_sources
    ]
    
    current_sources = [
        CurrentSource(node=cs.node, value=cs.value)
        for cs in request.current_sources
    ]
    
    loads = [
        Load(
            node_start=ld.node_start,
            node_end=ld.node_end,
            # Backward compatibility: if impedance provided, use as R
            R=ld.R if ld.impedance is None else ld.impedance.real,
            L=ld.L,
            C_inv=ld.C_inv
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
        permeability=request_config.permeability
    )


@app.post(
    f"{settings.api_prefix}/solve/single",
    response_model=FrequencyPointResponse,
    tags=["Solver"],
    summary="Solve at single frequency",
)
async def solve_single_frequency_endpoint(request: SingleFrequencyRequest):
    """
    Solve PEEC system at a single frequency.
    
    Computes current distribution, input impedance, and power dissipation
    for the given antenna geometry and excitation.
    
    Args:
        request: Single frequency solve request
    
    Returns:
        Solution including currents, voltages, and input impedance
    
    Raises:
        HTTPException: If validation or solving fails
    """
    try:
        # Validate inputs
        if len(request.nodes) < 2:
            raise HTTPException(
                status_code=400,
                detail="At least 2 nodes required"
            )
        
        if len(request.edges) < 1:
            raise HTTPException(
                status_code=400,
                detail="At least 1 edge required"
            )
        
        if len(request.radii) != len(request.edges):
            raise HTTPException(
                status_code=400,
                detail=f"Number of radii ({len(request.radii)}) must match edges ({len(request.edges)})"
            )
        
        if len(request.voltage_sources) == 0 and len(request.current_sources) == 0:
            raise HTTPException(
                status_code=400,
                detail="At least one voltage or current source required"
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
            config
        )
        
        solve_time = time.time() - start_time
        
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
            solve_time=solve_time
        )
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Solver error: {str(e)}"
        )


@app.post(
    f"{settings.api_prefix}/solve/sweep",
    response_model=SweepResultResponse,
    tags=["Solver"],
    summary="Solve frequency sweep",
)
async def solve_frequency_sweep_endpoint(request: FrequencySweepRequest):
    """
    Solve PEEC system across multiple frequencies.
    
    Performs frequency sweep analysis, computing impedance, VSWR,
    and other parameters across the specified frequency range.
    
    Args:
        request: Frequency sweep request
    
    Returns:
        Solutions at all frequencies with derived parameters
    
    Raises:
        HTTPException: If validation or solving fails
    """
    try:
        # Validate inputs
        if len(request.nodes) < 2:
            raise HTTPException(
                status_code=400,
                detail="At least 2 nodes required"
            )
        
        if len(request.edges) < 1:
            raise HTTPException(
                status_code=400,
                detail="At least 1 edge required"
            )
        
        if len(request.radii) != len(request.edges):
            raise HTTPException(
                status_code=400,
                detail=f"Number of radii ({len(request.radii)}) must match edges ({len(request.edges)})"
            )
        
        if len(request.voltage_sources) == 0 and len(request.current_sources) == 0:
            raise HTTPException(
                status_code=400,
                detail="At least one voltage or current source required"
            )
        
        if len(request.frequencies) > settings.max_frequency_points:
            raise HTTPException(
                status_code=400,
                detail=f"Too many frequency points (max {settings.max_frequency_points})"
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
            request.reference_impedance
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
                    solve_time=sol.solve_time
                )
            )
        
        # Build response
        return SweepResultResponse(
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
            total_solve_time=total_time
        )
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Solver error: {str(e)}"
        )


@app.post(
    f"{settings.api_prefix}/solve/multi",
    response_model=MultiAntennaSolutionResponse,
    tags=["Solver"],
    summary="Solve multiple antennas at single frequency",
)
async def solve_multi_antenna_endpoint(request: MultiAntennaRequest):
    """
    Solve multiple antennas at a single frequency.
    
    Combines antennas into unified system, solves together,
    then distributes solution back to individual antennas.
    
    Args:
        request: Multi-antenna request with list of antennas
    
    Returns:
        Solutions for each antenna with currents, voltages, and impedances
    
    Raises:
        HTTPException: If validation or solving fails
    """
    try:
        # Validate inputs
        if len(request.antennas) < 1:
            raise HTTPException(
                status_code=400,
                detail="At least 1 antenna required"
            )
        
        # Validate each antenna
        for i, antenna in enumerate(request.antennas):
            if len(antenna.nodes) < 2:
                raise HTTPException(
                    status_code=400,
                    detail=f"Antenna {antenna.antenna_id}: At least 2 nodes required"
                )
            
            if len(antenna.edges) < 1:
                raise HTTPException(
                    status_code=400,
                    detail=f"Antenna {antenna.antenna_id}: At least 1 edge required"
                )
            
            if len(antenna.radii) != len(antenna.edges):
                raise HTTPException(
                    status_code=400,
                    detail=f"Antenna {antenna.antenna_id}: Number of radii must match edges"
                )
            
            # At least one excitation required per antenna
            if len(antenna.voltage_sources) == 0 and len(antenna.current_sources) == 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Antenna {antenna.antenna_id}: At least one source required"
                )
        
        # Get solver configuration
        config = _get_solver_config(request.config)
        
        # Solve multi-antenna system
        start_time = time.time()
        result = solve_multi_antenna(
            antennas=request.antennas,
            frequency=request.frequency,
            config=config
        )
        solve_time = time.time() - start_time
        
        # Update solve time
        result['solve_time'] = solve_time
        
        # Return response matching schema
        return MultiAntennaSolutionResponse(**result)
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Multi-antenna solver error: {str(e)}"
        )


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
                "description": "Pure copper (default)"
            },
            "aluminum": {
                "resistivity": 2.82e-8,
                "permeability": 1.0,
                "description": "Aluminum"
            },
            "silver": {
                "resistivity": 1.59e-8,
                "permeability": 1.0,
                "description": "Silver (best conductor)"
            },
            "gold": {
                "resistivity": 2.44e-8,
                "permeability": 1.0,
                "description": "Gold"
            },
            "brass": {
                "resistivity": 7.0e-8,
                "permeability": 1.0,
                "description": "Brass (Cu-Zn alloy)"
            },
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
