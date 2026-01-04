# CloudFront Module Variables

variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "s3_bucket_name" {
  description = "S3 bucket name for frontend"
  type        = string
}

variable "s3_bucket_regional_domain_name" {
  description = "S3 bucket regional domain name"
  type        = string
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for custom domain (us-east-1). Leave empty for CloudFront default certificate."
  type        = string
  default     = ""
}

variable "domain_aliases" {
  description = "Custom domain aliases (e.g., ['example.com', 'www.example.com'])"
  type        = list(string)
  default     = []
}

variable "price_class" {
  description = "CloudFront price class (PriceClass_All, PriceClass_200, PriceClass_100)"
  type        = string
  default     = "PriceClass_100"  # North America + Europe (cheapest)
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
