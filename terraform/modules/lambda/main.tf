# Lambda Function Module
# Reusable module for deploying Lambda functions with container images

resource "aws_lambda_function" "this" {
  function_name = var.function_name
  role          = aws_iam_role.lambda.arn
  
  # Container image configuration
  package_type = "Image"
  image_uri    = var.image_uri
  
  # Resource configuration
  memory_size = var.memory_size
  timeout     = var.timeout
  
  # Environment variables
  environment {
    variables = var.environment_variables
  }
  
  # VPC configuration (optional)
  dynamic "vpc_config" {
    for_each = var.vpc_config != null ? [var.vpc_config] : []
    content {
      subnet_ids         = vpc_config.value.subnet_ids
      security_group_ids = vpc_config.value.security_group_ids
    }
  }
  
  # Logging configuration
  logging_config {
    log_format = "JSON"
    log_group  = aws_cloudwatch_log_group.lambda.name
  }
  
  tags = merge(
    var.tags,
    {
      Name        = var.function_name
      Environment = var.environment
    }
  )
}

# IAM Role for Lambda execution
resource "aws_iam_role" "lambda" {
  name = "${var.function_name}-execution-role"
  
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
  
  tags = var.tags
}

# Basic Lambda execution policy (CloudWatch Logs)
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# VPC execution policy (if VPC is configured)
resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  count      = var.vpc_config != null ? 1 : 0
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

# DynamoDB access policy
resource "aws_iam_role_policy" "dynamodb" {
  count = length(var.dynamodb_table_arns) > 0 ? 1 : 0
  name  = "${var.function_name}-dynamodb-policy"
  role  = aws_iam_role.lambda.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = concat(
          var.dynamodb_table_arns,
          [for arn in var.dynamodb_table_arns : "${arn}/index/*"]
        )
      }
    ]
  })
}

# S3 access policy (for data storage)
resource "aws_iam_role_policy" "s3" {
  count = length(var.s3_bucket_arns) > 0 ? 1 : 0
  name  = "${var.function_name}-s3-policy"
  role  = aws_iam_role.lambda.id
  
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = concat(
          var.s3_bucket_arns,
          [for arn in var.s3_bucket_arns : "${arn}/*"]
        )
      }
    ]
  })
}

# CloudWatch Logs
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = var.log_retention_days
  
  tags = var.tags
}

# Lambda Function URL (optional - simpler than API Gateway for MVP)
resource "aws_lambda_function_url" "this" {
  count              = var.create_function_url ? 1 : 0
  function_name      = aws_lambda_function.this.function_name
  authorization_type = var.function_url_auth_type
  
  cors {
    allow_credentials = true
    allow_origins     = var.cors_allowed_origins
    allow_methods     = ["*"]
    allow_headers     = ["*"]
    max_age           = 86400
  }
}
