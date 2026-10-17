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

variable "csp_report_only" {
  description = "Send the CSP as Content-Security-Policy-Report-Only (log violations, block nothing)"
  type        = bool
  default     = true
}

variable "content_security_policy" {
  description = "Content-Security-Policy for the SPA. The app only talks to its own Lambda Function URLs, Cognito and S3 (presigned images)."
  type        = string
  default     = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.amazonaws.com; font-src 'self' data:; connect-src 'self' https://*.on.aws https://*.amazonaws.com https://*.amazoncognito.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
}
