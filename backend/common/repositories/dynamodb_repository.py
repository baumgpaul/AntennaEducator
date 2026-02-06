"""DynamoDB implementation of ProjectRepository — v2.

Changes from v1:
- New JSON blob attributes: ``DesignState``, ``SimulationConfig``,
  ``SimulationResults``, ``UiState``
- Removed: ``RequestedFields``, ``ViewConfigurations``, ``SolverState``
"""

import os
import uuid
from datetime import datetime
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
    ) -> Dict[str, Any]:
        project_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()

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
            "DesignState": {},
            "SimulationConfig": {},
            "SimulationResults": {},
            "UiState": {},
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
    ) -> Dict[str, Any]:
        project = await self.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        user_id = project["user_id"]
        now = datetime.utcnow().isoformat()

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
        return {
            "id": item["ProjectId"],
            "user_id": item["UserId"],
            "name": item["Name"],
            "description": item.get("Description", ""),
            "design_state": _from_dynamodb(item.get("DesignState", {})),
            "simulation_config": _from_dynamodb(item.get("SimulationConfig", {})),
            "simulation_results": _from_dynamodb(item.get("SimulationResults", {})),
            "ui_state": _from_dynamodb(item.get("UiState", {})),
            "created_at": item["CreatedAt"],
            "updated_at": item["UpdatedAt"],
        }
