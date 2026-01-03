"""DynamoDB implementation of repositories - Minimal working version."""

import os
import boto3
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid
from backend.common.repositories.base import ProjectRepository


class DynamoDBProjectRepository(ProjectRepository):
    """DynamoDB implementation of ProjectRepository."""
    
    def __init__(self, table_name: Optional[str] = None, dynamodb_resource=None):
        """
        Initialize DynamoDB repository.
        
        Args:
            table_name: DynamoDB table name (default: from env var)
            dynamodb_resource: boto3 DynamoDB resource (for testing/DynamoDB Local)
        """
        self.table_name = table_name or os.getenv("DYNAMODB_TABLE_NAME", "antenna-simulator-staging")
        
        if dynamodb_resource:
            self.dynamodb = dynamodb_resource
        else:
            # Check if using DynamoDB Local
            endpoint_url = os.getenv("DYNAMODB_ENDPOINT_URL")
            if endpoint_url:
                self.dynamodb = boto3.resource('dynamodb', endpoint_url=endpoint_url)
            else:
                self.dynamodb = boto3.resource('dynamodb')
        
        self.table = self.dynamodb.Table(self.table_name)
    
    async def create_project(
        self,
        user_id: str,
        name: str,
        description: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a new project."""
        project_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        
        item = {
            'PK': f'USER#{user_id}',
            'SK': f'PROJECT#{project_id}',
            'GSI1PK': f'PROJECT#{project_id}',
            'GSI1SK': 'METADATA',
            'EntityType': 'PROJECT',
            'ProjectId': project_id,
            'UserId': user_id,
            'Name': name,
            'Description': description or '',
            'RequestedFields': [],
            'ViewConfigurations': [],
            'SolverState': {},
            'CreatedAt': now,
            'UpdatedAt': now
        }
        
        self.table.put_item(Item=item)
        
        return self._item_to_project(item)
    
    async def get_project(self, project_id: str) -> Optional[Dict[str, Any]]:
        """Get project by ID using GSI."""
        response = self.table.query(
            IndexName='GSI1',
            KeyConditionExpression='GSI1PK = :pk AND GSI1SK = :sk',
            ExpressionAttributeValues={
                ':pk': f'PROJECT#{project_id}',
                ':sk': 'METADATA'
            }
        )
        
        items = response.get('Items', [])
        if not items:
            return None
        
        return self._item_to_project(items[0])
    
    async def list_projects(self, user_id: str) -> List[Dict[str, Any]]:
        """List all projects for a user."""
        response = self.table.query(
            KeyConditionExpression='PK = :pk AND begins_with(SK, :sk_prefix)',
            ExpressionAttributeValues={
                ':pk': f'USER#{user_id}',
                ':sk_prefix': 'PROJECT#'
            }
        )
        
        items = response.get('Items', [])
        return [self._item_to_project(item) for item in items]
    
    async def update_project(
        self,
        project_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        requested_fields: Optional[List[Dict]] = None,
        view_configurations: Optional[List[Dict]] = None,
        solver_state: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Update project."""
        # First get the project to find its PK
        project = await self.get_project(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")
        
        user_id = project['user_id']
        now = datetime.utcnow().isoformat()
        
        # Build update expression
        update_parts = ['SET UpdatedAt = :updated']
        expr_values = {':updated': now}
        
        if name is not None:
            update_parts.append('#name = :name')
            expr_values[':name'] = name
        
        if description is not None:
            update_parts.append('Description = :desc')
            expr_values[':desc'] = description
        
        if requested_fields is not None:
            update_parts.append('RequestedFields = :fields')
            expr_values[':fields'] = requested_fields
        
        if view_configurations is not None:
            update_parts.append('ViewConfigurations = :views')
            expr_values[':views'] = view_configurations
        
        if solver_state is not None:
            update_parts.append('SolverState = :state')
            expr_values[':state'] = solver_state
        
        update_expr = ', '.join(update_parts)
        expr_names = {'#name': 'Name'} if name is not None else None
        
        response = self.table.update_item(
            Key={
                'PK': f'USER#{user_id}',
                'SK': f'PROJECT#{project_id}'
            },
            UpdateExpression=update_expr,
            ExpressionAttributeValues=expr_values,
            ExpressionAttributeNames=expr_names,
            ReturnValues='ALL_NEW'
        )
        
        return self._item_to_project(response['Attributes'])
    
    async def delete_project(self, project_id: str) -> bool:
        """Delete project."""
        # First get the project to find its PK
        project = await self.get_project(project_id)
        if not project:
            return False
        
        user_id = project['user_id']
        
        self.table.delete_item(
            Key={
                'PK': f'USER#{user_id}',
                'SK': f'PROJECT#{project_id}'
            }
        )
        
        return True
    
    def _item_to_project(self, item: Dict[str, Any]) -> Dict[str, Any]:
        """Convert DynamoDB item to project dict."""
        return {
            'id': item['ProjectId'],
            'user_id': item['UserId'],
            'name': item['Name'],
            'description': item.get('Description', ''),
            'requested_fields': item.get('RequestedFields', []),
            'view_configurations': item.get('ViewConfigurations', []),
            'solver_state': item.get('SolverState', {}),
            'created_at': item['CreatedAt'],
            'updated_at': item['UpdatedAt']
        }
