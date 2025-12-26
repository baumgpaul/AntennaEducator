"""Antenna builders for creating high-level antenna geometries."""

from typing import Optional, Tuple, List
import numpy as np
from uuid import uuid4

from backend.common.models.geometry import AntennaElement, Mesh, Source, LumpedElement
from backend.common.utils import validate_lumped_element_nodes


def create_dipole(
    length: float,
    center_position: Tuple[float, float, float] = (0.0, 0.0, 0.0),
    orientation: Tuple[float, float, float] = (0.0, 0.0, 1.0),
    wire_radius: float = 0.001,
    gap: float = 0.01,
    segments: int = 21,
    source: Optional[dict] = None,
    lumped_elements: Optional[List[dict]] = None,
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
                - series_R, series_L, series_C_inv: Series impedance (optional)
                - tag: Human-readable label (optional)
        lumped_elements: Optional list of lumped element dicts with keys:
                         - type, R, L, C_inv, node_start, node_end, tag
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
    
    # Create source object(s) if provided
    source_objs = []
    if source:
        # Handle complex amplitude from dict or direct value
        amplitude = source.get("amplitude", 1.0)
        if isinstance(amplitude, dict):
            amplitude = complex(amplitude.get("real", 0), amplitude.get("imag", 0))
        
        # For gap dipoles, we'll create two sources (balanced feed)
        # This will be finalized in dipole_to_mesh based on gap parameter
        source_objs.append(Source(
            type=source.get("type", "voltage"),
            amplitude=amplitude,
            node_start=0,  # Reference/ground node (to be set properly in mesh generation)
            node_end=1,  # Will be set during mesh generation
            series_R=source.get("series_R", 0.0),
            series_L=source.get("series_L", 0.0),
            series_C_inv=source.get("series_C_inv", 0.0),
            tag=source.get("tag", ""),
        ))
    
    # Create lumped element objects if provided
    lumped_objs = []
    if lumped_elements:
        for le_dict in lumped_elements:
            lumped_objs.append(LumpedElement(
                type=le_dict.get("type", "rlc"),
                R=le_dict.get("R", 0.0),
                L=le_dict.get("L", 0.0),
                C_inv=le_dict.get("C_inv", 0.0),
                node_start=le_dict["node_start"],
                node_end=le_dict["node_end"],
                tag=le_dict.get("tag", ""),
            ))
    
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
        sources=source_objs,
        lumped_elements=lumped_objs,
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
        # Create two separate poles with gap in between (symmetric about center)
        # Upper half: nodes from gap/2 to length/2
        # Lower half: nodes from -gap/2 to -length/2
        # Each half has length (length - gap) / 2
        z_start_upper = gap / 2.0
        z_end_upper = length / 2.0
        
        print(f"DEBUG: Creating dipole - length={length}, gap={gap}")
        print(f"DEBUG: Upper half: {z_start_upper} to {z_end_upper} (length={(z_end_upper-z_start_upper)})")
        print(f"DEBUG: Lower half: {-z_start_upper} to {-z_end_upper} (length={(z_end_upper-z_start_upper)})")
        
        # Create nodes for upper half
        for i in range(n_segments_per_half + 1):
            t = i / n_segments_per_half
            z = z_start_upper + t * (z_end_upper - z_start_upper)
            node = center + z * orientation
            nodes.append(node.tolist())
        
        # Create edges for upper half (1-based node indexing)
        for i in range(n_segments_per_half):
            edges.append([i + 1, i + 2])
        
        # Lower half: nodes from -gap/2 to -length/2 (symmetric)
        # Create nodes for lower half (mirrored)
        node_offset = n_segments_per_half + 1
        z_start_lower = -gap / 2.0
        z_end_lower = -length / 2.0
        
        for i in range(n_segments_per_half + 1):
            t = i / n_segments_per_half
            z = z_start_lower + t * (z_end_lower - z_start_lower)
            node = center + z * orientation
            nodes.append(node.tolist())
        
        # Create edges for lower half (1-based node indexing)
        for i in range(n_segments_per_half):
            edges.append([node_offset + i + 1, node_offset + i + 2])
        
        # Total segments
        total_segments = 2 * n_segments_per_half
        
        # Source is at the gap (balanced/differential feed for gap dipoles)
        # Matching MATLAB createDipole.m:
        # - Voltage sources: ground→upper (+V) and ground→lower (-V)
        # - Current sources: inject at upper node (+I) and lower node (-I)
        if len(element.sources) > 0:
            source_type = element.sources[0].type
            
            if source_type == "voltage":
                # First source: ground to first node of upper half
                element.sources[0].node_start = 0  # Ground
                element.sources[0].node_end = 1     # First upper node
                
                # For gap dipoles, create second source with opposite polarity
                # This creates a balanced feed matching the golden standard
                if len(element.sources) == 1:
                    # Clone first source but with opposite polarity
                    second_source = Source(
                        type=element.sources[0].type,
                        amplitude=-element.sources[0].amplitude,  # Opposite polarity
                        node_start=0,  # Ground
                        node_end=node_offset + 1,  # First lower node (node 7 for 5 segments)
                        series_R=element.sources[0].series_R,
                        series_L=element.sources[0].series_L,
                        series_C_inv=element.sources[0].series_C_inv,
                        tag=element.sources[0].tag + "_lower" if element.sources[0].tag else "",
                    )
                    element.sources.append(second_source)
            
            elif source_type == "current":
                # Current sources: inject at node (no node_start/node_end)
                # MATLAB: Current_Source(1).node=1, Current_Source(2).node=N_p/2+1
                element.sources[0].node_start = 1     # First node of upper half
                element.sources[0].node_end = None    # Not used for current sources
                
                # For gap dipoles, create second current source with opposite polarity
                if len(element.sources) == 1:
                    second_source = Source(
                        type="current",
                        amplitude=-element.sources[0].amplitude,  # Opposite polarity
                        node_start=node_offset + 1,  # First lower node (node 7 for 5 segments)
                        node_end=None,
                        tag=element.sources[0].tag + "_lower" if element.sources[0].tag else "",
                    )
                    element.sources.append(second_source)
    else:
        # Original continuous dipole (no gap)
        start_point = center - (length / 2.0) * orientation
        
        # Create n_segments+1 nodes uniformly distributed
        for i in range(n_segments_per_half + 1):
            t = i / n_segments_per_half
            node = start_point + t * length * orientation
            nodes.append(node.tolist())
        
        # Create edges connecting consecutive nodes (1-based indexing)
        for i in range(n_segments_per_half):
            edges.append([i + 1, i + 2])
        
        total_segments = n_segments_per_half
        
        # Source at center (for continuous dipole without gap)
        # Between the two center nodes (1-based indexing)
        if len(element.sources) > 0:
            center_node = n_segments_per_half // 2
            element.sources[0].node_start = center_node + 1
            element.sources[0].node_end = center_node + 2
    
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
    
    # Validate lumped element node references
    if element.lumped_elements:
        validate_lumped_element_nodes(
            element.lumped_elements, len(nodes), element.name
        )
    
    return mesh


def create_loop(
    radius: float,
    center_position: tuple[float, float, float] = (0.0, 0.0, 0.0),
    normal_vector: tuple[float, float, float] = (0.0, 0.0, 1.0),
    wire_radius: float = 0.001,
    gap: float = 0.0,
    segments: int = 36,
    source: dict | None = None,
    lumped_elements: Optional[List[dict]] = None,
    name: str | None = None,
) -> AntennaElement:
    """
    Create a circular loop antenna element.
    
    Args:
        radius: Loop radius in meters
        center_position: Center point [x, y, z] in meters
        normal_vector: Normal vector to loop plane [dx, dy, dz]
        wire_radius: Wire radius in meters
        gap: Gap at feed point in meters (along circumference)
        segments: Number of segments around the loop (>=3)
        source: Optional source dict with keys: type, amplitude, position,
                series_R, series_L, series_C_inv, tag
        lumped_elements: Optional list of lumped element dicts
        name: Optional name for the element
    
    Returns:
        AntennaElement instance for the loop
        
    Raises:
        ValueError: If parameters are invalid
    """
    # Validate inputs
    if radius <= 0:
        raise ValueError("Loop radius must be positive")
    if wire_radius <= 0:
        raise ValueError("Wire radius must be positive")
    if gap < 0:
        raise ValueError("Gap cannot be negative")
    if segments < 3:
        raise ValueError("Loop must have at least 3 segments")
    
    # Normalize normal vector
    normal = np.array(normal_vector)
    normal_mag = np.linalg.norm(normal)
    if normal_mag == 0:
        raise ValueError("Normal vector cannot be zero")
    normal = normal / normal_mag
    
    # Create source object(s) if provided
    source_objs = []
    if source:
        # Convert amplitude dict to complex number
        amp = source["amplitude"]
        amplitude_complex = complex(amp["real"], amp["imag"])
        
        source_type = source["type"]
        
        if source_type == "voltage":
            # Voltage source: connects between two nodes
            # For loop, source placement depends on whether there's a gap
            # Use 1-based indexing (MATLAB convention)
            if gap > 0:
                # With gap: source across the gap (ground to first node)
                node_start = 0
                node_end = 1
            else:
                # Closed loop: source connects first and last nodes (wraparound)
                node_start = 1  
                node_end = segments + 1  # Last node index (1-based)
            
            # Allow custom positioning if specified
            if "position" in source:
                pos = source["position"]
                if isinstance(pos, int):
                    # Custom position: between node pos and pos+1
                    node_start = pos + 1  # Convert to 1-based
                    node_end = pos + 2
            
            source_objs.append(Source(
                type=source_type,
                amplitude=amplitude_complex,
                node_start=node_start,
                node_end=node_end,
                series_R=source.get("series_R", 0.0),
                series_L=source.get("series_L", 0.0),
                series_C_inv=source.get("series_C_inv", 0.0),
                tag=source.get("tag", ""),
            ))
        
        elif source_type == "current":
            # Current source: injects at a single node (MATLAB style)
            # For loop with gap: inject at first node
            # For closed loop: inject at first node
            node_start = 1  # First mesh node (1-based)
            node_end = None  # Not used for current sources
            
            # Allow custom positioning if specified
            if "position" in source:
                pos = source["position"]
                if isinstance(pos, int):
                    node_start = pos + 1  # Convert to 1-based
            
            source_objs.append(Source(
                type=source_type,
                amplitude=amplitude_complex,
                node_start=node_start,
                node_end=node_end,
                series_R=source.get("series_R", 0.0),
                series_L=source.get("series_L", 0.0),
                series_C_inv=source.get("series_C_inv", 0.0),
                tag=source.get("tag", ""),
            ))
    
    # Create lumped element objects if provided
    lumped_objs = []
    if lumped_elements:
        for le_dict in lumped_elements:
            lumped_objs.append(LumpedElement(
                type=le_dict.get("type", "rlc"),
                R=le_dict.get("R", 0.0),
                L=le_dict.get("L", 0.0),
                C_inv=le_dict.get("C_inv", 0.0),
                node_start=le_dict["node_start"],
                node_end=le_dict["node_end"],
                tag=le_dict.get("tag", ""),
            ))
    
    # Generate unique name
    if name is None:
        name = f"Loop_{radius*1000:.1f}mm_{segments}seg"
    
    # Create element
    element = AntennaElement(
        name=name,
        type="loop",
        parameters={
            "radius": radius,
            "center_position": list(center_position),
            "normal_vector": list(normal_vector),
            "wire_radius": wire_radius,
            "gap": gap,
            "segments": segments,
        },
        sources=source_objs,
        lumped_elements=lumped_objs,
    )
    
    return element


def loop_to_mesh(element: AntennaElement) -> Mesh:
    """
    Convert a loop antenna element to a computational mesh.
    
    Creates a circular loop with nodes placed around the circumference.
    The loop lies in a plane perpendicular to the normal vector.
    
    Args:
        element: AntennaElement of type "loop"
    
    Returns:
        Mesh instance with nodes, edges, and radii
        
    Raises:
        ValueError: If element is not a loop or parameters are invalid
    """
    if element.type != "loop":
        raise ValueError(f"Element must be type 'loop', got '{element.type}'")
    
    # Extract parameters
    radius = element.parameters["radius"]
    center = np.array(element.parameters["center_position"])
    normal = np.array(element.parameters["normal_vector"])
    wire_radius = element.parameters["wire_radius"]
    gap = element.parameters["gap"]
    segments = element.parameters["segments"]
    
    # Normalize normal vector
    normal = normal / np.linalg.norm(normal)
    
    # Create two orthogonal vectors in the plane perpendicular to normal
    # Find a vector not parallel to normal
    if abs(normal[2]) < 0.9:
        ref_vec = np.array([0.0, 0.0, 1.0])
    else:
        ref_vec = np.array([1.0, 0.0, 0.0])
    
    # First tangent vector (in the plane)
    u = np.cross(normal, ref_vec)
    u = u / np.linalg.norm(u)
    
    # Second tangent vector (in the plane, orthogonal to first)
    v = np.cross(normal, u)
    
    # Calculate gap angle
    circumference = 2 * np.pi * radius
    gap_angle = gap / radius if gap > 0 else 0
    
    # Generate nodes around the circle (with gap at start if needed)
    if gap > 0:
        # Start after half the gap, end before the other half
        start_angle = gap_angle / 2
        end_angle = 2 * np.pi - gap_angle / 2
        angles = np.linspace(start_angle, end_angle, segments + 1)
    else:
        # Full circle
        angles = np.linspace(0, 2*np.pi, segments + 1)[:-1]  # Don't duplicate last point
    
    nodes = []
    for angle in angles:
        # Position on circle
        point = center + radius * (np.cos(angle) * u + np.sin(angle) * v)
        nodes.append(point.tolist())
    
    # Create edges (connect consecutive nodes with 1-based indexing)
    edges = []
    if gap > 0:
        # With gap: don't connect last to first
        for i in range(segments):
            edges.append([i + 1, i + 2])
    else:
        # No gap: include wraparound
        for i in range(segments):
            edges.append([i + 1, ((i + 1) % segments) + 1])
    
    # All edges have same wire radius
    radii = [wire_radius] * segments
    
    # Create mesh
    mesh = Mesh(
        nodes=nodes,
        edges=edges,
        radii=radii,
    )
    
    # Validate lumped element node references
    if element.lumped_elements:
        validate_lumped_element_nodes(
            element.lumped_elements, len(nodes), element.name
        )
    
    return mesh


def create_rod(
    length: float,
    base_position: tuple[float, float, float] = (0.0, 0.0, 0.0),
    orientation: tuple[float, float, float] = (0.0, 0.0, 1.0),
    wire_radius: float = 0.001,
    segments: int = 21,
    source: dict | None = None,
    lumped_elements: Optional[List[dict]] = None,
    name: str | None = None,
) -> AntennaElement:
    """
    Create a rod (monopole) antenna element.
    
    A rod is a straight wire extending from a base position (ground plane).
    
    Args:
        length: Total length in meters
        base_position: Base point [x, y, z] in meters (typically ground)
        orientation: Direction vector [dx, dy, dz] (points from base)
        wire_radius: Wire radius in meters
        segments: Number of segments along the rod
        source: Optional source dict with keys: type, amplitude, position,
                series_R, series_L, series_C_inv, tag
        lumped_elements: Optional list of lumped element dicts
        name: Optional name for the element
    
    Returns:
        AntennaElement instance for the rod
        
    Raises:
        ValueError: If parameters are invalid
    """
    # Validate inputs
    if length <= 0:
        raise ValueError("Rod length must be positive")
    if wire_radius <= 0:
        raise ValueError("Wire radius must be positive")
    if segments < 1:
        raise ValueError("Rod must have at least 1 segment")
    
    # Normalize orientation vector
    orient = np.array(orientation)
    orient_mag = np.linalg.norm(orient)
    if orient_mag == 0:
        raise ValueError("Orientation vector cannot be zero")
    orient = orient / orient_mag
    
    # Create source object(s) if provided
    source_objs = []
    if source:
        # For rod, source is typically at base (between ground and first mesh node)
        # Use 1-based indexing (MATLAB convention)
        node_start = 0  # Ground node
        node_end = 1  # First mesh node (1-based)
        
        if "position" in source:
            pos = source["position"]
            if isinstance(pos, int):
                # Custom position: between node pos and pos+1
                node_start = pos + 1  # Convert to 1-based
                node_end = pos + 2
        
        # Convert amplitude dict to complex number
        amp = source["amplitude"]
        amplitude_complex = complex(amp["real"], amp["imag"])
        
        source_objs.append(Source(
            type=source["type"],
            amplitude=amplitude_complex,
            node_start=node_start,
            node_end=node_end,
            series_R=source.get("series_R", 0.0),
            series_L=source.get("series_L", 0.0),
            series_C_inv=source.get("series_C_inv", 0.0),
            tag=source.get("tag", ""),
        ))
    
    # Create lumped element objects if provided
    lumped_objs = []
    if lumped_elements:
        for le_dict in lumped_elements:
            lumped_objs.append(LumpedElement(
                type=le_dict.get("type", "rlc"),
                R=le_dict.get("R", 0.0),
                L=le_dict.get("L", 0.0),
                C_inv=le_dict.get("C_inv", 0.0),
                node_start=le_dict["node_start"],
                node_end=le_dict["node_end"],
                tag=le_dict.get("tag", ""),
            ))
    
    # Generate unique name
    if name is None:
        name = f"Rod_{length*1000:.1f}mm_{segments}seg"
    
    # Create element
    element = AntennaElement(
        name=name,
        type="rod",
        parameters={
            "length": length,
            "base_position": list(base_position),
            "orientation": list(orientation),
            "wire_radius": wire_radius,
            "segments": segments,
        },
        sources=source_objs,
        lumped_elements=lumped_objs,
    )
    
    return element


def rod_to_mesh(element: AntennaElement) -> Mesh:
    """
    Convert a rod antenna element to a computational mesh.
    
    Creates a straight wire from the base position extending in the
    orientation direction.
    
    Args:
        element: AntennaElement of type "rod"
    
    Returns:
        Mesh instance with nodes, edges, and radii
        
    Raises:
        ValueError: If element is not a rod or parameters are invalid
    """
    if element.type != "rod":
        raise ValueError(f"Element must be type 'rod', got '{element.type}'")
    
    # Extract parameters
    length = element.parameters["length"]
    base = np.array(element.parameters["base_position"])
    orient = np.array(element.parameters["orientation"])
    wire_radius = element.parameters["wire_radius"]
    segments = element.parameters["segments"]
    
    # Normalize orientation
    orient = orient / np.linalg.norm(orient)
    
    # Generate nodes along the rod
    # Create (segments+1) nodes from base to tip
    positions = np.linspace(0, length, segments + 1)
    
    nodes = []
    for pos in positions:
        point = base + pos * orient
        nodes.append(point.tolist())
    
    # Create edges connecting consecutive nodes (1-based indexing)
    edges = []
    for i in range(segments):
        edges.append([i + 1, i + 2])
    
    # All edges have same wire radius
    radii = [wire_radius] * segments
    
    # Create mesh
    mesh = Mesh(
        nodes=nodes,
        edges=edges,
        radii=radii,
    )
    
    # Validate lumped element node references
    if element.lumped_elements:
        validate_lumped_element_nodes(
            element.lumped_elements, len(nodes), element.name
        )
    
    return mesh


def create_helix(
    radius: float,
    pitch: float,
    turns: float,
    start_position: tuple[float, float, float] = (0.0, 0.0, 0.0),
    axis: tuple[float, float, float] = (0.0, 0.0, 1.0),
    wire_radius: float = 0.001,
    segments_per_turn: int = 24,
    source: dict | None = None,
    lumped_elements: Optional[List[dict]] = None,
    name: str | None = None,
) -> AntennaElement:
    """
    Create a helix antenna element.
    
    The helix is a spiral antenna that wraps around a cylindrical surface.
    Commonly used for circular polarization.
    
    Args:
        radius: Helix radius in meters
        pitch: Vertical distance per turn in meters
        turns: Number of complete turns
        start_position: Starting point [x, y, z] in meters
        axis: Helix axis direction [dx, dy, dz]
        wire_radius: Wire radius in meters
        segments_per_turn: Number of segments per complete turn (>=3)
        source: Optional source dict with keys: type, amplitude, position,
                series_R, series_L, series_C_inv, tag
        lumped_elements: Optional list of lumped element dicts
        name: Optional name for the element
    
    Returns:
        AntennaElement instance for the helix
        
    Raises:
        ValueError: If parameters are invalid
    """
    # Validate inputs
    if radius <= 0:
        raise ValueError("Helix radius must be positive")
    if pitch <= 0:
        raise ValueError("Helix pitch must be positive")
    if turns <= 0:
        raise ValueError("Number of turns must be positive")
    if wire_radius <= 0:
        raise ValueError("Wire radius must be positive")
    if segments_per_turn < 3:
        raise ValueError("Helix must have at least 3 segments per turn")
    
    # Normalize axis vector
    axis_vec = np.array(axis)
    axis_mag = np.linalg.norm(axis_vec)
    if axis_mag == 0:
        raise ValueError("Axis vector cannot be zero")
    axis_vec = axis_vec / axis_mag
    
    # Create source object(s) if provided
    source_objs = []
    if source:
        # Convert amplitude dict to complex number
        amp = source["amplitude"]
        amplitude_complex = complex(amp["real"], amp["imag"])
        
        source_type = source["type"]
        
        if source_type == "voltage":
            # Voltage source: connects between two nodes
            # For helix, source is typically at start (between ground and first mesh node)
            # Use 1-based indexing (MATLAB convention)
            node_start = 0  # Ground node
            node_end = 1  # First mesh node (1-based)
            
            if "position" in source:
                pos = source["position"]
                if isinstance(pos, int):
                    # Custom position: between node pos and pos+1
                    node_start = pos + 1  # Convert to 1-based
                    node_end = pos + 2
            
            source_objs.append(Source(
                type=source_type,
                amplitude=amplitude_complex,
                node_start=node_start,
                node_end=node_end,
                series_R=source.get("series_R", 0.0),
                series_L=source.get("series_L", 0.0),
                series_C_inv=source.get("series_C_inv", 0.0),
                tag=source.get("tag", ""),
            ))
        
        elif source_type == "current":
            # Current source: injects at a single node (MATLAB style)
            # For helix, typically inject at first mesh node
            node_start = 1  # First mesh node (1-based)
            node_end = None  # Not used for current sources
            
            if "position" in source:
                pos = source["position"]
                if isinstance(pos, int):
                    node_start = pos + 1  # Convert to 1-based
            
            source_objs.append(Source(
                type=source_type,
                amplitude=amplitude_complex,
                node_start=node_start,
                node_end=node_end,
                series_R=source.get("series_R", 0.0),
                series_L=source.get("series_L", 0.0),
                series_C_inv=source.get("series_C_inv", 0.0),
                tag=source.get("tag", ""),
            ))
    
    # Create lumped element objects if provided
    lumped_objs = []
    if lumped_elements:
        for le_dict in lumped_elements:
            lumped_objs.append(LumpedElement(
                type=le_dict.get("type", "rlc"),
                R=le_dict.get("R", 0.0),
                L=le_dict.get("L", 0.0),
                C_inv=le_dict.get("C_inv", 0.0),
                node_start=le_dict["node_start"],
                node_end=le_dict["node_end"],
                tag=le_dict.get("tag", ""),
            ))
    
    # Generate unique name
    if name is None:
        name = f"Helix_{radius*1000:.1f}mm_{turns:.1f}turns"
    
    # Create element
    element = AntennaElement(
        name=name,
        type="helix",
        parameters={
            "radius": radius,
            "pitch": pitch,
            "turns": turns,
            "start_position": list(start_position),
            "axis": list(axis),
            "wire_radius": wire_radius,
            "segments_per_turn": segments_per_turn,
        },
        sources=source_objs,
        lumped_elements=lumped_objs,
    )
    
    return element


def helix_to_mesh(element: AntennaElement) -> Mesh:
    """
    Convert a helix antenna element to a computational mesh.
    
    Creates a spiral wire that wraps around a cylindrical surface,
    following the helix axis direction.
    
    Args:
        element: AntennaElement of type "helix"
    
    Returns:
        Mesh instance with nodes, edges, and radii
        
    Raises:
        ValueError: If element is not a helix or parameters are invalid
    """
    if element.type != "helix":
        raise ValueError(f"Element must be type 'helix', got '{element.type}'")
    
    # Extract parameters
    radius = element.parameters["radius"]
    pitch = element.parameters["pitch"]
    turns = element.parameters["turns"]
    start = np.array(element.parameters["start_position"])
    axis = np.array(element.parameters["axis"])
    wire_radius = element.parameters["wire_radius"]
    segments_per_turn = element.parameters["segments_per_turn"]
    
    # Normalize axis vector
    axis = axis / np.linalg.norm(axis)
    
    # Create two orthogonal vectors perpendicular to axis
    # Find a vector not parallel to axis
    if abs(axis[2]) < 0.9:
        ref_vec = np.array([0.0, 0.0, 1.0])
    else:
        ref_vec = np.array([1.0, 0.0, 0.0])
    
    # First radial vector (perpendicular to axis)
    u = np.cross(axis, ref_vec)
    u = u / np.linalg.norm(u)
    
    # Second radial vector (perpendicular to both axis and u)
    v = np.cross(axis, u)
    
    # Generate nodes along the helix
    total_segments = int(segments_per_turn * turns)
    angles = np.linspace(0, 2 * np.pi * turns, total_segments + 1)
    heights = np.linspace(0, pitch * turns, total_segments + 1)
    
    nodes = []
    for angle, height in zip(angles, heights):
        # Position on helix: circular motion + linear advancement
        radial_offset = radius * (np.cos(angle) * u + np.sin(angle) * v)
        axial_offset = height * axis
        point = start + radial_offset + axial_offset
        nodes.append(point.tolist())
    
    # Create edges connecting consecutive nodes (1-based indexing)
    edges = []
    for i in range(total_segments):
        edges.append([i + 1, i + 2])
    
    # All edges have same wire radius
    radii = [wire_radius] * total_segments
    
    # Create mesh
    mesh = Mesh(
        nodes=nodes,
        edges=edges,
        radii=radii,
    )
    
    # Validate lumped element node references
    if element.lumped_elements:
        validate_lumped_element_nodes(
            element.lumped_elements, len(nodes), element.name
        )
    
    return mesh
