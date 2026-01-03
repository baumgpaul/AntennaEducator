output "dynamodb_table_name" {
  description = "Name of the DynamoDB table"
  value       = module.dynamodb.table_name
}

output "dynamodb_table_arn" {
  description = "ARN of the DynamoDB table"
  value       = module.dynamodb.table_arn
}

output "s3_data_bucket_name" {
  description = "Name of the S3 data bucket"
  value       = module.s3_data.bucket_name
}

output "s3_frontend_bucket_name" {
  description = "Name of the S3 frontend bucket"
  value       = module.s3_frontend.bucket_name
}

output "s3_frontend_website_endpoint" {
  description = "Website endpoint for frontend bucket"
  value       = module.s3_frontend.website_endpoint
}

output "aws_region" {
  description = "AWS region"
  value       = var.aws_region
}

output "environment" {
  description = "Environment name"
  value       = var.environment
}
