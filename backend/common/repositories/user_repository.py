"""DynamoDB User Repository - User management operations."""

import logging
import os
from datetime import datetime, timezone
from typing import Dict, Optional

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from backend.common.auth.token_costs import DEFAULT_STARTER_TOKENS

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
            connect_timeout=5, read_timeout=10, retries={"max_attempts": 3, "mode": "standard"}
        )

        if endpoint_url:
            # Local DynamoDB
            logger.info("Creating boto3 resource for DynamoDB Local...")
            self.dynamodb = boto3.resource(
                "dynamodb",
                region_name=self.region,
                endpoint_url=endpoint_url,
                aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID", "dummy"),
                aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY", "dummy"),
                config=config,
            )
            logger.info(f"Connected to DynamoDB Local at {endpoint_url}")
        else:
            # AWS DynamoDB
            logger.info("Creating boto3 resource for AWS DynamoDB...")
            self.dynamodb = boto3.resource("dynamodb", region_name=self.region, config=config)
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
            if e.response["Error"]["Code"] == "ResourceNotFoundException":
                logger.info("_ensure_table: Table not found, creating...")
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
                    {"AttributeName": "PK", "KeyType": "HASH"},
                    {"AttributeName": "SK", "KeyType": "RANGE"},
                ],
                AttributeDefinitions=[
                    {"AttributeName": "PK", "AttributeType": "S"},
                    {"AttributeName": "SK", "AttributeType": "S"},
                ],
                BillingMode="PAY_PER_REQUEST",
            )

            self.table = table
            logger.info(
                f"Table creation initiated for '{self.table_name}' (may take a few seconds)"
            )
        except ClientError as e:
            if e.response["Error"]["Code"] == "ResourceInUseException":
                # Table already exists
                logger.info(f"Table '{self.table_name}' already exists")
                self.table.load()
            else:
                logger.warning(f"Error creating table: {e} - will try to use existing table")
                # Don't fail - the table might exist or be creating

    def create_user(
        self,
        email: str,
        username: str,
        password_hash: str,
        is_admin: bool = False,
        is_locked: bool = False,
        cognito_sub: Optional[str] = None,
        role: Optional[str] = None,
    ) -> Dict:
        """
        Create a new user in DynamoDB.

        Args:
            email: User's email address
            username: Username
            password_hash: Hashed password
            is_admin: Admin status (default: False)
            is_locked: Locked status (default: False, users unlocked by default)
            cognito_sub: Cognito sub (optional, for AWS mode)

        Returns:
            User data dictionary (snake_case keys)

        Raises:
            ValueError: If user already exists
        """
        # Check if user exists
        if self.get_user_by_email(email):
            raise ValueError("Email already registered")

        # Generate user ID
        import uuid

        user_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        # Create user item — PascalCase attributes (consistent with project items)
        item = {
            "PK": f"USER#{user_id}",
            "SK": "METADATA",
            "EntityType": "USER",
            "UserId": user_id,
            "Email": email,
            "Username": username,
            "PasswordHash": password_hash,
            "IsAdmin": is_admin,
            "IsLocked": is_locked,
            "Role": role or ("admin" if is_admin else "user"),
            "CreatedAt": now,
            "SimulationTokens": DEFAULT_STARTER_TOKENS,
        }

        if cognito_sub:
            item["CognitoSub"] = cognito_sub

        try:
            self.table.put_item(Item=item)
            logger.info(f"Created user: {email} (id={user_id})")
            return self._to_dict(item)
        except ClientError as e:
            logger.error(f"Error creating user: {e}")
            raise RuntimeError(f"Failed to create user: {e}")

    def get_user_by_email(self, email: str) -> Optional[Dict]:
        """
        Get user by email address.

        Args:
            email: User's email address

        Returns:
            User data dictionary (snake_case) or None if not found
        """
        try:
            # Use scan with filter (no GSI for local simplicity)
            response = self.table.scan(
                FilterExpression="Email = :email AND SK = :sk",
                ExpressionAttributeValues={":email": email, ":sk": "METADATA"},
            )
            items = response.get("Items", [])
            if items:
                return self._to_dict(items[0])
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
            User data dictionary (snake_case) or None if not found
        """
        try:
            response = self.table.get_item(Key={"PK": f"USER#{user_id}", "SK": "METADATA"})
            item = response.get("Item")
            return self._to_dict(item) if item else None
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
                FilterExpression="begins_with(PK, :prefix) AND SK = :sk",
                ExpressionAttributeValues={":prefix": "USER#", ":sk": "METADATA"},
                Select="COUNT",
            )
            return response.get("Count", 0)
        except ClientError as e:
            logger.error(f"Error counting users: {e}")
            return 0

    def update_user_approval(self, user_id: str, is_approved: bool, is_admin: bool = False):
        """
        Update user approval and admin status (deprecated — prefer update_user_role).

        Args:
            user_id: User ID
            is_approved: Approval status (no longer stored, kept for API compat)
            is_admin: Admin status
        """
        try:
            self.table.update_item(
                Key={"PK": f"USER#{user_id}", "SK": "METADATA"},
                UpdateExpression="SET IsAdmin = :admin, #r = :role",
                ExpressionAttributeValues={
                    ":admin": is_admin,
                    ":role": "admin" if is_admin else "user",
                },
                ExpressionAttributeNames={"#r": "Role"},
            )
            logger.info(f"Updated user {user_id}: admin={is_admin}")
        except ClientError as e:
            logger.error(f"Error updating user approval: {e}")
            raise RuntimeError(f"Failed to update user: {e}")

    def update_user_role(self, user_id: str, role: str):
        """Update user role.

        Args:
            user_id: User ID
            role: New role ('user', 'maintainer', or 'admin')

        Raises:
            ValueError: If role is invalid
            RuntimeError: If DynamoDB update fails
        """
        valid_roles = ("user", "maintainer", "admin")
        if role not in valid_roles:
            raise ValueError(f"Invalid role '{role}'. Must be one of: {valid_roles}")

        is_admin = role == "admin"
        try:
            self.table.update_item(
                Key={"PK": f"USER#{user_id}", "SK": "METADATA"},
                UpdateExpression="SET #r = :role, IsAdmin = :admin",
                ExpressionAttributeValues={":role": role, ":admin": is_admin},
                ExpressionAttributeNames={"#r": "Role"},
            )
            logger.info(f"Updated user {user_id}: role={role}")
        except ClientError as e:
            logger.error(f"Error updating user role: {e}")
            raise RuntimeError(f"Failed to update user role: {e}")

    def update_user_lock_status(self, user_id: str, is_locked: bool):
        """
        Update user lock status.

        Args:
            user_id: User ID
            is_locked: True to lock user, False to unlock
        """
        try:
            self.table.update_item(
                Key={"PK": f"USER#{user_id}", "SK": "METADATA"},
                UpdateExpression="SET IsLocked = :locked",
                ExpressionAttributeValues={":locked": is_locked},
            )
            logger.info(f"Updated user {user_id}: is_locked={is_locked}")
        except ClientError as e:
            logger.error(f"Error updating user lock status: {e}")
            raise RuntimeError(f"Failed to update user: {e}")

    # ── token management ──────────────────────────────────────────────────

    def set_user_tokens(self, user_id: str, tokens: int) -> None:
        """Set a user's simulation token balance to an exact value."""
        try:
            self.table.update_item(
                Key={"PK": f"USER#{user_id}", "SK": "METADATA"},
                UpdateExpression="SET SimulationTokens = :tokens",
                ExpressionAttributeValues={":tokens": tokens},
            )
            logger.info("Set user %s tokens to %d", user_id, tokens)
        except ClientError as e:
            logger.error("Error setting tokens for user %s: %s", user_id, e)
            raise RuntimeError(f"Failed to set tokens: {e}")

    def deduct_user_tokens(self, user_id: str, cost: int) -> int:
        """Atomically deduct tokens. Returns remaining balance.

        Uses a DynamoDB conditional update to prevent overdraw.

        Raises:
            ValueError: If user has insufficient tokens.
        """
        try:
            response = self.table.update_item(
                Key={"PK": f"USER#{user_id}", "SK": "METADATA"},
                UpdateExpression="SET SimulationTokens = SimulationTokens - :cost",
                ConditionExpression="SimulationTokens >= :cost",
                ExpressionAttributeValues={":cost": cost},
                ReturnValues="ALL_NEW",
            )
            remaining = int(response["Attributes"]["SimulationTokens"])
            logger.info(
                "Deducted %d tokens from user %s (remaining: %d)",
                cost,
                user_id,
                remaining,
            )
            return remaining
        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise ValueError(f"Insufficient simulation tokens (need {cost})")
            logger.error("Error deducting tokens for user %s: %s", user_id, e)
            raise RuntimeError(f"Failed to deduct tokens: {e}")

    def set_user_flatrate(self, user_id: str, until: Optional[datetime]) -> None:
        """Grant or revoke a user's flatrate.

        Args:
            user_id: Target user.
            until: Expiry datetime (tz-aware), or None to revoke.
        """
        try:
            if until is not None:
                self.table.update_item(
                    Key={"PK": f"USER#{user_id}", "SK": "METADATA"},
                    UpdateExpression="SET FlatrateUntil = :flatrate",
                    ExpressionAttributeValues={":flatrate": until.isoformat()},
                )
                logger.info("Set flatrate for user %s until %s", user_id, until)
            else:
                self.table.update_item(
                    Key={"PK": f"USER#{user_id}", "SK": "METADATA"},
                    UpdateExpression="REMOVE FlatrateUntil",
                )
                logger.info("Removed flatrate for user %s", user_id)
        except ClientError as e:
            logger.error("Error setting flatrate for user %s: %s", user_id, e)
            raise RuntimeError(f"Failed to set flatrate: {e}")

    # ── helpers ───────────────────────────────────────────────────────────

    # ── usage logging ─────────────────────────────────────────────────────

    def log_token_usage(self, entry) -> None:
        """Write a usage log entry to DynamoDB.

        Item key: PK=USER#{user_id}, SK=USAGE#{timestamp}#{uuid_suffix}
        """
        import uuid

        suffix = str(uuid.uuid4())[:8]
        sk = f"USAGE#{entry.timestamp}#{suffix}"
        item = {
            "PK": f"USER#{entry.user_id}",
            "SK": sk,
            "EntityType": "USAGE",
            **entry.to_dict(),
        }
        try:
            self.table.put_item(Item=item)
        except ClientError as e:
            logger.error("Error logging token usage for user %s: %s", entry.user_id, e)
            raise RuntimeError(f"Failed to log token usage: {e}")

    def get_usage_history(self, user_id: str, limit: int = 50) -> list:
        """Query usage log entries for a user, newest first."""
        from boto3.dynamodb.conditions import Key

        try:
            response = self.table.query(
                KeyConditionExpression=(
                    Key("PK").eq(f"USER#{user_id}") & Key("SK").begins_with("USAGE#")
                ),
                ScanIndexForward=False,
                Limit=limit,
            )
            return [
                {
                    "service": item.get("Service", ""),
                    "endpoint": item.get("Endpoint", ""),
                    "cost": int(item.get("Cost", 0)),
                    "balance_after": int(item.get("BalanceAfter", 0)),
                    "was_flatrate": item.get("WasFlatrate", False),
                    "timestamp": item.get("Timestamp", ""),
                }
                for item in response.get("Items", [])
            ]
        except ClientError as e:
            logger.error("Error querying usage history for user %s: %s", user_id, e)
            return []

    # ── helpers ───────────────────────────────────────────────────────────

    @staticmethod
    def _to_dict(item: Dict) -> Dict:
        """Convert a PascalCase DynamoDB user item to a snake_case dict."""
        return {
            "user_id": item["UserId"],
            "email": item["Email"],
            "username": item.get("Username", item.get("Email", "").split("@")[0]),
            "password_hash": item.get("PasswordHash", ""),
            "is_admin": item.get("IsAdmin", False),
            "is_locked": item.get("IsLocked", False),
            "role": item.get("Role", "admin" if item.get("IsAdmin", False) else "user"),
            "created_at": item.get("CreatedAt"),
            "simulation_tokens": int(item.get("SimulationTokens", 0)),
            "flatrate_until": item.get("FlatrateUntil"),
        }
