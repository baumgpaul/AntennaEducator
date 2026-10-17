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

variable "state_bucket_name" {
  description = "Name of S3 bucket for Terraform state (must be globally unique)"
  type        = string
  # No default: set in terraform.tfvars (gitignored), e.g.
  #   state_bucket_name = "antenna-simulator-terraform-state-<AWS_ACCOUNT_ID>"
}

variable "lock_table_name" {
  description = "Name of DynamoDB table for state locking"
  type        = string
  default     = "antenna-terraform-locks"
}
