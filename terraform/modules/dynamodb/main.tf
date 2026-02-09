# DynamoDB Module - Application Database
# Single-table design for antenna simulator data

resource "aws_dynamodb_table" "main" {
  name         = var.table_name
  billing_mode = "PAY_PER_REQUEST"  # Serverless, scales automatically
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  # Global Secondary Index for alternate access patterns
  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  # Enable TTL for automatic cleanup of old data
  ttl {
    attribute_name = "TTL"
    enabled        = true
  }

  # Point-in-time recovery for backups
  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }

  # Stream for change data capture (optional, for future features)
  stream_enabled   = var.enable_streams
  stream_view_type = var.enable_streams ? "NEW_AND_OLD_IMAGES" : null

  tags = merge(
    var.tags,
    {
      Name        = var.table_name
      Description = "Main application database for antenna simulator"
    }
  )
}
