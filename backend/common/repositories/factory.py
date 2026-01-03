"""Repository factory - Choose between PostgreSQL and DynamoDB."""

import os
from backend.common.repositories.base import ProjectRepository


def get_project_repository() -> ProjectRepository:
    """
    Get the appropriate ProjectRepository implementation.
    
    Returns:
        ProjectRepository instance (DynamoDB or PostgreSQL)
    
    Environment Variables:
        USE_DYNAMODB: Set to 'true' to use DynamoDB (default: false)
        DYNAMODB_TABLE_NAME: DynamoDB table name
        DYNAMODB_ENDPOINT_URL: DynamoDB endpoint (for DynamoDB Local)
    """
    use_dynamodb = os.getenv('USE_DYNAMODB', 'false').lower() == 'true'
    
    if use_dynamodb:
        from backend.common.repositories.dynamodb_repository import DynamoDBProjectRepository
        return DynamoDBProjectRepository()
    else:
        # Use PostgreSQL (existing implementation)
        # For now, return a placeholder - we'll integrate with existing code
        raise NotImplementedError("PostgreSQL repository adapter not yet implemented")


# Additional repository factories (will be implemented)
def get_user_repository():
    """Get UserRepository implementation."""
    raise NotImplementedError("User repository factory not yet implemented")


def get_element_repository():
    """Get ElementRepository implementation."""
    raise NotImplementedError("Element repository factory not yet implemented")


def get_result_repository():
    """Get ResultRepository implementation."""
    raise NotImplementedError("Result repository factory not yet implemented")
