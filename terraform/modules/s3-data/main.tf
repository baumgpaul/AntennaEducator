# S3 Data Module - Private Storage for Meshes and Results
# Stores large files (mesh data, simulation results, exports)

resource "aws_s3_bucket" "data" {
  bucket = var.bucket_name

  tags = merge(
    var.tags,
    {
      Name        = var.bucket_name
      Description = "Private data storage for antenna simulator"
      Purpose     = "data-storage"
    }
  )
}

# Enable versioning (can recover deleted/overwritten files)
resource "aws_s3_bucket_versioning" "data" {
  bucket = aws_s3_bucket.data.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Encryption at rest (security requirement)
resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block ALL public access (this is private data)
resource "aws_s3_bucket_public_access_block" "data" {
  bucket = aws_s3_bucket.data.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle rules - move old data to cheaper storage
resource "aws_s3_bucket_lifecycle_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  rule {
    id     = "archive-old-results"
    status = var.enable_lifecycle ? "Enabled" : "Disabled"

    # Apply to all objects
    filter {}

    # Move files to Infrequent Access after 30 days
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    # Move to Glacier after 90 days
    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    # Delete files after retention period (only if > last transition)
    dynamic "expiration" {
      for_each = var.data_retention_days > 90 ? [var.data_retention_days] : []
      content {
        days = expiration.value
      }
    }
  }

  # Clean up incomplete multipart uploads (saves money)
  rule {
    id     = "cleanup-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

# CORS configuration for direct uploads from browser
resource "aws_s3_bucket_cors_configuration" "data" {
  bucket = aws_s3_bucket.data.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = var.allowed_origins
    expose_headers  = ["ETag", "x-amz-request-id"]
    max_age_seconds = 3000
  }
}

# Intelligent-Tiering for automatic cost optimization
resource "aws_s3_bucket_intelligent_tiering_configuration" "data" {
  count  = var.enable_intelligent_tiering ? 1 : 0
  bucket = aws_s3_bucket.data.id
  name   = "EntireBucket"

  status = "Enabled"

  tiering {
    access_tier = "ARCHIVE_ACCESS"
    days        = 90
  }

  tiering {
    access_tier = "DEEP_ARCHIVE_ACCESS"
    days        = 180
  }
}
