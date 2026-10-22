variable "environment" {
  type        = string
  description = "Environment name"
}

variable "log_retention_days" {
  type        = number
  description = "Days to retain container log streams"
  default     = 14
}

variable "alb_arn_suffix" {
  type        = string
  description = "ARN suffix of the ALB for metric filtering"
  default     = ""
}

variable "cluster_name" {
  type        = string
  description = "ECS cluster name"
  default     = ""
}

variable "db_instance_id" {
  type        = string
  description = "RDS DB instance identifier"
  default     = ""
}
