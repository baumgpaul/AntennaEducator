"""DynamoDB User Repository - User management operations."""

import os
import logging
from datetime import datetime, timezone
from typing import Optional, Dict
import boto3
from botocore.exceptions import ClientError
from botocore.config import Config

logger = logging.getLogger(__name__)


class UserRepository:
    """DynamoDB-based user repository."""
    
    def __init__(self):
        """Initialize DynamoDB client."""
        logger.info("=== UserRepository.__init__ START ===")
        self.region = os.getenv("AWS_DEFAULT_REGION", "eu-west-1")
        endpoint_url = os.getenv("DYNAMODB_ENDPOINT_URL")
        
        logger.info(f"Region: {self.region}")
        logger.info(f"Endpoint URL: {endpoint_url}")
        
        # Configure timeouts for reliability
        config = Config(
            connect_timeout=5,
            read_timeout=10,
            retries={'max_attempts': 3, 'mode': 'standard'}
        )
        
        if endpoint_url:
            # Local DynamoDB
            logger.info("Creating boto3 resource for DynamoDB Local...")
            self.dynamodb = boto3.resource(
                'dynamodb',
                region_name=self.region,
                endpoint_url=endpoint_url,
                aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID", "dummy"),
                aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", "dummy"),
                config=config
            )
            logger.info(f"Connected to DynamoDB Local at {endpoint_url}")
        else:
            # AWS DynamoDB
            logger.info("Creating boto3 resource for AWS DynamoDB...")
            self.dynamodb = boto3.resource('dynamodb', region_name=self.region, config=config)
            logger.info(f"Connected to AWS DynamoDB in {self.region}")
        
        self.table_name = os.getenv("DYNAMODB_TABLE_NAME", "antenna-simulator-staging")
        logger.info(f"Table name: {self.table_name}")
        
        logger.info("Getting table reference...")
        self.table = self.dynamodb.Table(self.table_name)
        logger.info("Table reference obtained")
        
        # Ensure table exists
        logger.info("Calling _ensure_table()...")
        self._ensure_table()
        logger.info("=== UserRepository.__init__ COMPLETE ===")
    
    def _ensure_table(self):
        """Ensure the DynamoDB table exists, create if not."""
        logger.info("_ensure_table: START")
        try:
            logger.info("_ensure_table: Calling table.load()...")
            self.table.load()
            logger.info(f"_ensure_table: Table '{self.table_name}' exists and is ready")
            logger.info(f"_ensure_table: Table status = {self.table.table_status}")
        except ClientError as e:
            logger.info(f"_ensure_table: ClientError caught: {e.response['Error']['Code']}")
            if e.response['Error']['Code'] == 'ResourceNotFoundException':
                logger.info(f"_ensure_table: Table not found, creating...")
                self._create_table()
            else:
                logger.error(f"_ensure_table: Error checking table: {e}")
                # Don't raise - try to use table anyway
        except Exception as e:
            logger.error(f"_ensure_table: Unexpected error: {type(e).__name__}: {e}")
        logger.info("_ensure_table: END")

    
    def _create_table(self):
        """Create the DynamoDB table (non-blocking)."""
        try:
            # Create table without waiting
            table = self.dynamodb.create_table(
                TableName=self.table_name,
                KeySchema=[
                    {'AttributeName': 'PK', 'KeyType': 'HASH'},
                    {'AttributeName': 'SK', 'KeyType': 'RANGE'}
                ],
                AttributeDefinitions=[
                    {'AttributeName': 'PK', 'AttributeType': 'S'},
                    {'AttributeName': 'SK', 'AttributeType': 'S'}
                ],
                BillingMode='PAY_PER_REQUEST'
            )
            
            self.table = table
            logger.info(f"Table creation initiated for '{self.table_name}' (may take a few seconds)")
        except ClientError as e:
            if e.response['Error']['Code'] == 'ResourceInUseException':
                # Table already exists
                logger.info(f"Table '{self.table_name}' already exists")
                self.table.load()
            else:
                logger.warning(f"Error creating table: {e} - will try to use existing table")
                # Don't fail - the table might exist or be creating
    
    def create_user(self, email: str, username: str, password_hash: str, 
                   is_admin: bool = False, is_approved: bool = True,
                   is_locked: bool = False,
                   cognito_sub: Optional[str] = None) -> Dict:
        """
        Create a new user in DynamoDB.
        
        Args:
            email: User's email address
            username: Username
            password_hash: Hashed password
            is_admin: Admin status (default: False)
            is_approved: Approval status (default: True, deprecated - use is_locked)
            is_locked: Locked status (default: False, users unlocked by default)
            cognito_sub: Cognito sub (optional, for AWS mode)
            
        Returns:
            User data dictionary
            
        Raises:
            ValueError: If user already exists
        """
        # Check if user exists
        if self.get_user_by_email(email):
            raise ValueError("Email already registered")
        
        # Generate user ID
        import uuid
        user_id = str(uuid.uuid4())
        
        # Create user item
        item = {
            'PK': f'USER#{user_id}',
            'SK': 'METADATA',
            'user_id': user_id,
            'email': email,
            'username': username,
            'password_hash': password_hash,
            'is_admin': is_admin,
            'is_approved': is_approved,  # Keep for backward compatibility
            'is_locked': is_locked,  # New field - users unlocked by default
            'created_at': datetime.now(timezone.utc).isoformat(),
            'entity_type': 'user'
        }
        
        if cognito_sub:
            item['cognito_sub'] = cognito_sub
        
        try:
            self.table.put_item(Item=item)
            logger.info(f"Created user: {email} (id={user_id})")
            return item
        except ClientError as e:
            logger.error(f"Error creating user: {e}")
            raise RuntimeError(f"Failed to create user: {e}")
    
    def get_user_by_email(self, email: str) -> Optional[Dict]:
        """
        Get user by email address.
        
        Args:
            email: User's email address
            
        Returns:
            User data dictionary or None if not found
        """
        try:
            # Use scan with filter (no GSI for local simplicity)
            response = self.table.scan(
                FilterExpression='email = :email AND SK = :sk',
                ExpressionAttributeValues={
                    ':email': email,
                    ':sk': 'METADATA'
                }
            )
            items = response.get('Items', [])
            if items:
                return items[0]
            return None
        except ClientError as e:
            logger.error(f"Error querying user by email: {e}")
            return None
    
    def get_user_by_id(self, user_id: str) -> Optional[Dict]:
        """
        Get user by user ID.
        
        Args:
            user_id: User ID
            
        Returns:
            User data dictionary or None if not found
        """
        try:
            response = self.table.get_item(
                Key={
                    'PK': f'USER#{user_id}',
                    'SK': 'METADATA'
                }
            )
            return response.get('Item')
        except ClientError as e:
            logger.error(f"Error getting user by ID: {e}")
            return None
    
    def get_user_count(self) -> int:
        """
        Get total number of users.
        
        Returns:
            Number of users
        """
        try:
            response = self.table.scan(
                FilterExpression='begins_with(PK, :prefix) AND SK = :sk',
                ExpressionAttributeValues={
                    ':prefix': 'USER#',
                    ':sk': 'METADATA'
                },
                Select='COUNT'
            )
            return response.get('Count', 0)
        except ClientError as e:
            logger.error(f"Error counting users: {e}")
            return 0
    
    def update_user_approval(self, user_id: str, is_approved: bool, is_admin: bool = False):
        """
        Update user approval status (deprecated - use update_user_lock_status).
        
        Args:
            user_id: User ID
            is_approved: Approval status
            is_admin: Admin status
        """
        try:
            self.table.update_item(
                Key={
                    'PK': f'USER#{user_id}',
                    'SK': 'METADATA'
                },
                UpdateExpression='SET is_approved = :approved, is_admin = :admin',
                ExpressionAttributeValues={
                    ':approved': is_approved,
                    ':admin': is_admin
                }
            )
            logger.info(f"Updated user {user_id}: approved={is_approved}, admin={is_admin}")
        except ClientError as e:
            logger.error(f"Error updating user approval: {e}")
            raise RuntimeError(f"Failed to update user: {e}")
    
    def update_user_lock_status(self, user_id: str, is_locked: bool):
        """
        Update user lock status.
        
        Args:
            user_id: User ID
            is_locked: True to lock user, False to unlock
        """
        try:
            self.table.update_item(
                Key={
                    'PK': f'USER#{user_id}',
                    'SK': 'METADATA'
                },
                UpdateExpression='SET is_locked = :locked',
                ExpressionAttributeValues={
                    ':locked': is_locked
                }
            )
            logger.info(f"Updated user {user_id}: is_locked={is_locked}")
        except ClientError as e:
            logger.error(f"Error updating user lock status: {e}")
            raise RuntimeError(f"Failed to update user: {e}")
