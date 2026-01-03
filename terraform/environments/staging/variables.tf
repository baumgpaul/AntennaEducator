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
