variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "eu-west-1"
}

variable "aws_profile" {
  description = "AWS CLI profile to use"
  type        = string
  default     = "antenna-staging"
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
  default     = "staging"
}

variable "domain_name" {
  description = "Domain name for the application"
  type        = string
  default     = "antennaeducator.nyakyagyawa.com"
}

variable "alert_email" {
  description = "Email address for billing and operational alerts"
  type        = string
  default     = ""
}

variable "api_origin_signing" {
  description = "Stage B of the CloudFront API front door: sign origin requests (OAC) and require AWS_IAM on the Lambda Function URLs, so they cannot be called directly"
  type        = bool
  default     = false
}
