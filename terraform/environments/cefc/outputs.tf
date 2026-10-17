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

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = module.cloudfront.distribution_id
}

output "cloudfront_distribution_arn" {
  description = "CloudFront distribution ARN"
  value       = module.cloudfront.distribution_arn
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  value       = "https://${module.cloudfront.distribution_domain_name}"
}

output "route53_zone_id" {
  description = "Route53 hosted zone ID (reused parent zone)"
  value       = module.route53.zone_id
}

output "acm_certificate_arn" {
  description = "ARN of the ACM certificate"
  value       = module.acm_certificate.certificate_arn
}

output "acm_certificate_status" {
  description = "Status of the ACM certificate"
  value       = module.acm_certificate.certificate_status
}

output "custom_domain_url" {
  description = "CEFC custom domain URL"
  value       = "https://${var.domain_name}"
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

# Lambda Function URLs
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

# Cognito outputs
output "cognito_user_pool_id" {
  description = "ID of the Cognito User Pool"
  value       = module.cognito.user_pool_id
}

output "cognito_user_pool_arn" {
  description = "ARN of the Cognito User Pool"
  value       = module.cognito.user_pool_arn
}

output "cognito_client_id" {
  description = "ID of the Cognito User Pool Client"
  value       = module.cognito.client_id
}

output "cognito_domain_url" {
  description = "URL of the Cognito hosted UI"
  value       = module.cognito.domain_url
}

output "cognito_issuer_url" {
  description = "JWT issuer URL"
  value       = module.cognito.issuer_url
}

output "api_gateway_id" {
  description = "ID of the API Gateway"
  value       = module.api_gateway.api_id
}

output "api_gateway_endpoint" {
  description = "Default endpoint of the API Gateway"
  value       = module.api_gateway.api_endpoint
}

output "api_gateway_invoke_url" {
  description = "Invoke URL of the API Gateway default stage"
  value       = module.api_gateway.stage_invoke_url
}
