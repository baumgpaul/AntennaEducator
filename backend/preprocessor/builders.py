"""Antenna builders for creating high-level antenna geometries."""

import logging
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

import numpy as np

from backend.common.models.geometry import AntennaElement, LumpedElement, Mesh, Source
from backend.common.utils import validate_lumped_element_nodes

logger = logging.getLogger(__name__)


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
        segments: Total number of segments (split equally between halves if gap > 0)
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
        source_objs.append(
            Source(
                type=source.get("type", "voltage"),
                amplitude=amplitude,
                node_start=0,  # Reference/ground node (to be set properly in mesh generation)
                node_end=1,  # Will be set during mesh generation
                series_R=source.get("series_R", 0.0),
                series_L=source.get("series_L", 0.0),
                series_C_inv=source.get("series_C_inv", 0.0),
                tag=source.get("tag", ""),
            )
        )

    # Create lumped element objects if provided
    lumped_objs = []
    if lumped_elements:
        for le_dict in lumped_elements:
            lumped_objs.append(
                LumpedElement(
                    type=le_dict.get("type", "rlc"),
                    R=le_dict.get("R", 0.0),
                    L=le_dict.get("L", 0.0),
                    C_inv=le_dict.get("C_inv", 0.0),
                    node_start=le_dict["node_start"],
                    node_end=le_dict["node_end"],
                    tag=le_dict.get("tag", ""),
                )
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
        sources=source_objs,
        lumped_elements=lumped_objs,
    )

    return element


