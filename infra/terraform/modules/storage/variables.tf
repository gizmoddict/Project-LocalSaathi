variable "environment" {
  type        = string
  description = "Environment name"
}

variable "bucket_suffix" {
  type        = string
  description = "Random suffix or AWS account ID to ensure global uniqueness"
  default     = "stg"
}

variable "versioning_enabled" {
  type        = bool
  description = "Enable object versioning"
  default     = true
}

variable "force_destroy" {
  type        = bool
  description = "Allow bucket deletion even if non-empty (staging only)"
  default     = false
}

variable "allowed_origins" {
  type        = list(string)
  description = "Allowed origins for CORS"
  default     = ["https://staging.localsaathi.com", "http://localhost:3000"]
}
