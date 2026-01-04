# Route53 Module Variables

variable "domain_name" {
  description = "Domain name (e.g., antennaeducator.nyakyagyawa.com)"
  type        = string
}

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "use_existing_zone" {
  description = "Whether to use an existing hosted zone instead of creating a new one"
  type        = bool
  default     = false
}

variable "existing_zone_id" {
  description = "ID of existing Route53 hosted zone (if use_existing_zone is true)"
  type        = string
  default     = ""
}

variable "parent_domain_name" {
  description = "Parent domain name for looking up existing zone (e.g., nyakyagyawa.com)"
  type        = string
  default     = ""
}

variable "cloudfront_domain_name" {
  description = "CloudFront distribution domain name"
  type        = string
  default     = ""
}

variable "cloudfront_hosted_zone_id" {
  description = "CloudFront hosted zone ID (fixed: Z2FDTNDATAQYW2)"
  type        = string
  default     = ""
}

variable "create_www_subdomain" {
  description = "Whether to create www subdomain"
  type        = bool
  default     = false
}

variable "api_gateway_domain_name" {
  description = "API Gateway custom domain name"
  type        = string
  default     = ""
}

variable "api_gateway_hosted_zone_id" {
  description = "API Gateway hosted zone ID"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
