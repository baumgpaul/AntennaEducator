# DynamoDB Module

Creates a DynamoDB table with single-table design for the antenna simulator application.

## Features

- **Single-table design**: All entities (users, projects, results) in one table
- **Composite keys**: PK (partition key) + SK (sort key) for flexible queries
- **Global Secondary Index**: GSI1 for alternate access patterns
- **TTL enabled**: Automatic cleanup of expired data
- **Point-in-time recovery**: Backups for disaster recovery
- **PAY_PER_REQUEST**: Serverless billing, no capacity planning needed

## Table Schema

| Attribute | Type | Description |
|-----------|------|-------------|
| PK | String | Partition key (e.g., USER#uuid, PROJECT#uuid) |
| SK | String | Sort key (e.g., METADATA, PROJECT#uuid) |
| GSI1PK | String | GSI partition key (e.g., EMAIL#user@example.com) |
| GSI1SK | String | GSI sort key |
| EntityType | String | USER, PROJECT, RESULT, ELEMENT |
| Data | Map | Entity-specific attributes |
| CreatedAt | String | ISO 8601 timestamp |
| UpdatedAt | String | ISO 8601 timestamp |
| TTL | Number | Unix timestamp for expiration |

## Access Patterns

See the project [README.md](../../../README.md) for access patterns and deployment details.

## Usage

```hcl
module "dynamodb" {
  source      = "../../modules/dynamodb"

  table_name                     = "antenna-simulator-staging"
  enable_point_in_time_recovery  = true
  enable_streams                 = false

  tags = {
    Environment = "staging"
    Project     = "antenna-simulator"
  }
}
```

## Cost

**PAY_PER_REQUEST billing**:
- $1.25 per million read requests
- $1.25 per million write requests
- $0.25/GB storage per month
- Free tier: 25 GB storage, 25 RCU/WCU per month

**Estimated cost for staging** (5 users, light usage):
- Requests: ~10K/month = **$0.01**
- Storage: <1 GB = **$0.25**
- **Total: ~$0.26/month**
