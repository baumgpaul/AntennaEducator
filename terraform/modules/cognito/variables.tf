variable "environment" {
  description = "Environment name (staging, production)"
  type        = string
}

variable "domain_name" {
  description = "Domain name for the application (e.g., antennaeducator.nyakyagyawa.com)"
  type        = string
}

variable "domain_suffix" {
  description = "Unique suffix for Cognito domain (must be globally unique)"
  type        = string
  default     = "auth"
}

variable "additional_callback_urls" {
  description = "Additional callback URLs for OAuth"
  type        = list(string)
  default     = []
}

variable "additional_logout_urls" {
  description = "Additional logout URLs"
  type        = list(string)
  default     = []
}

variable "enable_mfa" {
  description = "Enable MFA for user pool (OFF, OPTIONAL, ON)"
  type        = string
  default     = "OFF"
  validation {
    condition     = contains(["OFF", "OPTIONAL", "ON"], var.enable_mfa)
    error_message = "MFA configuration must be OFF, OPTIONAL, or ON"
  }
}

variable "password_minimum_length" {
  description = "Minimum password length"
  type        = number
  default     = 8
}

variable "tags" {
  description = "Additional tags to apply to resources"
  type        = map(string)
  default     = {}
}
