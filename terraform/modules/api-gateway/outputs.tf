output "api_id" {
  description = "ID of the API Gateway"
  value       = aws_apigatewayv2_api.main.id
}

output "api_endpoint" {
  description = "Default endpoint URL of the API Gateway"
  value       = aws_apigatewayv2_api.main.api_endpoint
}

output "api_execution_arn" {
  description = "Execution ARN of the API Gateway"
  value       = aws_apigatewayv2_api.main.execution_arn
}

output "stage_id" {
  description = "ID of the default stage"
  value       = aws_apigatewayv2_stage.default.id
}

output "stage_invoke_url" {
  description = "Invoke URL for the default stage"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "authorizer_id" {
  description = "ID of the Cognito authorizer (if enabled)"
  value       = var.enable_auth ? aws_apigatewayv2_authorizer.cognito[0].id : null
}

output "custom_domain_name" {
  description = "Custom domain name (if configured)"
  value       = var.custom_domain_name != "" ? aws_apigatewayv2_domain_name.api[0].domain_name : null
}

output "custom_domain_url" {
  description = "Full URL for custom domain (if configured)"
  value       = var.custom_domain_name != "" ? "https://${var.custom_domain_name}" : null
}

output "log_group_name" {
  description = "Name of the CloudWatch log group"
  value       = aws_cloudwatch_log_group.api_gateway.name
}

output "log_group_arn" {
  description = "ARN of the CloudWatch log group"
  value       = aws_cloudwatch_log_group.api_gateway.arn
}
