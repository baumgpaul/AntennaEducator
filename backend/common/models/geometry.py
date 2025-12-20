"""
Geometry-related data models.
"""

from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field, field_validator
from uuid import UUID, uuid4
from datetime import datetime
import numpy as np


class Source(BaseModel):
    """
    Source definition for antenna excitation.
    
    Note: Frequency is defined at the solver level, not per source.
    All sources in a project operate at the same frequency(ies).
    """
    type: Literal["voltage", "current"] = Field(
        description="Type of source excitation"
    )
    amplitude: complex = Field(
        description="Source amplitude (can be complex for phase)"
    )
    segment_id: Optional[int] = Field(
        default=None,
        description="Segment index where source is applied (set during mesh generation)"
    )
    
    class Config:
        json_encoders = {
            complex: lambda v: {"real": v.real, "imag": v.imag}
        }


class AntennaElement(BaseModel):
    """
    High-level antenna element definition.
    """
    id: UUID = Field(default_factory=uuid4)
    name: str = Field(description="Human-readable name for the element")
    type: Literal["dipole", "loop", "helix", "rod", "grid", "custom"] = Field(
        description="Type of antenna element"
    )
    parameters: Dict[str, Any] = Field(
        description="Type-specific parameters (length, radius, center, etc.)"
    )
    source: Optional[Source] = Field(
        default=None,
        description="Source excitation for this element"
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {
            UUID: str,
            datetime: lambda v: v.isoformat()
        }


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


class Geometry(BaseModel):
    """
    Complete geometry definition for a project.
    
    Contains both high-level antenna elements and the
    generated computational mesh.
    """
    id: UUID = Field(default_factory=uuid4)
    project_id: UUID = Field(description="Parent project ID")
    elements: List[AntennaElement] = Field(
        default_factory=list,
        description="List of high-level antenna elements"
    )
    mesh: Optional[Mesh] = Field(
        default=None,
        description="Generated computational mesh (null until meshed)"
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        json_encoders = {
            UUID: str,
            datetime: lambda v: v.isoformat()
        }
    
    @property
    def is_meshed(self) -> bool:
        """Check if geometry has been meshed."""
        return self.mesh is not None
    
    @property
    def num_elements(self) -> int:
        """Number of antenna elements."""
        return len(self.elements)
    
    def get_element(self, element_id: UUID) -> Optional[AntennaElement]:
        """
        Get an antenna element by ID.
        
        Args:
            element_id: UUID of the element
            
        Returns:
            AntennaElement if found, None otherwise
        """
        for element in self.elements:
            if element.id == element_id:
                return element
        return None
    
    def add_element(self, element: AntennaElement) -> None:
        """
        Add an antenna element to the geometry.
        
        Args:
            element: AntennaElement to add
        """
        self.elements.append(element)
        self.updated_at = datetime.utcnow()
        # Invalidate mesh when geometry changes
        self.mesh = None
    
    def remove_element(self, element_id: UUID) -> bool:
        """
        Remove an antenna element from the geometry.
        
        Args:
            element_id: UUID of the element to remove
            
        Returns:
            True if element was removed, False if not found
        """
        for i, element in enumerate(self.elements):
            if element.id == element_id:
                self.elements.pop(i)
                self.updated_at = datetime.utcnow()
                # Invalidate mesh when geometry changes
                self.mesh = None
                return True
        return False