def dipole_to_mesh(element: AntennaElement) -> Mesh:
    """
    Convert a dipole antenna element to a computational mesh.
    Creates two separate poles if gap > 0.
    Node ordering: lower arm first (tip → gap), then upper arm (gap → tip).
    This matches the frontend preview node numbering.

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
    # segments parameter is TOTAL segments (frontend convention).
    # For gap dipoles this is split equally between the two arms.
    total_segments_param = params["segments"]

    nodes = []
    edges = []

    if gap > 0:
        # Create two separate poles with gap in between (symmetric about center).
        # Node ordering matches the frontend preview: lower arm first
        # (tip → gap), then upper arm (gap → tip).
        n_seg = max(total_segments_param // 2, 1)

        # Lower arm: from -(length-gap)/2 (tip) to -gap/2 (gap edge)
        z_start_lower = -(length - gap) / 2.0
        z_end_lower = -gap / 2.0

        for i in range(n_seg + 1):
            t = i / n_seg
            z = z_start_lower + t * (z_end_lower - z_start_lower)
            node = center + z * orientation
            nodes.append(node.tolist())

        # Edges for lower arm (1-based node indexing)
        for i in range(n_seg):
            edges.append([i + 1, i + 2])

        # Upper arm: from +gap/2 (gap edge) to +(length-gap)/2 (tip)
        node_offset = n_seg + 1
        z_start_upper = gap / 2.0
        z_end_upper = (length - gap) / 2.0

        for i in range(n_seg + 1):
            t = i / n_seg
            z = z_start_upper + t * (z_end_upper - z_start_upper)
            node = center + z * orientation
            nodes.append(node.tolist())

        # Edges for upper arm (1-based node indexing)
        for i in range(n_seg):
            edges.append([node_offset + i + 1, node_offset + i + 2])

        total_segments = 2 * n_seg

        # Feed nodes are at the gap: last lower node and first upper node.
        # For segments=6 (3 per arm, 8 nodes): feed_lower=4, feed_upper=5.
        feed_lower = n_seg + 1  # Last node of lower arm (at gap)
        feed_upper = node_offset + 1  # First node of upper arm (at gap)

        # Source is at the gap (balanced/differential feed for gap dipoles)
        # - Voltage sources: ground→feed_lower (+V) and ground→feed_upper (-V)
        # - Current sources: inject at feed_lower (+I) and feed_upper (-I)
        if len(element.sources) > 0:
            source_type = element.sources[0].type

            if source_type == "voltage":
                element.sources[0].node_start = 0  # Ground
                element.sources[0].node_end = feed_lower

                # For gap dipoles, create second source with opposite polarity
                if len(element.sources) == 1:
                    second_source = Source(
                        type=element.sources[0].type,
                        amplitude=-element.sources[0].amplitude,
                        node_start=0,
                        node_end=feed_upper,
                        series_R=element.sources[0].series_R,
                        series_L=element.sources[0].series_L,
                        series_C_inv=element.sources[0].series_C_inv,
                        tag=element.sources[0].tag + "_lower" if element.sources[0].tag else "",
                    )
                    element.sources.append(second_source)

            elif source_type == "current":
                element.sources[0].node_start = feed_lower
                element.sources[0].node_end = None

                if len(element.sources) == 1:
                    second_source = Source(
                        type="current",
                        amplitude=-element.sources[0].amplitude,
                        node_start=feed_upper,
                        node_end=None,
                        tag=element.sources[0].tag + "_lower" if element.sources[0].tag else "",
                    )
                    element.sources.append(second_source)
    else:
        # Original continuous dipole (no gap)
        n_total = total_segments_param
        start_point = center - (length / 2.0) * orientation

        # Create n_total+1 nodes uniformly distributed
        for i in range(n_total + 1):
            t = i / n_total
            node = start_point + t * length * orientation
            nodes.append(node.tolist())

        # Create edges connecting consecutive nodes (1-based indexing)
        for i in range(n_total):
            edges.append([i + 1, i + 2])

        total_segments = n_total

        # Source at center (for continuous dipole without gap)
        # Between the two center nodes (1-based indexing)
        if len(element.sources) > 0:
            center_node = n_total // 2
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
        validate_lumped_element_nodes(element.lumped_elements, len(nodes), element.name)

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
            # Use 1-based indexing (PEEC convention)
            if gap > 0:
                # With gap: source across the gap (ground to first node)
                node_start = 0
                node_end = 1
            else:
                # Closed loop: source across the wraparound edge (last→first)
                # loop_to_mesh generates exactly 'segments' nodes for closed loops
                node_start = segments  # Last node (1-based)
                node_end = 1  # First node (1-based)

            # Allow custom positioning if specified
            if "position" in source:
                pos = source["position"]
                if isinstance(pos, int):
                    # Custom position: between node pos and pos+1
                    node_start = pos + 1  # Convert to 1-based
                    node_end = pos + 2

            source_objs.append(
                Source(
                    type=source_type,
                    amplitude=amplitude_complex,
                    node_start=node_start,
                    node_end=node_end,
                    series_R=source.get("series_R", 0.0),
                    series_L=source.get("series_L", 0.0),
                    series_C_inv=source.get("series_C_inv", 0.0),
                    tag=source.get("tag", ""),
                )
            )

        elif source_type == "current":
            # Current source: two-terminal for closed loops, single-node for gapped
            if gap > 0:
                # Gapped loop: inject at first node, return to ground (implicit)
                node_start = 1
                node_end = None
            else:
                # Closed loop: must create a feed gap (like VS) so current
                # flows around the loop instead of through local capacitive coupling.
                node_start = 1  # Current injected here
                node_end = segments  # Current extracted here (return terminal)

            # Allow custom positioning if specified
            if "position" in source:
                pos = source["position"]
                if isinstance(pos, int):
                    node_start = pos + 1  # Convert to 1-based
                    if gap == 0:
                        node_end = pos + 2  # Two-terminal for closed loops

            source_objs.append(
                Source(
                    type=source_type,
                    amplitude=amplitude_complex,
                    node_start=node_start,
                    node_end=node_end,
                    series_R=source.get("series_R", 0.0),
                    series_L=source.get("series_L", 0.0),
                    series_C_inv=source.get("series_C_inv", 0.0),
                    tag=source.get("tag", ""),
                )
            )

    # Create lumped element objects if provided
    lumped_objs = []
    if lumped_elements:
        for le_dict in lumped_elements:
            lumped_objs.append(
                LumpedElement(
                    type=le_dict.get("type", "rlc"),
                    R=le_dict.get("R", 0.0),
                    L=le_dict.get("L", 0.0),
                    C_inv=le_dict.get("C_inv", 0.0),
                    node_start=le_dict["node_start"],
                    node_end=le_dict["node_end"],
                    tag=le_dict.get("tag", ""),
                )
            )

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
    2 * np.pi * radius
    gap_angle = gap / radius if gap > 0 else 0

    # Generate nodes around the circle (with gap at start if needed)
    if gap > 0:
        # Start after half the gap, end before the other half.
        # Offset by π so the feed gap sits at the bottom of the loop (0, -r, 0)
        # which is the natural feed-terminal position for a physical loop.
        start_angle = np.pi + gap_angle / 2
        end_angle = np.pi + 2 * np.pi - gap_angle / 2
        angles = np.linspace(start_angle, end_angle, segments + 1)
    else:
        # Full circle — offset by half a segment so the feed gap (closing edge
        # between node N and node 1) is centred at the bottom of the loop
        # (0, -r, 0).  Without this offset node 1 sits exactly at π and
        # node N is one step before, so the feed midpoint is off-centre.
        half_step = np.pi / segments
        angles = np.linspace(np.pi + half_step, 3 * np.pi + half_step, segments + 1)[:-1]

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

    # Remove wire edges that coincide with source node pairs (voltage or
    # two-terminal current sources).  In PEEC MNA, both the wire segment and
    # the source are branches; if they share the same node pair they become
    # parallel paths, which corrupts the series-loop current distribution.
    # Removing the wire edge makes the source the sole branch at that location.
    if element.sources:
        source_pairs = set()
        for src in element.sources:
            if src.node_end is not None:
                source_pairs.add((src.node_start, src.node_end))
                source_pairs.add((src.node_end, src.node_start))
        edges = [e for e in edges if (e[0], e[1]) not in source_pairs]

    # All remaining edges have same wire radius
    radii = [wire_radius] * len(edges)

    # Create mesh
    mesh = Mesh(
        nodes=nodes,
        edges=edges,
        radii=radii,
    )

    # Validate lumped element node references
    if element.lumped_elements:
        validate_lumped_element_nodes(element.lumped_elements, len(nodes), element.name)

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
        # Use 1-based indexing (PEEC convention)
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

        source_objs.append(
            Source(
                type=source["type"],
                amplitude=amplitude_complex,
                node_start=node_start,
                node_end=node_end,
                series_R=source.get("series_R", 0.0),
                series_L=source.get("series_L", 0.0),
                series_C_inv=source.get("series_C_inv", 0.0),
                tag=source.get("tag", ""),
            )
        )

    # Create lumped element objects if provided
    lumped_objs = []
    if lumped_elements:
        for le_dict in lumped_elements:
            lumped_objs.append(
                LumpedElement(
                    type=le_dict.get("type", "rlc"),
                    R=le_dict.get("R", 0.0),
                    L=le_dict.get("L", 0.0),
                    C_inv=le_dict.get("C_inv", 0.0),
                    node_start=le_dict["node_start"],
                    node_end=le_dict["node_end"],
                    tag=le_dict.get("tag", ""),
                )
            )

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
        validate_lumped_element_nodes(element.lumped_elements, len(nodes), element.name)

    return mesh


# ---------------------------------------------------------------------------
# Custom antenna builder
# ---------------------------------------------------------------------------


def _validate_custom_nodes(nodes: List[Dict[str, Any]]) -> None:
    """Validate custom node definitions."""
    if not nodes:
        raise ValueError("At least one node is required")

    ids_seen: set[int] = set()
    for node in nodes:
        nid = node["id"]
        if nid <= 0:
            raise ValueError(f"Node ID must be a positive integer, got {nid}")
        if nid in ids_seen:
            raise ValueError(f"Duplicate node ID: {nid}")
        ids_seen.add(nid)

        radius = node.get("radius", 0.001)
        if radius <= 0:
            raise ValueError(f"Radius must be positive for node {nid}, got {radius}")

        for coord_name in ("x", "y", "z"):
            val = node[coord_name]
            if not np.isfinite(val):
                raise ValueError(f"Non-finite coordinate {coord_name}={val} in node {nid}")


def _validate_custom_edges(edges: List[Dict[str, Any]], valid_ids: set[int]) -> None:
    """Validate custom edge definitions."""
    if not edges:
        raise ValueError("At least one edge is required")

    seen_pairs: set[tuple[int, int]] = set()
    for edge in edges:
        ns, ne = edge["node_start"], edge["node_end"]
        if ns == ne:
            raise ValueError(f"Self-loop edge not allowed: node {ns}")
        if ns not in valid_ids:
            raise ValueError(f"Edge references non-existent node {ns}")
        if ne not in valid_ids:
            raise ValueError(f"Edge references non-existent node {ne}")
        canonical = (min(ns, ne), max(ns, ne))
        if canonical in seen_pairs:
            raise ValueError(f"Duplicate edge between nodes {canonical[0]} and {canonical[1]}")
        seen_pairs.add(canonical)

        edge_radius = edge.get("radius")
        if edge_radius is not None and edge_radius <= 0:
            raise ValueError(f"Edge radius must be positive, got {edge_radius}")


def _check_connectivity(node_ids: List[int], edges: List[Dict[str, Any]]) -> None:
    """Warn if the graph is disconnected (does not raise)."""
    if len(node_ids) <= 1:
        return
    adj: dict[int, set[int]] = {nid: set() for nid in node_ids}
    for edge in edges:
        ns, ne = edge["node_start"], edge["node_end"]
        adj[ns].add(ne)
        adj[ne].add(ns)

    visited: set[int] = set()
    stack = [node_ids[0]]
    while stack:
        current = stack.pop()
        if current in visited:
            continue
        visited.add(current)
        stack.extend(adj[current] - visited)

    if len(visited) < len(node_ids):
        n_components = 1  # the visited set is component 1
        remaining = set(node_ids) - visited
        while remaining:
            seed = next(iter(remaining))
            comp: set[int] = set()
            stack2 = [seed]
            while stack2:
                cur = stack2.pop()
                if cur in comp:
                    continue
                comp.add(cur)
                stack2.extend(adj[cur] - comp)
            remaining -= comp
            n_components += 1
        logger.warning(
            "Custom geometry has %d disconnected components " "(expected 1 connected graph)",
            n_components,
        )


def create_custom(
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    sources: Optional[List[Dict[str, Any]]] = None,
    lumped_elements: Optional[List[Dict[str, Any]]] = None,
    name: str = "Custom Antenna",
) -> AntennaElement:
    """
    Create a custom antenna element from explicit node/edge definitions.

    Node IDs may have gaps (e.g. 1, 5, 10) and are re-indexed to contiguous
    1-based integers (1, 2, 3) for the mesh. Source and lumped element node
    references are updated accordingly.

    Args:
        nodes: List of dicts with keys: id, x, y, z, radius (default 0.001)
        edges: List of dicts with keys: node_start, node_end, radius (optional)
        sources: Optional list of source dicts (type, amplitude, node_start, node_end, ...)
        lumped_elements: Optional list of lumped element dicts
        name: Human-readable name

    Returns:
        AntennaElement with type="custom"

    Raises:
        ValueError: On invalid geometry
    """
    _validate_custom_nodes(nodes)
    valid_ids = {n["id"] for n in nodes}
    _validate_custom_edges(edges, valid_ids)

    # Sort node IDs and build re-index map: old_id -> new_1_based
    sorted_ids = sorted(valid_ids)
    reindex: Dict[int, int] = {
        old_id: new_idx for new_idx, old_id in enumerate(sorted_ids, start=1)
    }
    reindex[0] = 0  # ground maps to itself

    _check_connectivity(sorted_ids, edges)

    node_by_id: Dict[int, Dict[str, Any]] = {n["id"]: n for n in nodes}

    reindexed_edges = []
    for edge in edges:
        reindexed_edges.append(
            {
                "node_start": reindex[edge["node_start"]],
                "node_end": reindex[edge["node_end"]],
                "radius": edge.get("radius"),
            }
        )

    reindexed_nodes = []
    for old_id in sorted_ids:
        n = node_by_id[old_id]
        reindexed_nodes.append(
            {
                "id": reindex[old_id],
                "x": float(n["x"]),
                "y": float(n["y"]),
                "z": float(n["z"]),
                "radius": float(n.get("radius", 0.001)),
            }
        )

    # Build source objects with re-indexed nodes
    source_objs: List[Source] = []
    if sources:
        for src in sources:
            amp = src["amplitude"]
            if isinstance(amp, dict):
                amplitude_complex = complex(amp["real"], amp["imag"])
            else:
                amplitude_complex = complex(amp)

            src_ns = src.get("node_start")
            src_ne = src.get("node_end")
            if src_ns is not None and src_ns != 0:
                if src_ns not in reindex:
                    raise ValueError(f"Source references non-existent node {src_ns}")
                src_ns = reindex[src_ns]
            if src_ne is not None and src_ne != 0:
                if src_ne not in reindex:
                    raise ValueError(f"Source references non-existent node {src_ne}")
                src_ne = reindex[src_ne]

            source_objs.append(
                Source(
                    type=src["type"],
                    amplitude=amplitude_complex,
                    node_start=src_ns,
                    node_end=src_ne,
                    series_R=src.get("series_R", 0.0),
                    series_L=src.get("series_L", 0.0),
                    series_C_inv=src.get("series_C_inv", 0.0),
                    tag=src.get("tag", ""),
                )
            )

    # Build lumped element objects with re-indexed nodes
    lumped_objs: List[LumpedElement] = []
    if lumped_elements:
        for le in lumped_elements:
            le_ns = le["node_start"]
            le_ne = le["node_end"]
            if le_ns != 0 and le_ns not in reindex:
                raise ValueError(f"Lumped element references non-existent node {le_ns}")
            if le_ne != 0 and le_ne not in reindex:
                raise ValueError(f"Lumped element references non-existent node {le_ne}")
            le_ns = reindex.get(le_ns, le_ns)
            le_ne = reindex.get(le_ne, le_ne)
            lumped_objs.append(
                LumpedElement(
                    type=le["type"],
                    R=le.get("R", 0.0),
                    L=le.get("L", 0.0),
                    C_inv=le.get("C_inv", 0.0),
                    node_start=le_ns,
                    node_end=le_ne,
                    tag=le.get("tag", ""),
                )
            )

    return AntennaElement(
        name=name,
        type="custom",
        parameters={
            "nodes": reindexed_nodes,
            "edges": reindexed_edges,
        },
        sources=source_objs,
        lumped_elements=lumped_objs,
    )


def custom_to_mesh(element: AntennaElement) -> Mesh:
    """
    Convert a custom antenna element to a computational mesh.

    Args:
        element: AntennaElement with type="custom"

    Returns:
        Mesh with nodes, edges, radii, edge_to_element, source_edges

    Raises:
        ValueError: If element type is wrong or lumped element nodes invalid
    """
    if element.type != "custom":
        raise ValueError(f"Element must be type 'custom', got '{element.type}'")

    param_nodes = element.parameters["nodes"]
    param_edges = element.parameters["edges"]

    node_by_new_id: Dict[int, Dict[str, Any]] = {n["id"]: n for n in param_nodes}

    mesh_nodes: List[List[float]] = []
    for i in range(1, len(param_nodes) + 1):
        n = node_by_new_id[i]
        mesh_nodes.append([n["x"], n["y"], n["z"]])

    mesh_edges: List[List[int]] = []
    mesh_radii: List[float] = []
    for edge in param_edges:
        ns, ne = edge["node_start"], edge["node_end"]
        mesh_edges.append([ns, ne])

        edge_radius = edge.get("radius")
        if edge_radius is not None:
            mesh_radii.append(edge_radius)
        else:
            r_start = node_by_new_id[ns]["radius"]
            r_end = node_by_new_id[ne]["radius"]
            mesh_radii.append((r_start + r_end) / 2.0)

    edge_to_element: Dict[int, str] = {i: str(element.id) for i in range(len(mesh_edges))}

    source_edges: List[int] = []
    edge_lookup: Dict[tuple[int, int], int] = {}
    for idx, edge_pair in enumerate(mesh_edges):
        edge_lookup[(edge_pair[0], edge_pair[1])] = idx
        edge_lookup[(edge_pair[1], edge_pair[0])] = idx
    for src in element.sources:
        key = (src.node_start, src.node_end)
        if key in edge_lookup:
            source_edges.append(edge_lookup[key])

    mesh = Mesh(
        nodes=mesh_nodes,
        edges=mesh_edges,
        radii=mesh_radii,
        edge_to_element=edge_to_element,
        source_edges=source_edges,
    )

    if element.lumped_elements:
        validate_lumped_element_nodes(element.lumped_elements, len(mesh_nodes), element.name)

    return mesh
