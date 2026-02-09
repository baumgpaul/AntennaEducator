"""Repository factory — selects DynamoDB implementation.

The ``USE_DYNAMODB`` env var controls which backend is used.
Currently only DynamoDB is implemented (both AWS and DynamoDB-Local).
"""

import os

from backend.common.repositories.base import ProjectRepository


def get_project_repository() -> ProjectRepository:
    """Return the appropriate ``ProjectRepository`` implementation.

    Environment variables:
        USE_DYNAMODB:          ``true`` → DynamoDB (default: ``true``)
        DYNAMODB_TABLE_NAME:   table name (default: ``antenna-simulator-staging``)
        DYNAMODB_ENDPOINT_URL: endpoint for DynamoDB-Local
    """
    use_dynamodb = os.getenv("USE_DYNAMODB", "true").lower() == "true"

    if use_dynamodb:
        from backend.common.repositories.dynamodb_repository import DynamoDBProjectRepository

        return DynamoDBProjectRepository()

    raise NotImplementedError("Only DynamoDB is supported. Set USE_DYNAMODB=true.")
