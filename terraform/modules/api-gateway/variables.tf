variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "enable_auth" {
  description = "Enable Cognito JWT authentication"
  type        = bool
  default     = false
}

# Cognito Configuration
variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  type        = string
  default     = ""
}

variable "cognito_client_id" {
  description = "Cognito User Pool Client ID"
  type        = string
  default     = ""
}

variable "cognito_issuer_url" {
  description = "Cognito JWT issuer URL"
  type        = string
  default     = ""
}

# Lambda Configuration
variable "lambda_projects_invoke_arn" {
  description = "Invoke ARN for Projects Lambda function"
  type        = string
}

variable "lambda_projects_function_name" {
  description = "Name of Projects Lambda function"
  type        = string
}

variable "lambda_preprocessor_invoke_arn" {
  description = "Invoke ARN for Preprocessor Lambda function"
  type        = string
}

variable "lambda_preprocessor_function_name" {
  description = "Name of Preprocessor Lambda function"
  type        = string
}

variable "lambda_solver_invoke_arn" {
  description = "Invoke ARN for Solver Lambda function"
  type        = string
}

variable "lambda_solver_function_name" {
  description = "Name of Solver Lambda function"
  type        = string
}

variable "lambda_postprocessor_invoke_arn" {
  description = "Invoke ARN for Postprocessor Lambda function"
  type        = string
}

variable "lambda_postprocessor_function_name" {
  description = "Name of Postprocessor Lambda function"
  type        = string
}

# CORS Configuration
variable "cors_allowed_origins" {
  description = "List of allowed origins for CORS"
  type        = list(string)
  default     = ["*"]
}

# Throttling
variable "throttling_burst_limit" {
  description = "Maximum concurrent requests"
  type        = number
  default     = 100
}

variable "throttling_rate_limit" {
  description = "Requests per second"
  type        = number
  default     = 50
}

# Logging
variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 7
}

# Custom Domain (Optional)
variable "custom_domain_name" {
  description = "Custom domain name for API (e.g., api.example.com)"
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for custom domain"
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID for custom domain"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}
