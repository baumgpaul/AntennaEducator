variable "bucket_name" {
  description = "Name of the S3 bucket for frontend files"
  type        = string
}

variable "cloudfront_distribution_arn" {
  description = "ARN of CloudFront distribution (for bucket policy)"
  type        = string
  default     = ""  # Will be empty initially, updated after CloudFront creation
}

variable "allowed_origins" {
  description = "CORS allowed origins"
  type        = list(string)
  default     = ["*"]
}

variable "tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}
