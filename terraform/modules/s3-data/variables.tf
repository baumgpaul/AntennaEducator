variable "bucket_name" {
  description = "Name of the S3 bucket for data storage"
  type        = string
}

variable "allowed_origins" {
  description = "CORS allowed origins"
  type        = list(string)
  default     = ["*"]
}

variable "enable_lifecycle" {
  description = "Enable lifecycle rules for cost optimization"
  type        = bool
  default     = true
}

variable "data_retention_days" {
  description = "Number of days to retain data before deletion (0 = never delete)"
  type        = number
  default     = 0  # Keep forever by default
}

variable "enable_intelligent_tiering" {
  description = "Enable S3 Intelligent-Tiering for automatic cost optimization"
  type        = bool
  default     = false  # Disable for staging (adds small cost)
}

variable "tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}
