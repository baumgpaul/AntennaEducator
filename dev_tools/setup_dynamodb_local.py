# Setup DynamoDB Local for Testing
# This script creates the table schema in DynamoDB Local

import boto3
import time
from botocore.exceptions import ClientError

# Connect to DynamoDB Local
dynamodb = boto3.resource(
    'dynamodb',
    endpoint_url='http://localhost:8000',
    region_name='us-east-1',
    aws_access_key_id='local',
    aws_secret_access_key='local'
)

dynamodb_client = boto3.client(
    'dynamodb',
    endpoint_url='http://localhost:8000',
    region_name='us-east-1',
    aws_access_key_id='local',
    aws_secret_access_key='local'
)

TABLE_NAME = 'antenna-simulator-local'

def delete_table_if_exists():
    """Delete table if it already exists."""
    try:
        table = dynamodb.Table(TABLE_NAME)
        table.delete()
        print(f"Deleting existing table '{TABLE_NAME}'...")
        dynamodb_client.get_waiter('table_not_exists').wait(TableName=TABLE_NAME)
        print(f"✓ Table '{TABLE_NAME}' deleted")
    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceNotFoundException':
            print(f"Table '{TABLE_NAME}' does not exist")
        else:
            raise

def create_table():
    """Create the DynamoDB table with schema."""
    print(f"\nCreating table '{TABLE_NAME}'...")
    
    try:
        table = dynamodb.create_table(
            TableName=TABLE_NAME,
            KeySchema=[
                {'AttributeName': 'PK', 'KeyType': 'HASH'},
                {'AttributeName': 'SK', 'KeyType': 'RANGE'}
            ],
            AttributeDefinitions=[
                {'AttributeName': 'PK', 'AttributeType': 'S'},
                {'AttributeName': 'SK', 'AttributeType': 'S'},
                {'AttributeName': 'GSI1PK', 'AttributeType': 'S'},
                {'AttributeName': 'GSI1SK', 'AttributeType': 'S'},
            ],
            GlobalSecondaryIndexes=[
                {
                    'IndexName': 'GSI1',
                    'KeySchema': [
                        {'AttributeName': 'GSI1PK', 'KeyType': 'HASH'},
                        {'AttributeName': 'GSI1SK', 'KeyType': 'RANGE'}
                    ],
                    'Projection': {'ProjectionType': 'ALL'},
                    'ProvisionedThroughput': {
                        'ReadCapacityUnits': 5,
                        'WriteCapacityUnits': 5
                    }
                }
            ],
            BillingMode='PROVISIONED',
            ProvisionedThroughput={
                'ReadCapacityUnits': 5,
                'WriteCapacityUnits': 5
            }
        )
        
        # Wait for table to be created
        print("Waiting for table to be created...")
        dynamodb_client.get_waiter('table_exists').wait(TableName=TABLE_NAME)
        
        print(f"✓ Table '{TABLE_NAME}' created successfully")
        print(f"\nTable ARN: {table.table_arn}")
        print(f"Table Status: {table.table_status}")
        
        return table
        
    except ClientError as e:
        if e.response['Error']['Code'] == 'ResourceInUseException':
            print(f"✓ Table '{TABLE_NAME}' already exists")
            return dynamodb.Table(TABLE_NAME)
        else:
            raise

def verify_table():
    """Verify table schema."""
    print("\nVerifying table schema...")
    
    table = dynamodb.Table(TABLE_NAME)
    
    print(f"  Table Name: {table.table_name}")
    print(f"  Item Count: {table.item_count}")
    print(f"  Key Schema: {table.key_schema}")
    print(f"  Global Secondary Indexes:")
    for gsi in table.global_secondary_indexes or []:
        print(f"    - {gsi['IndexName']}: {gsi['KeySchema']}")
    
    print("\n✓ Table schema verified")

def insert_test_data():
    """Insert test data to verify table works."""
    print("\nInserting test data...")
    
    table = dynamodb.Table(TABLE_NAME)
    
    test_user_id = "test-user-123"
    test_project_id = "test-project-456"
    
    # Insert test project
    table.put_item(Item={
        'PK': f'USER#{test_user_id}',
        'SK': f'PROJECT#{test_project_id}',
        'GSI1PK': f'PROJECT#{test_project_id}',
        'GSI1SK': 'METADATA',
        'EntityType': 'PROJECT',
        'Data': {
            'name': 'Test Project',
            'description': 'Local test project',
            'elements': []
        },
        'CreatedAt': '2026-01-04T12:00:00Z',
        'UpdatedAt': '2026-01-04T12:00:00Z'
    })
    
    print(f"✓ Inserted test project: {test_project_id}")
    
    # Query back to verify
    response = table.query(
        KeyConditionExpression='PK = :pk',
        ExpressionAttributeValues={':pk': f'USER#{test_user_id}'}
    )
    
    print(f"✓ Query returned {response['Count']} items")
    if response['Items']:
        print(f"  Project: {response['Items'][0]['Data']['name']}")

def main():
    print("=" * 60)
    print("DynamoDB Local Setup")
    print("=" * 60)
    
    try:
        # Delete existing table
        delete_table_if_exists()
        
        # Create new table
        create_table()
        
        # Verify schema
        verify_table()
        
        # Insert test data
        insert_test_data()
        
        print("\n" + "=" * 60)
        print("✅ Setup complete! DynamoDB Local is ready.")
        print("=" * 60)
        print(f"\nTable Name: {TABLE_NAME}")
        print(f"Endpoint: http://localhost:8000")
        print(f"\nYou can now start the projects service with:")
        print(f"  USE_DYNAMODB=true")
        print(f"  DYNAMODB_TABLE={TABLE_NAME}")
        print(f"  DYNAMODB_ENDPOINT=http://localhost:8000")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == '__main__':
    exit(main())
