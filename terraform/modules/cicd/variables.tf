# CI/CD Module — Input Variables

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-west-1"
}

variable "aws_account_id" {
  description = "AWS account ID"
  type        = string
}

# ── GitHub ─────────────────────────────────────────────────────────────

variable "github_owner" {
  description = "GitHub repository owner (username or org)"
  type        = string
}

variable "github_repository" {
  description = "GitHub repository name"
  type        = string
}

# ── Deployment targets ─────────────────────────────────────────────────

variable "s3_frontend_bucket" {
  description = "S3 bucket name for frontend deployment"
  type        = string
}

variable "cloudfront_distribution_id" {
  description = "CloudFront distribution ID for cache invalidation"
  type        = string
}

# ── Tags ───────────────────────────────────────────────────────────────

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
