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
  description = "Environment name"
  type        = string
  default     = "cefc"
}

variable "domain_name" {
  description = "Domain name for the CEFC instance"
  type        = string
  default     = "cefcantennaeducator.nyakyagyawa.com"
}

variable "alert_email" {
  description = "Email address for billing and operational alerts (leave empty to disable)"
  type        = string
  default     = ""
}
