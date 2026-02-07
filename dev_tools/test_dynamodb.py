"""Test DynamoDB repository with DynamoDB Local."""

import asyncio
import os

import boto3

from backend.common.repositories.dynamodb_repository import DynamoDBProjectRepository


async def test_dynamodb_project_repository():
    """Test DynamoDB project repository operations."""

    # Connect to DynamoDB Local (assuming it's running on localhost:8000)
    dynamodb = boto3.resource(
        "dynamodb",
        endpoint_url="http://localhost:8000",
        region_name="eu-west-1",
        aws_access_key_id="local",
        aws_secret_access_key="local",
    )

    # Check if table exists, create if not
    table_name = "antenna-simulator-test"

    try:
        table = dynamodb.Table(table_name)
        table.load()
        print(f"✅ Table {table_name} exists")
    except:
        print(f"Creating table {table_name}...")
        table = dynamodb.create_table(
            TableName=table_name,
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "PK", "AttributeType": "S"},
                {"AttributeName": "SK", "AttributeType": "S"},
                {"AttributeName": "GSI1PK", "AttributeType": "S"},
                {"AttributeName": "GSI1SK", "AttributeType": "S"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "GSI1",
                    "KeySchema": [
                        {"AttributeName": "GSI1PK", "KeyType": "HASH"},
                        {"AttributeName": "GSI1SK", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                }
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        table.wait_until_exists()
        print(f"✅ Table {table_name} created")

    # Initialize repository
    repo = DynamoDBProjectRepository(table_name=table_name, dynamodb_resource=dynamodb)

    print("\n=== Testing DynamoDB Project Repository ===\n")

    # Test 1: Create project
    print("1. Creating project...")
    project = await repo.create_project(
        user_id="test-user-123",
        name="Test Dipole Antenna",
        description="Testing DynamoDB repository",
    )
    print(f"✅ Created project: {project['id']}")
    print(f"   Name: {project['name']}")
    print(f"   User: {project['user_id']}")

    project_id = project["id"]

    # Test 2: Get project by ID
    print("\n2. Getting project by ID...")
    retrieved = await repo.get_project(project_id)
    print(f"✅ Retrieved project: {retrieved['name']}")

    # Test 3: List projects for user
    print("\n3. Listing projects for user...")
    projects = await repo.list_projects("test-user-123")
    print(f"✅ Found {len(projects)} project(s)")
    for p in projects:
        print(f"   - {p['name']} ({p['id']})")

    # Test 4: Update project
    print("\n4. Updating project...")
    updated = await repo.update_project(
        project_id=project_id,
        name="Updated Dipole Design",
        description="Updated description",
        requested_fields=[{"type": "E-field", "region": "box"}],
    )
    print(f"✅ Updated project: {updated['name']}")
    print(f"   Fields: {updated['requested_fields']}")

    # Test 5: Delete project
    print("\n5. Deleting project...")
    deleted = await repo.delete_project(project_id)
    print(f"✅ Deleted: {deleted}")

    # Verify deletion
    retrieved_after = await repo.get_project(project_id)
    print(f"✅ Verified deletion: project is None = {retrieved_after is None}")

    print("\n=== All tests passed! ===")


if __name__ == "__main__":
    asyncio.run(test_dynamodb_project_repository())
