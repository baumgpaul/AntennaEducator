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
  default     = "fdtd-staging"
}

variable "domain_name" {
  description = "Domain name for the FDTD staging application"
  type        = string
  default     = "fdtd-stage.nyakyagyawa.com"
}
