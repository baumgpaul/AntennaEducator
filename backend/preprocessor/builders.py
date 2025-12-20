"""Antenna builders for creating high-level antenna geometries."""

from typing import Optional, Tuple, List
import numpy as np
from uuid import uuid4

from backend.common.models.geometry import AntennaElement, Mesh, Source


def create_dipole(
    length: float,
    center_position: Tuple[float, float, float] = (0.0, 0.0, 0.0),
    orientation: Tuple[float, float, float] = (0.0, 0.0, 1.0),
    wire_radius: float = 0.001,
    gap: float = 0.01,
    segments: int = 21,
    source: Optional[dict] = None,
    name: Optional[str] = None,
) -> AntennaElement:
    """
    Create a dipole antenna element.
    
    Args:
        length: Total length of the dipole in meters
        center_position: Center point [x, y, z] in meters
        orientation: Direction vector [dx, dy, dz] (will be normalized)
        wire_radius: Wire radius in meters
        gap: Gap between dipole halves in meters (creates two separate poles)
        segments: Number of segments per dipole half (total will be 2*segments if gap > 0)
        source: Optional source configuration dict with keys:
                - type: "voltage" or "current"
                - amplitude: complex number (real or dict with real/imag)
                - position: "center" (default)
        name: Optional name for the element
    
    Returns:
        AntennaElement with dipole parameters
    """
    # Validate inputs
    if length <= 0:
        raise ValueError("Length must be positive")
    if wire_radius <= 0:
        raise ValueError("Wire radius must be positive")
    if gap < 0:
        raise ValueError("Gap must be non-negative")
    if gap >= length:
        raise ValueError("Gap must be less than total length")
    if segments < 1:
        raise ValueError("Number of segments must be at least 1")
    
    # Normalize orientation vector
    orientation_array = np.array(orientation)
    orientation_norm = np.linalg.norm(orientation_array)
    if orientation_norm == 0:
        raise ValueError("Orientation vector cannot be zero")
    orientation_unit = (orientation_array / orientation_norm).tolist()
    
    # Create source object if provided
    source_obj = None
    if source:
        # Handle complex amplitude from dict or direct value
        amplitude = source.get("amplitude", 1.0)
        if isinstance(amplitude, dict):
            amplitude = complex(amplitude.get("real", 0), amplitude.get("imag", 0))
        
        source_obj = Source(
            type=source.get("type", "voltage"),
            amplitude=amplitude,
            segment_id=None,  # Will be set during mesh generation
        )
    
    # Create element with parameters
    element = AntennaElement(
        id=uuid4(),
        name=name or f"Dipole_{length*1000:.1f}mm_gap{gap*1000:.1f}mm",
        type="dipole",
        parameters={
            "length": length,
            "center_position": list(center_position),
            "orientation": orientation_unit,
            "wire_radius": wire_radius,
            "gap": gap,
            "segments": segments,
        },
        source=source_obj,
    )
    
    return element


def dipole_to_mesh(element: AntennaElement) -> Mesh:
    """
    Convert a dipole antenna element to a computational mesh.
    Creates two separate poles if gap > 0, matching MATLAB implementation.
    Upper half: from gap/2 to (length-gap)/2
    Lower half: from -gap/2 to -(length-gap)/2
    
    Args:
        element: AntennaElement with type="dipole"
    
    Returns:
        Mesh object with nodes, edges, and radii
    """
    if element.type != "dipole":
        raise ValueError(f"Expected dipole element, got {element.type}")
    
    params = element.parameters
    length = params["length"]
    center = np.array(params["center_position"])
    orientation = np.array(params["orientation"])
    radius = params["wire_radius"]
    gap = params.get("gap", 0.0)
    n_segments_per_half = params["segments"]
    
    nodes = []
    edges = []
    
    if gap > 0:
        # Create two separate poles with gap in between
        # Upper half: nodes from gap/2 to (length-gap)/2
        # Matching MATLAB: z = linspace(gap/2, (length-gap)/2, N_half+1)
        z_start = gap / 2.0
        z_end = (length - gap) / 2.0
        
        # Create nodes for upper half
        for i in range(n_segments_per_half + 1):
            t = i / n_segments_per_half
            z = z_start + t * (z_end - z_start)
            node = center + z * orientation
            nodes.append(node.tolist())
        
        # Create edges for upper half
        for i in range(n_segments_per_half):
            edges.append([i, i + 1])
        
        # Lower half: nodes from -gap/2 to -(length-gap)/2
        # Matching MATLAB: z = -linspace(gap/2, (length-gap)/2, N_half+1)
        # Create nodes for lower half (mirrored)
        node_offset = n_segments_per_half + 1
        for i in range(n_segments_per_half + 1):
            t = i / n_segments_per_half
            z = -(z_start + t * (z_end - z_start))
            node = center + z * orientation
            nodes.append(node.tolist())
        
        # Create edges for lower half
        for i in range(n_segments_per_half):
            edges.append([node_offset + i, node_offset + i + 1])
        
        # Total segments
        total_segments = 2 * n_segments_per_half
        
        # Source is at the gap (between the two halves)
        # No specific segment ID since it's voltage source across the gap
        if element.source and element.source.type == "voltage":
            element.source.segment_id = None  # Voltage source across gap
        elif element.source and element.source.type == "current":
            # Current source at the first node of each half
            element.source.segment_id = 0  # First segment of upper half
    else:
        # Original continuous dipole (no gap)
        start_point = center - (length / 2.0) * orientation
        
        # Create n_segments+1 nodes uniformly distributed
        for i in range(n_segments_per_half + 1):
            t = i / n_segments_per_half
            node = start_point + t * length * orientation
            nodes.append(node.tolist())
        
        # Create edges connecting consecutive nodes
        for i in range(n_segments_per_half):
            edges.append([i, i + 1])
        
        total_segments = n_segments_per_half
        
        # Source at center segment
        if element.source:
            center_segment = n_segments_per_half // 2
            element.source.segment_id = center_segment
    
    # All edges have the same radius
    radii = [radius] * total_segments
    
    # Map edges to element ID
    edge_to_element = {i: str(element.id) for i in range(total_segments)}
    
    mesh = Mesh(
        nodes=nodes,
        edges=edges,
        radii=radii,
        edge_to_element=edge_to_element,
    )
    
    return mesh
