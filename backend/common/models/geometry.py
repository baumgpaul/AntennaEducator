"""
Geometry-related data models.
"""

from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator
from uuid import UUID, uuid4
from datetime import datetime, timezone
import numpy as np


class Source(BaseModel):
    """
    Source definition for antenna excitation.
    
    Note: Frequency is defined at the solver level, not per source.
    All sources in a project operate at the same frequency(ies).
    
    In MATLAB/PEEC formulation, sources are always between two nodes:
    - Voltage source: defined between node_start and node_end
    - Current source: flows from one node to another
    - Node 0 is typically the reference/ground node
    
    Voltage sources can optionally have series impedance (R, L, C).
    """
    type: Literal["voltage", "current"] = Field(
        description="Type of source excitation"
    )
    amplitude: complex = Field(
        description="Source amplitude (can be complex for phase)"
    )
    node_start: Optional[int] = Field(
        default=None,
        description="Starting node index: 1-based for mesh nodes (1 to N), 0 for ground/reference"
    )
    node_end: Optional[int] = Field(
        default=None,
        description="Ending node index: 1-based for mesh nodes (1 to N), 0 for ground"
    )
    
    # Series impedance for voltage sources (matches MATLAB's Voltage_Source structure)
    series_R: float = Field(
        default=0.0,
        description="Series resistance in Ohms",
        ge=0
    )
    series_L: float = Field(
        default=0.0,
        description="Series inductance in Henries",
        ge=0
    )
    series_C_inv: float = Field(
        default=0.0,
        description="Series inverse capacitance (1/C) in F^-1 for convenient frequency-domain calculation",
        ge=0
    )
    
    tag: str = Field(
        default="",
        description="Human-readable label for the source"
    )

    @field_serializer("amplitude")
    @classmethod
    def serialize_complex(cls, v: complex) -> dict:
        return {"real": v.real, "imag": v.imag}


class LumpedElement(BaseModel):
    """
    Lumped circuit element (resistor, inductor, capacitor, or RLC combination).
    
    Corresponds to MATLAB's Antenna.Circuit.Load structure.
    Can be attached between any two nodes in the antenna to model:
    - Load impedances
    - Matching networks
    - Passive circuit elements
    
    The element impedance is: Z = R + jωL + 1/(jωC) where C = 1/C_inv
    Using C_inv (inverse capacitance) avoids division by zero and matches MATLAB convention.
    
    Node numbering follows MATLAB convention (1-based indexing):
    - Positive indices: regular mesh nodes (1, 2, 3, ..., N)
    - 0: ground/reference node
    - Negative indices: appended/auxiliary nodes (-1, -2, -3, ...)
    
    Note: Internally, Python stores mesh nodes in 0-based arrays, but circuit
    elements use 1-based node references for MATLAB compatibility.
    """
    type: Literal["resistor", "inductor", "capacitor", "rlc"] = Field(
        description="Type of lumped element (for documentation/visualization)"
    )
    R: float = Field(
        default=0.0,
        description="Resistance in Ohms",
        ge=0
    )
    L: float = Field(
        default=0.0,
        description="Inductance in Henries",
        ge=0
    )
    C_inv: float = Field(
        default=0.0,
        description="Inverse capacitance (1/C) in F^-1 for convenient frequency-domain calculation",
        ge=0
    )
    node_start: int = Field(
        description="Starting node index: 1-based for mesh nodes (1 to N), 0 for ground, negative for appended nodes"
    )
    node_end: int = Field(
        description="Ending node index: 1-based for mesh nodes (1 to N), 0 for ground, negative for appended nodes"
    )
    tag: str = Field(
        default="",
        description="Human-readable label (e.g., 'Load resistor', 'Matching capacitor')"
    )
    
    @field_validator("type")
    def validate_type_matches_values(cls, v, info):
        """Validate that type descriptor roughly matches the RLC values."""
        # This is a soft validation - just for documentation purposes
        # In MATLAB, all loads have R, L, C_inv fields regardless of type
        return v
    
    @property
    def impedance(self) -> str:
        """Return a string representation of the impedance."""
        parts = []
        if self.R > 0:
            parts.append(f"R={self.R:.3g}Ω")
        if self.L > 0:
            parts.append(f"L={self.L:.3g}H")
        if self.C_inv > 0:
            parts.append(f"C={1/self.C_inv:.3g}F")
        return ", ".join(parts) if parts else "short"


class AntennaElement(BaseModel):
    """
    High-level antenna element definition.
    
    Each element can have:
    - Geometry (defined by type and parameters)
    - Optional source excitation(s) - can have multiple for balanced feeds
    - Optional lumped circuit elements (resistors, inductors, capacitors)
    
    Multiple elements can be combined in a Geometry, and the solver will
    merge them following MATLAB's solvePEECLinear.m pattern.
    """
    id: UUID = Field(default_factory=uuid4)
    name: str = Field(description="Human-readable name for the element")
    type: Literal["dipole", "loop", "helix", "rod", "grid", "custom"] = Field(
        description="Type of antenna element"
    )
    parameters: Dict[str, Any] = Field(
        description="Type-specific parameters (length, radius, center, etc.)"
    )
    sources: List[Source] = Field(
        default_factory=list,
        description="Source excitations for this element (can have multiple for balanced feeds)"
    )
    lumped_elements: List[LumpedElement] = Field(
        default_factory=list,
        description="Lumped circuit elements (R, L, C) attached between nodes"
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Mesh(BaseModel):
    """
    Computational mesh for PEEC simulation.
    
    This is the low-level discretized representation after
    high-level antenna elements have been converted to segments.
    """
    nodes: List[List[float]] = Field(
        description="Node coordinates [N x 3] array as list"
    )
    edges: List[List[int]] = Field(
        description="Edge connectivity [M x 2] array (node indices)"
    )
    radii: List[float] = Field(
        description="Wire radius for each edge [M] array"
    )
    edge_to_element: Dict[int, str] = Field(
        default_factory=dict,
        description="Mapping from edge index to element ID"
    )
    source_edges: List[int] = Field(
        default_factory=list,
        description="List of edge indices that have sources"
    )
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional metadata for visualization"
    )
    
    @field_validator("nodes")
    def validate_nodes(cls, v):
        """Validate that nodes are 3D coordinates."""
        if not all(len(node) == 3 for node in v):
            raise ValueError("All nodes must be 3D coordinates [x, y, z]")
        return v
    
    @field_validator("edges")
    def validate_edges(cls, v):
        """Validate that edges are pairs of node indices."""
        if not all(len(edge) == 2 for edge in v):
            raise ValueError("All edges must be pairs [node_i, node_j]")
        return v
    
    @property
    def num_nodes(self) -> int:
        """Number of nodes in the mesh."""
        return len(self.nodes)
    
    @property
    def num_edges(self) -> int:
        """Number of edges (segments) in the mesh."""
        return len(self.edges)
    
    def to_numpy(self) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Convert mesh data to NumPy arrays for computation.
        
        Returns:
            Tuple of (nodes, edges, radii) as NumPy arrays
        """
        nodes_array = np.array(self.nodes, dtype=float)
        edges_array = np.array(self.edges, dtype=int)
        radii_array = np.array(self.radii, dtype=float)
        return nodes_array, edges_array, radii_array
