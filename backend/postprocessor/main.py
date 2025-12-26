"""FastAPI application for the Postprocessor service."""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime
import numpy as np

from .config import settings
from .models import (
    FieldRequest,
    FarFieldRequest,
    RadiationPatternResponse,
    AntennaParametersRequest
)
from .field import compute_far_field, compute_directivity_from_pattern

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
    return {
        "status": "healthy",
        "service": "postprocessor",
        "version": settings.version,
        "timestamp": datetime.utcnow().isoformat()
    }


@app.get(f"{settings.api_prefix}/status")
async def get_status():
    """Get service status and configuration."""
    return {
        "service": settings.service_name,
        "version": settings.version,
        "debug": settings.debug,
        "api_prefix": settings.api_prefix,
        "field_defaults": {
            "theta_points": settings.default_theta_points,
            "phi_points": settings.default_phi_points,
            "far_field_factor": settings.far_field_distance_factor
        },
        "timestamp": datetime.utcnow().isoformat()
    }


@app.post(
    f"{settings.api_prefix}/fields/near",
    response_model=dict,
    summary="Compute near-field at observation points"
)
async def compute_near_field(request: FieldRequest):
    """
    Compute electric and magnetic fields at specified observation points.
    
    This endpoint will compute:
    - Electric field (E-field) vectors
    - Magnetic field (H-field) vectors
    - Field magnitudes and directions
    """
    try:
        # TODO: Implement actual near-field computation
        # For now, return a placeholder response
        return {
            "status": "success",
            "message": "Near-field computation endpoint - implementation pending",
            "frequencies": request.frequencies,
            "num_observation_points": len(request.observation_points),
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Near-field computation failed: {str(e)}")


@app.post(
    f"{settings.api_prefix}/fields/far",
    response_model=RadiationPatternResponse,
    summary="Compute far-field radiation pattern"
)
async def compute_far_field_endpoint(request: FarFieldRequest):
    """
    Compute far-field radiation pattern over angular grid.
    
    This endpoint computes:
    - 3D radiation pattern
    - Directivity and gain
    - Beamwidths
    - Maximum radiation direction
    """
    try:
        print(f"Received far-field request")
        print(f"  Frequencies: {request.frequencies}")
        print(f"  Branch currents shape: {len(request.branch_currents)}x{len(request.branch_currents[0]) if request.branch_currents else 0}")
        print(f"  Nodes: {len(request.nodes)}")
        print(f"  Edges: {len(request.edges)}")
        
        # Convert inputs to numpy arrays
        frequencies = np.array(request.frequencies)
        nodes = np.array(request.nodes)
        edges = np.array(request.edges)
        
        print(f"  Converted to numpy arrays")
        
        # Handle branch_currents which can be complex numbers in different formats
        branch_currents_list = []
        for freq_currents in request.branch_currents:
            currents = []
            for c in freq_currents:
                if isinstance(c, (list, tuple)) and len(c) == 2:
                    currents.append(complex(c[0], c[1]))
                elif isinstance(c, str):
                    # Python's complex() expects format like "1+2j" (no spaces)
                    c_clean = c.replace(' ', '').replace('i', 'j')
                    currents.append(complex(c_clean))
                elif isinstance(c, dict) and 'real' in c and 'imag' in c:
                    currents.append(complex(c['real'], c['imag']))
                else:
                    currents.append(complex(c))
            branch_currents_list.append(currents)
        branch_currents = np.array(branch_currents_list, dtype=complex)
        
        print(f"  Parsed branch currents: {branch_currents.shape}")
        print(f"  Branch currents: {branch_currents}")
        
        # Ensure branch_currents is 2D
        if branch_currents.ndim == 1:
            branch_currents = branch_currents.reshape(1, -1)
        
        # Create angular grid
        theta_angles = np.linspace(0, np.pi, request.theta_points)
        phi_angles = np.linspace(0, 2*np.pi, request.phi_points)
        
        # Compute far-field pattern
        E_field, H_field = compute_far_field(
            frequencies=frequencies,
            branch_currents=branch_currents,
            nodes=nodes,
            edges=edges,
            theta_angles=theta_angles,
            phi_angles=phi_angles
        )
        
        # Extract first frequency results
        E_theta = E_field[0, :, :, 0]
        E_phi = E_field[0, :, :, 1]
        
        # Compute directivity
        directivity_linear, directivity_dBi, U_pattern, max_indices = compute_directivity_from_pattern(
            E_theta, E_phi, theta_angles, phi_angles
        )
        
        # Compute magnitudes
        E_theta_mag = np.abs(E_theta).flatten().tolist()
        E_phi_mag = np.abs(E_phi).flatten().tolist()
        E_total_mag = np.sqrt(np.abs(E_theta)**2 + np.abs(E_phi)**2).flatten().tolist()
        
        # Normalized pattern in dB
        U_max = np.max(U_pattern)
        pattern_db_array = 10 * np.log10(U_pattern / U_max)
        # Replace -inf and NaN with -100 dB (JSON cannot serialize inf/nan)
        pattern_db_array = np.nan_to_num(pattern_db_array, nan=-100.0, posinf=0.0, neginf=-100.0)
        pattern_db = pattern_db_array.flatten().tolist()
        
        # Find max direction
        max_theta_idx, max_phi_idx = max_indices
        max_theta_deg = np.rad2deg(theta_angles[max_theta_idx])
        max_phi_deg = np.rad2deg(phi_angles[max_phi_idx])
        
        return RadiationPatternResponse(
            frequency=float(frequencies[0]),
            theta_angles=theta_angles.tolist(),
            phi_angles=phi_angles.tolist(),
            E_theta_mag=E_theta_mag,
            E_phi_mag=E_phi_mag,
            E_total_mag=E_total_mag,
            pattern_db=pattern_db,
            directivity=float(directivity_dBi),
            gain=float(directivity_dBi),  # Assume 100% efficiency for now
            efficiency=1.0,
            beamwidth_theta=None,  # TODO: Compute beamwidths
            beamwidth_phi=None,
            max_direction=[float(max_theta_deg), float(max_phi_deg)]
        )
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        # Write to file for debugging
        with open('postprocessor_error.log', 'w') as f:
            f.write(f"Error: {str(e)}\n\n")
            f.write(error_details)
        print(f"Far-field computation error: {error_details}")
        raise HTTPException(
            status_code=500, 
            detail=f"Far-field computation failed: {str(e)}"
        )


@app.post(
    f"{settings.api_prefix}/parameters",
    response_model=dict,
    summary="Extract antenna parameters"
)
async def extract_antenna_parameters(request: AntennaParametersRequest):
    """
    Extract antenna parameters from simulation results.
    
    Computes:
    - VSWR (Voltage Standing Wave Ratio)
    - Return loss
    - Reflection coefficient
    - Bandwidth estimates
    - Radiation efficiency
    """
    try:
        # TODO: Implement actual parameter extraction
        # For now, return a placeholder response
        return {
            "status": "success",
            "message": "Antenna parameter extraction endpoint - implementation pending",
            "frequencies": request.frequencies,
            "num_frequencies": len(request.frequencies),
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Parameter extraction failed: {str(e)}")


@app.get(f"{settings.api_prefix}/info")
async def get_info():
    """Get information about available postprocessing capabilities."""
    return {
        "service": "postprocessor",
        "version": settings.version,
        "capabilities": {
            "near_field": {
                "description": "Compute E and H fields at observation points",
                "endpoint": f"{settings.api_prefix}/fields/near"
            },
            "far_field": {
                "description": "Compute radiation patterns and directivity",
                "endpoint": f"{settings.api_prefix}/fields/far"
            },
            "antenna_parameters": {
                "description": "Extract VSWR, return loss, efficiency",
                "endpoint": f"{settings.api_prefix}/parameters"
            }
        },
        "default_settings": {
            "theta_resolution": f"{settings.default_theta_points} points (0° to 180°)",
            "phi_resolution": f"{settings.default_phi_points} points (0° to 360°)",
            "far_field_criterion": f"{settings.far_field_distance_factor}λ"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8003)
