variable "aws_region" {
  type        = string
  description = "AWS region for staging"
  default     = "ap-south-1"
}

variable "release_tag" {
  type        = string
  description = "Release image tag (e.g., v0.1.0-staging.abcd123)"
  default     = "latest"
}

variable "bucket_suffix" {
  type        = string
  description = "Bucket suffix for uniqueness"
  default     = "stg-01"
}

variable "domain_name" {
  type        = string
  description = "Staging domain name"
  default     = "staging.localsaathi.com"
}

variable "certificate_arn" {
  type        = string
  description = "ACM Certificate ARN"
  default     = ""
}

variable "hosted_zone_id" {
  type        = string
  description = "Route 53 hosted zone ID"
  default     = ""
}

variable "db_name" {
  type        = string
  description = "Staging database name"
  default     = "localsaathi_staging"
}

variable "db_username" {
  type        = string
  description = "Staging DB master user"
  default     = "localsaathi_staging_admin"
}

variable "db_password" {
  type        = string
  description = "Staging DB master password"
  sensitive   = true
}

variable "db_instance_class" {
  type        = string
  description = "RDS instance size"
  default     = "db.t4g.medium"
}

variable "redis_auth_token" {
  type        = string
  description = "Redis AUTH token"
  sensitive   = true
}

variable "redis_node_type" {
  type        = string
  description = "ElastiCache node size"
  default     = "cache.t4g.medium"
}

variable "jwt_access_secret" {
  type        = string
  description = "JWT Access Secret"
  sensitive   = true
}

variable "jwt_refresh_secret" {
  type        = string
  description = "JWT Refresh Secret"
  sensitive   = true
}

variable "auth_pepper" {
  type        = string
  description = "Auth Pepper"
  sensitive   = true
}

variable "razorpay_key_id" {
  type        = string
  description = "Razorpay sandbox key ID"
  sensitive   = true
  default     = "rzp_test_placeholder"
}

variable "razorpay_key_secret" {
  type        = string
  description = "Razorpay sandbox secret"
  sensitive   = true
  default     = "razorpay_staging_secret_placeholder"
}
