"""Simple test script to verify DynamoDB Local connectivity."""

import boto3
import time
from botocore.exceptions import ClientError

print("=== Testing DynamoDB Local ===\n")

# Configuration
endpoint = "http://localhost:8000"
region = "eu-west-1"
table_name = "test-table"

print(f"Endpoint: {endpoint}")
print(f"Region: {region}")
print(f"Table: {table_name}\n")

# Step 1: Create resource
print("Step 1: Creating boto3 resource...")
try:
    dynamodb = boto3.resource(
        'dynamodb',
        region_name=region,
        endpoint_url=endpoint,
        aws_access_key_id="dummy",
        aws_secret_access_key="dummy"
    )
    print("✓ Resource created\n")
except Exception as e:
    print(f"✗ Failed: {e}\n")
    exit(1)

# Step 2: List tables
print("Step 2: Listing tables...")
try:
    from botocore.config import Config
    config = Config(
        connect_timeout=5,
        read_timeout=5,
        retries={'max_attempts': 1}
    )
    client = boto3.client(
        'dynamodb',
        region_name=region,
        endpoint_url=endpoint,
        aws_access_key_id="dummy",
        aws_secret_access_key="dummy",
        config=config
    )
    response = client.list_tables()
    print(f"✓ Existing tables: {response.get('TableNames', [])}\n")
except Exception as e:
    print(f"✗ Failed: {e}\n")
    exit(1)

# Step 3: Create test table
print("Step 3: Creating test table...")
try:
    table = dynamodb.create_table(
        TableName=table_name,
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
    print("✓ Table creation initiated\n")
except ClientError as e:
    if e.response['Error']['Code'] == 'ResourceInUseException':
        print("✓ Table already exists\n")
        table = dynamodb.Table(table_name)
    else:
        print(f"✗ Failed: {e}\n")
        exit(1)

# Step 4: Load table metadata
print("Step 4: Loading table metadata (this is where it hangs)...")
start = time.time()
try:
    table.load()
    elapsed = time.time() - start
    print(f"✓ Table loaded in {elapsed:.2f}s")
    print(f"  Status: {table.table_status}")
    print(f"  Item count: {table.item_count}\n")
except Exception as e:
    elapsed = time.time() - start
    print(f"✗ Failed after {elapsed:.2f}s: {e}\n")
    exit(1)

# Step 5: Put item
print("Step 5: Writing test item...")
try:
    table.put_item(Item={'PK': 'TEST', 'SK': 'ITEM', 'data': 'hello'})
    print("✓ Item written\n")
except Exception as e:
    print(f"✗ Failed: {e}\n")
    exit(1)

# Step 6: Get item
print("Step 6: Reading test item...")
try:
    response = table.get_item(Key={'PK': 'TEST', 'SK': 'ITEM'})
    item = response.get('Item')
    print(f"✓ Item read: {item}\n")
except Exception as e:
    print(f"✗ Failed: {e}\n")
    exit(1)

print("=== All tests passed! ===")
