variable "environment" {
  type        = string
  description = "Environment name"
}

variable "database_url" {
  type        = string
  description = "Full PostgreSQL connection URL"
  sensitive   = true
}

variable "redis_url" {
  type        = string
  description = "Full Redis connection URL"
  sensitive   = true
}

variable "jwt_access_secret" {
  type        = string
  description = "JWT Access Token Secret (min 32 bytes)"
  sensitive   = true
}

variable "jwt_refresh_secret" {
  type        = string
  description = "JWT Refresh Token Secret (min 32 bytes)"
  sensitive   = true
}

variable "auth_pepper" {
  type        = string
  description = "Authentication password/OTP hashing pepper"
  sensitive   = true
}

variable "razorpay_key_id" {
  type        = string
  description = "Razorpay Key ID (rzp_test_* for staging)"
  sensitive   = true
  default     = "rzp_test_placeholder"
}

variable "razorpay_key_secret" {
  type        = string
  description = "Razorpay Key Secret"
  sensitive   = true
  default     = "razorpay_staging_secret_placeholder"
}

variable "storage_access_key" {
  type        = string
  description = "S3 IAM Storage Access Key"
  sensitive   = true
  default     = "placeholder"
}

variable "storage_secret_key" {
  type        = string
  description = "S3 IAM Storage Secret Key"
  sensitive   = true
  default     = "placeholder"
}
