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

variable "enable_ops_alarms" {
  description = "5xx / throttle / duration alarms (~$1/month beyond the CloudWatch free tier)"
  type        = bool
  default     = true
}

variable "alert_email" {
  description = "Email address for billing and operational alerts"
  type        = string
  default     = ""
}

variable "api_origin_signing" {
  description = "Stage B of the CloudFront API front door: sign origin requests (OAC) and require AWS_IAM on the Lambda Function URLs, so they cannot be called directly"
  type        = bool
  default     = true
}

variable "async_jobs" {
  description = <<-EOT
    Asynchronous solve jobs (solves longer than CloudFront's 60 s API limit):
      "off"    — default, nothing deployed, $0. Solves must finish within 60 s.
      "lambda" — SQS queue + the solver Lambda as worker (up to 15 min per solve).
                 Free tiers cover classroom use; extra cost ≈ $0.10–1 / month.
    A Fargate worker for FEM (longer / bigger than Lambda) is a future option (TODO.md).
  EOT
  type        = string
  default     = "off"

  validation {
    condition     = contains(["off", "lambda"], var.async_jobs)
    error_message = "async_jobs must be \"off\" or \"lambda\"."
  }
}

variable "enable_fem" {
  description = <<-EOT
    FEM Studio (preview). false (default): the frontend is built without it —
    no route, menu or code in the bundle — and no FEM backend is deployed ($0).
    true: built in, visible to maintainers/admins only. Production stays false
    until FEM passes its release gate (validated cases, course module, docs, cost).
  EOT
  type        = bool
  default     = false
}
