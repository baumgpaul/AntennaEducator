variable "table_name" {
  description = "Name of the DynamoDB table"
  type        = string
}

variable "enable_point_in_time_recovery" {
  description = "Enable point-in-time recovery for backups"
  type        = bool
  default     = true
}

variable "enable_streams" {
  description = "Enable DynamoDB streams for change data capture"
  type        = bool
  default     = false
}

variable "tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}
