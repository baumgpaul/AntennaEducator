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

# ECR outputs
output "ecr_projects_url" {
  description = "URL of the projects ECR repository"
  value       = module.ecr_projects.repository_url
}

output "ecr_preprocessor_url" {
  description = "URL of the preprocessor ECR repository"
  value       = module.ecr_preprocessor.repository_url
}

output "ecr_solver_url" {
  description = "URL of the solver ECR repository"
  value       = module.ecr_solver.repository_url
}

output "ecr_postprocessor_url" {
  description = "URL of the postprocessor ECR repository"
  value       = module.ecr_postprocessor.repository_url
}

# Lambda outputs (uncomment after deploying Lambda functions)
/*
output "lambda_projects_url" {
  description = "Function URL for projects service"
  value       = module.lambda_projects.function_url
}

output "lambda_preprocessor_url" {
  description = "Function URL for preprocessor service"
  value       = module.lambda_preprocessor.function_url
}

output "lambda_solver_url" {
  description = "Function URL for solver service"
  value       = module.lambda_solver.function_url
}

output "lambda_postprocessor_url" {
  description = "Function URL for postprocessor service"
  value       = module.lambda_postprocessor.function_url
}
*/
