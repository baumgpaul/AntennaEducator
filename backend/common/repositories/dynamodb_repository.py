"""DynamoDB implementation of ProjectRepository — v2.

Changes from v1:
- New JSON blob attributes: ``DesignState``, ``SimulationConfig``,
  ``SimulationResults``, ``UiState``
- Removed: ``RequestedFields``, ``ViewConfigurations``, ``SolverState``
"""

import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

import boto3

from backend.common.repositories.base import ProjectRepository


def _to_dynamodb(value: Any) -> Any:
    """Recursively convert floats/ints → Decimal for DynamoDB."""
    if isinstance(value, dict):
        return {k: _to_dynamodb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_dynamodb(v) for v in value]
    if isinstance(value, tuple):
        return tuple(_to_dynamodb(v) for v in value)
    if isinstance(value, (float, int)) and not isinstance(value, bool):
        return Decimal(str(value))
    return value


def _from_dynamodb(value: Any) -> Any:
    """Recursively convert Decimal → int/float when reading from DynamoDB."""
    if isinstance(value, dict):
        return {k: _from_dynamodb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_from_dynamodb(v) for v in value]
    if isinstance(value, Decimal):
        if value == int(value):
            return int(value)
        return float(value)
    return value


class DynamoDBProjectRepository(ProjectRepository):
    """Single-table DynamoDB repository for projects."""

    def __init__(
        self,
        table_name: Optional[str] = None,
        dynamodb_resource=None,
    ):
        self.table_name = table_name or os.getenv(
            "DYNAMODB_TABLE_NAME", "antenna-simulator-staging"
        )
        self._dynamodb_resource = dynamodb_resource
        self._table = None
        self._dynamodb = None

    # ── lazy table access ─────────────────────────────────────────────────

    @property
    def table(self):
        if self._table is None:
            if self._dynamodb_resource:
                self._dynamodb = self._dynamodb_resource
            else:
                endpoint = os.getenv("DYNAMODB_ENDPOINT_URL")
                self._dynamodb = (
                    boto3.resource("dynamodb", endpoint_url=endpoint)
                    if endpoint
                    else boto3.resource("dynamodb")
                )
            self._table = self._dynamodb.Table(self.table_name)
        return self._table

    # ── create ────────────────────────────────────────────────────────────

    async def create_project(
        self,
        user_id: str,
        name: str,
        description: Optional[str] = None,
        folder_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        project_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        item = {
            "PK": f"USER#{user_id}",
            "SK": f"PROJECT#{project_id}",
            "GSI1PK": f"PROJECT#{project_id}",
            "GSI1SK": "METADATA",
            "EntityType": "PROJECT",
            "ProjectId": project_id,
            "UserId": user_id,
            "Name": name,
            "Description": description or "",
            "FolderId": folder_id or "",
            "DesignState": {},
            "SimulationConfig": {},
            "SimulationResults": {},
            "UiState": {},
            "Documentation": {},
            "CreatedAt": now,
            "UpdatedAt": now,
        }
        self.table.put_item(Item=item)
        return self._to_dict(item)

    # ── read ──────────────────────────────────────────────────────────────

    async def get_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        resp = self.table.query(
            IndexName="GSI1",
            KeyConditionExpression="GSI1PK = :pk AND GSI1SK = :sk",
            ExpressionAttributeValues={
                ":pk": f"PROJECT#{project_id}",
                ":sk": "METADATA",
            },
        )
        items = resp.get("Items", [])
        return self._to_dict(items[0]) if items else None

    async def list_projects(self, user_id: str) -> List[Dict[str, Any]]:
        resp = self.table.query(
            KeyConditionExpression="PK = :pk AND begins_with(SK, :prefix)",
            ExpressionAttributeValues={
                ":pk": f"USER#{user_id}",
                ":prefix": "PROJECT#",
            },
        )
        return [self._to_dict(i) for i in resp.get("Items", [])]

    async def list_projects_in_folder(
        self, user_id: str, folder_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """List projects owned by *user_id* that are in *folder_id*.

        ``folder_id=None`` returns projects at root level (no folder).
        """
        all_projects = await self.list_projects(user_id)
        target = folder_id or ""
        return [p for p in all_projects if (p.get("folder_id") or "") == target]

    # ── update ────────────────────────────────────────────────────────────

    async def update_project(
        self,
        project_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        design_state: Optional[Dict] = None,
        simulation_config: Optional[Dict] = None,
        simulation_results: Optional[Dict] = None,
        ui_state: Optional[Dict] = None,
        documentation: Optional[Dict] = None,
        folder_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        project = await self.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        user_id = project["user_id"]
        now = datetime.now(timezone.utc).isoformat()

        parts = ["SET UpdatedAt = :updated"]
        values: Dict[str, Any] = {":updated": now}
        names: Dict[str, str] = {}

        if name is not None:
            parts.append("#name = :name")
            values[":name"] = name
            names["#name"] = "Name"

        if description is not None:
            parts.append("Description = :desc")
            values[":desc"] = description

        if design_state is not None:
            parts.append("DesignState = :ds")
            values[":ds"] = design_state

        if simulation_config is not None:
            parts.append("SimulationConfig = :sc")
            values[":sc"] = simulation_config

        if simulation_results is not None:
            parts.append("SimulationResults = :sr")
            values[":sr"] = simulation_results

        if ui_state is not None:
            parts.append("UiState = :us")
            values[":us"] = ui_state

        if documentation is not None:
            parts.append("Documentation = :doc")
            values[":doc"] = documentation

        if folder_id is not None:
            parts.append("FolderId = :fid")
            values[":fid"] = folder_id

        params: Dict[str, Any] = {
            "Key": {
                "PK": f"USER#{user_id}",
                "SK": f"PROJECT#{project_id}",
            },
            "UpdateExpression": ", ".join(parts),
            "ExpressionAttributeValues": _to_dynamodb(values),
            "ReturnValues": "ALL_NEW",
        }
        if names:
            params["ExpressionAttributeNames"] = names

        resp = self.table.update_item(**params)
        return self._to_dict(resp["Attributes"])

    # ── delete ────────────────────────────────────────────────────────────

    async def delete_project(self, project_id: str) -> bool:
        project = await self.get_project(project_id)
        if not project:
            return False

        self.table.delete_item(
            Key={
                "PK": f"USER#{project['user_id']}",
                "SK": f"PROJECT#{project_id}",
            }
        )
        return True

    # ── helpers ───────────────────────────────────────────────────────────

    @staticmethod
    def _to_dict(item: Dict[str, Any]) -> Dict[str, Any]:
        """Convert a DynamoDB item to a plain project dict."""

        # Support both PascalCase (new) and snake_case (legacy) attribute names.
        def pick(*keys, default=None):
            for k in keys:
                if k in item:
                    return item[k]
            return default

        return {
            "id": pick("ProjectId", "project_id"),
            "user_id": pick("UserId", "user_id"),
            "name": pick("Name", "name", default=""),
            "description": pick("Description", "description", default=""),
            "design_state": _from_dynamodb(pick("DesignState", "design_state", default={})),
            "simulation_config": _from_dynamodb(
                pick("SimulationConfig", "simulation_config", default={})
            ),
            "simulation_results": _from_dynamodb(
                pick("SimulationResults", "simulation_results", default={})
            ),
            "ui_state": _from_dynamodb(pick("UiState", "ui_state", default={})),
            "documentation": _from_dynamodb(pick("Documentation", "documentation", default={})),
            "folder_id": pick("FolderId", "folder_id", default="") or None,
            "created_at": pick("CreatedAt", "created_at"),
            "updated_at": pick("UpdatedAt", "updated_at"),
        }
