"""DynamoDB Folder Repository — folder management for project organization.

Folders use an adjacency-list model (parent_folder_id) in the single-table
DynamoDB design.  Each folder is stored as:

    PK = USER#{owner_id}          (or ``SYSTEM`` for public course folders)
    SK = FOLDER#{folder_id}
    GSI1PK = FOLDER#{folder_id}   (for lookup by folder ID)
    GSI1SK = METADATA

Public course folders use ``PK = COURSES`` so they're queryable in one go.
"""

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

# Sentinel owner for orphaned course folders (creator deleted).
SYSTEM_OWNER = "SYSTEM"

# The virtual root PK used for all public course folders.
COURSES_PK = "COURSES"


class FolderRepository:
    """DynamoDB-based folder repository (single-table design)."""

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

    @property
    def table(self):
        if self._table is None:
            if self._dynamodb_resource:
                dynamo = self._dynamodb_resource
            else:
                endpoint = os.getenv("DYNAMODB_ENDPOINT_URL")
                dynamo = (
                    boto3.resource("dynamodb", endpoint_url=endpoint)
                    if endpoint
                    else boto3.resource("dynamodb")
                )
            self._table = dynamo.Table(self.table_name)
        return self._table

    # ── create ────────────────────────────────────────────────────────────

    async def create_folder(
        self,
        owner_id: str,
        name: str,
        *,
        parent_folder_id: Optional[str] = None,
        is_course: bool = False,
    ) -> Dict[str, Any]:
        """Create a new folder.

        Args:
            owner_id: User who owns the folder.
            name: Display name.
            parent_folder_id: Parent folder (None = root level).
            is_course: If True, this is a public course folder.

        Returns:
            Folder dict (snake_case keys).
        """
        folder_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        pk = COURSES_PK if is_course else f"USER#{owner_id}"
        item: Dict[str, Any] = {
            "PK": pk,
            "SK": f"FOLDER#{folder_id}",
            "GSI1PK": f"FOLDER#{folder_id}",
            "GSI1SK": "METADATA",
            "EntityType": "FOLDER",
            "FolderId": folder_id,
            "OwnerId": owner_id,
            "Name": name,
            "ParentFolderId": parent_folder_id or "",
            "IsCourse": is_course,
            "CreatedAt": now,
            "UpdatedAt": now,
        }
        self.table.put_item(Item=item)
        return self._to_dict(item)

    # ── read ──────────────────────────────────────────────────────────────

    async def get_folder(self, folder_id: str) -> Optional[Dict[str, Any]]:
        """Get a folder by ID (via GSI1)."""
        try:
            resp = self.table.query(
                IndexName="GSI1",
                KeyConditionExpression="GSI1PK = :pk AND GSI1SK = :sk",
                ExpressionAttributeValues={
                    ":pk": f"FOLDER#{folder_id}",
                    ":sk": "METADATA",
                },
            )
            items = resp.get("Items", [])
            return self._to_dict(items[0]) if items else None
        except ClientError as exc:
            logger.error("Error getting folder %s: %s", folder_id, exc)
            return None

    async def list_user_folders(
        self, user_id: str, *, parent_folder_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """List folders owned by a user, optionally filtered by parent."""
        resp = self.table.query(
            KeyConditionExpression="PK = :pk AND begins_with(SK, :prefix)",
            ExpressionAttributeValues={
                ":pk": f"USER#{user_id}",
                ":prefix": "FOLDER#",
            },
        )
        folders = [self._to_dict(i) for i in resp.get("Items", [])]

        if parent_folder_id is not None:
            folders = [f for f in folders if f["parent_folder_id"] == parent_folder_id]

        return folders

    async def list_course_folders(
        self, *, parent_folder_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """List public course folders, optionally filtered by parent."""
        resp = self.table.query(
            KeyConditionExpression="PK = :pk AND begins_with(SK, :prefix)",
            ExpressionAttributeValues={
                ":pk": COURSES_PK,
                ":prefix": "FOLDER#",
            },
        )
        folders = [self._to_dict(i) for i in resp.get("Items", [])]

        if parent_folder_id is not None:
            folders = [f for f in folders if f["parent_folder_id"] == parent_folder_id]

        return folders

    # ── update ────────────────────────────────────────────────────────────

    async def update_folder(
        self,
        folder_id: str,
        *,
        name: Optional[str] = None,
        parent_folder_id: Optional[str] = None,
        owner_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Update folder attributes.

        Raises:
            ValueError: If folder not found.
        """
        folder = await self.get_folder(folder_id)
        if not folder:
            raise ValueError(f"Folder {folder_id} not found")

        now = datetime.now(timezone.utc).isoformat()
        parts = ["SET UpdatedAt = :updated"]
        values: Dict[str, Any] = {":updated": now}
        names: Dict[str, str] = {}

        if name is not None:
            parts.append("#name = :name")
            values[":name"] = name
            names["#name"] = "Name"

        if parent_folder_id is not None:
            parts.append("ParentFolderId = :pfid")
            values[":pfid"] = parent_folder_id

        if owner_id is not None:
            parts.append("OwnerId = :oid")
            values[":oid"] = owner_id

        pk = COURSES_PK if folder["is_course"] else f"USER#{folder['owner_id']}"
        params: Dict[str, Any] = {
            "Key": {"PK": pk, "SK": f"FOLDER#{folder_id}"},
            "UpdateExpression": ", ".join(parts),
            "ExpressionAttributeValues": values,
            "ReturnValues": "ALL_NEW",
        }
        if names:
            params["ExpressionAttributeNames"] = names

        resp = self.table.update_item(**params)
        return self._to_dict(resp["Attributes"])

    # ── delete ────────────────────────────────────────────────────────────

    async def delete_folder(self, folder_id: str) -> bool:
        """Delete a folder. Does NOT cascade-delete children."""
        folder = await self.get_folder(folder_id)
        if not folder:
            return False

        pk = COURSES_PK if folder["is_course"] else f"USER#{folder['owner_id']}"
        self.table.delete_item(Key={"PK": pk, "SK": f"FOLDER#{folder_id}"})
        return True

    async def list_subfolders(self, folder_id: str) -> List[Dict[str, Any]]:
        """List direct child folders of a given folder (any PK)."""
        # We need to scan by ParentFolderId — for small datasets this is OK.
        # For scale, a GSI on ParentFolderId would be better.
        folder = await self.get_folder(folder_id)
        if not folder:
            return []

        pk = COURSES_PK if folder["is_course"] else f"USER#{folder['owner_id']}"
        resp = self.table.query(
            KeyConditionExpression="PK = :pk AND begins_with(SK, :prefix)",
            FilterExpression="ParentFolderId = :pfid",
            ExpressionAttributeValues={
                ":pk": pk,
                ":prefix": "FOLDER#",
                ":pfid": folder_id,
            },
        )
        return [self._to_dict(i) for i in resp.get("Items", [])]

    async def reassign_course_owner(self, folder_id: str, new_owner_id: str) -> Dict[str, Any]:
        """Admin action: reassign a course folder to a new owner.

        Raises:
            ValueError: If the folder is not a course or not found.
        """
        folder = await self.get_folder(folder_id)
        if not folder:
            raise ValueError(f"Folder {folder_id} not found")
        if not folder["is_course"]:
            raise ValueError(f"Folder {folder_id} is not a course folder")

        return await self.update_folder(folder_id, owner_id=new_owner_id)

    async def orphan_user_courses(self, user_id: str) -> int:
        """When a user is deleted, reassign their course folders to SYSTEM.

        Returns:
            Number of folders reassigned.
        """
        courses = await self.list_course_folders()
        count = 0
        for c in courses:
            if c["owner_id"] == user_id:
                await self.update_folder(c["id"], owner_id=SYSTEM_OWNER)
                count += 1
        return count

    # ── helpers ───────────────────────────────────────────────────────────

    @staticmethod
    def _to_dict(item: Dict[str, Any]) -> Dict[str, Any]:
        """Convert a DynamoDB folder item to a plain dict."""
        return {
            "id": item.get("FolderId", ""),
            "owner_id": item.get("OwnerId", ""),
            "name": item.get("Name", ""),
            "parent_folder_id": item.get("ParentFolderId", "") or None,
            "is_course": item.get("IsCourse", False),
            "created_at": item.get("CreatedAt"),
            "updated_at": item.get("UpdatedAt"),
        }
