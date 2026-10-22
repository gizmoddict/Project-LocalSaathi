variable "environment" {
  type        = string
  description = "Environment name"
}

variable "aws_region" {
  type        = string
  description = "AWS region"
  default     = "ap-south-1"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs for ECS tasks"
}

variable "app_security_group_id" {
  type        = string
  description = "Security group ID for ECS containers"
}

variable "secrets_read_policy_arn" {
  type        = string
  description = "ARN of the IAM policy granting read access to secrets"
}

variable "log_group_name" {
  type        = string
  description = "CloudWatch log group name"
}

variable "api_target_group_arn" {
  type        = string
  description = "Target group ARN for API"
}

variable "web_target_group_arn" {
  type        = string
  description = "Target group ARN for Web"
}

variable "api_image" {
  type        = string
  description = "Docker image for API container"
}

variable "web_image" {
  type        = string
  description = "Docker image for Web container"
}

variable "worker_image" {
  type        = string
  description = "Docker image for Worker container"
}

variable "api_url" {
  type        = string
  description = "Public API URL"
}

variable "web_url" {
  type        = string
  description = "Public Web URL"
}

variable "database_url" {
  type        = string
  description = "Database connection URL"
  sensitive   = true
}

variable "redis_url" {
  type        = string
  description = "Redis connection URL"
  sensitive   = true
}

variable "opensearch_url" {
  type        = string
  description = "OpenSearch cluster URL"
  default     = "http://localhost:9200"
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

variable "api_replica_count" {
  type        = number
  description = "Desired number of API container replicas"
  default     = 2
}

variable "web_replica_count" {
  type        = number
  description = "Desired number of Web container replicas"
  default     = 2
}

variable "worker_replica_count" {
  type        = number
  description = "Desired number of Worker container replicas"
  default     = 1
}
