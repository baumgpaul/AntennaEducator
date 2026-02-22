"""Unit tests for DynamoDB repository documentation field support.

Tests that the repository correctly persists and retrieves the
`documentation` metadata field alongside other project fields.
"""

from unittest.mock import MagicMock

import pytest

from backend.common.repositories.dynamodb_repository import DynamoDBProjectRepository


class TestDynamoDBRepositoryDocumentation:
    """Test documentation field in DynamoDB repository operations."""

    @pytest.fixture
    def mock_table(self):
        """Create a mock DynamoDB table."""
        return MagicMock()

    @pytest.fixture
    def repo(self, mock_table):
        """Create a DynamoDBProjectRepository with mocked table."""
        repo = DynamoDBProjectRepository(table_name="test-table")
        repo._table = mock_table
        return repo

    # ── _to_dict tests ────────────────────────────────────────────────────

    def test_to_dict_includes_documentation(self):
        """_to_dict should include documentation field from DynamoDB item."""
        item = {
            "ProjectId": "proj-1",
            "UserId": "user-1",
            "Name": "Test",
            "Description": "",
            "DesignState": {},
            "SimulationConfig": {},
            "SimulationResults": {},
            "UiState": {},
            "Documentation": {
                "has_content": True,
                "image_keys": ["img.png"],
                "last_edited": "2026-02-22T10:00:00+00:00",
                "last_edited_by": "user-1",
            },
            "CreatedAt": "2026-01-01T00:00:00+00:00",
            "UpdatedAt": "2026-01-01T00:00:00+00:00",
        }
        result = DynamoDBProjectRepository._to_dict(item)

        assert result["documentation"] == {
            "has_content": True,
            "image_keys": ["img.png"],
            "last_edited": "2026-02-22T10:00:00+00:00",
            "last_edited_by": "user-1",
        }

    def test_to_dict_documentation_defaults_to_empty_dict(self):
        """_to_dict should return empty dict when Documentation is missing."""
        item = {
            "ProjectId": "proj-1",
            "UserId": "user-1",
            "Name": "Test",
            "Description": "",
            "DesignState": {},
            "SimulationConfig": {},
            "SimulationResults": {},
            "UiState": {},
            "CreatedAt": "2026-01-01T00:00:00+00:00",
            "UpdatedAt": "2026-01-01T00:00:00+00:00",
        }
        result = DynamoDBProjectRepository._to_dict(item)
        assert result["documentation"] == {}

    # ── create_project tests ──────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_create_project_initializes_documentation(self, repo, mock_table):
        """create_project should initialize Documentation as empty dict."""
        mock_table.put_item = MagicMock()

        await repo.create_project(user_id="user-1", name="New Project")

        call_args = mock_table.put_item.call_args
        item = call_args[1]["Item"] if "Item" in call_args[1] else call_args[0][0]
        assert "Documentation" in item
        assert item["Documentation"] == {}

    # ── update_project tests ──────────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_update_project_with_documentation(self, repo, mock_table):
        """update_project should persist documentation when provided."""
        # Mock get_project to return existing project
        existing_item = {
            "Items": [
                {
                    "ProjectId": "proj-1",
                    "UserId": "user-1",
                    "Name": "Test",
                    "Description": "",
                    "DesignState": {},
                    "SimulationConfig": {},
                    "SimulationResults": {},
                    "UiState": {},
                    "Documentation": {},
                    "CreatedAt": "2026-01-01T00:00:00+00:00",
                    "UpdatedAt": "2026-01-01T00:00:00+00:00",
                }
            ]
        }
        mock_table.query.return_value = existing_item

        updated_attrs = dict(existing_item["Items"][0])
        updated_attrs["Documentation"] = {
            "has_content": True,
            "image_keys": ["img.png"],
        }
        mock_table.update_item.return_value = {"Attributes": updated_attrs}

        doc_meta = {"has_content": True, "image_keys": ["img.png"]}
        result = await repo.update_project(
            project_id="proj-1",
            documentation=doc_meta,
        )

        # Verify update_item was called with Documentation in expression
        call_kwargs = mock_table.update_item.call_args[1]
        assert "Documentation" in call_kwargs["UpdateExpression"]

        # Verify result includes documentation
        assert result["documentation"]["has_content"] is True

    @pytest.mark.asyncio
    async def test_update_project_without_documentation_leaves_unchanged(self, repo, mock_table):
        """update_project without documentation param should not touch it."""
        existing_item = {
            "Items": [
                {
                    "ProjectId": "proj-1",
                    "UserId": "user-1",
                    "Name": "Test",
                    "Description": "",
                    "DesignState": {},
                    "SimulationConfig": {},
                    "SimulationResults": {},
                    "UiState": {},
                    "Documentation": {"has_content": True},
                    "CreatedAt": "2026-01-01T00:00:00+00:00",
                    "UpdatedAt": "2026-01-01T00:00:00+00:00",
                }
            ]
        }
        mock_table.query.return_value = existing_item
        mock_table.update_item.return_value = {"Attributes": existing_item["Items"][0]}

        result = await repo.update_project(
            project_id="proj-1",
            name="Updated Name",
        )

        # Documentation should NOT appear in the UpdateExpression
        call_kwargs = mock_table.update_item.call_args[1]
        assert "Documentation" not in call_kwargs["UpdateExpression"]
