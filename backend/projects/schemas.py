"""Pydantic schemas for the Projects API — v2.

Changes from v1:
- ``description`` is human text only (no more JSON-encoded elements)
- New JSON blob fields: ``design_state``, ``simulation_config``,
  ``simulation_results``, ``ui_state``
- Removed: ``ProjectElement*``, ``Result*``, ``requested_fields``,
  ``view_configurations``, ``solver_state``
- Auth schemas moved to ``backend.auth.schemas``
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ── Project Schemas ───────────────────────────────────────────────────────────

class ProjectBase(BaseModel):
    """Fields shared by create / update / response."""

    name: str = Field(..., min_length=3, max_length=100)
    description: Optional[str] = Field(
        None,
        max_length=2000,
        description="Human-readable project description",
    )
    design_state: Optional[Dict[str, Any]] = Field(
        None,
        description=(
            "Full snapshot of the design: elements, sources, lumped elements, "
            "positions, rotations, visibility. Versioned via 'version' key."
        ),
    )
    simulation_config: Optional[Dict[str, Any]] = Field(
        None,
        description=(
            "Solver / postprocessor settings: method (peec / fem), "
            "frequency config, requested fields, postprocessing views."
        ),
    )
    simulation_results: Optional[Dict[str, Any]] = Field(
        None,
        description=(
            "Solver output summary + S3 references for heavy data. "
            "Contains method, frequency sweep results, result S3 keys, metadata."
        ),
    )
    ui_state: Optional[Dict[str, Any]] = Field(
        None,
        description="Frontend-only state: selected tabs, camera position, etc.",
    )


class ProjectCreate(ProjectBase):
    """Schema for creating a project."""
    pass


class ProjectUpdate(BaseModel):
    """Schema for updating a project — all fields optional."""

    name: Optional[str] = Field(None, min_length=3, max_length=100)
    description: Optional[str] = Field(None, max_length=2000)
    design_state: Optional[Dict[str, Any]] = None
    simulation_config: Optional[Dict[str, Any]] = None
    simulation_results: Optional[Dict[str, Any]] = None
    ui_state: Optional[Dict[str, Any]] = None


class ProjectResponse(ProjectBase):
    """Full project response (single project view)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime


class ProjectListResponse(BaseModel):
    """Lightweight project list item (no large JSON blobs)."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime
