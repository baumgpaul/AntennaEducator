# S3 Frontend Module - Static Website Hosting
# Hosts React app (HTML, JS, CSS, assets)

resource "aws_s3_bucket" "frontend" {
  bucket = var.bucket_name
  
  tags = merge(
    var.tags,
    {
      Name        = var.bucket_name
      Description = "Frontend static files for antenna simulator"
      Purpose     = "website-hosting"
    }
  )
}

# Enable static website hosting
resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  
  index_document {
    suffix = "index.html"
  }
  
  error_document {
    key = "index.html"  # SPA routing - all 404s go to index.html
  }
}

# Enable versioning (keeps history of deployments)
resource "aws_s3_bucket_versioning" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  
  versioning_configuration {
    status = "Enabled"
  }
}

# Block public access (CloudFront will access it)
# Users access via CloudFront, not directly
resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  
  block_public_acls       = true
  block_public_policy     = false  # Allow bucket policy for CloudFront
  ignore_public_acls      = true
  restrict_public_buckets = false  # Allow bucket policy
}

# Bucket policy - allows CloudFront to read objects
resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontAccess"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = var.cloudfront_distribution_arn
          }
        }
      }
    ]
  })
}

# CORS configuration for API calls from frontend
resource "aws_s3_bucket_cors_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  
  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = var.allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}
