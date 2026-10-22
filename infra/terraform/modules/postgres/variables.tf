variable "environment" {
  type        = string
  description = "Environment name"
}

variable "subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs for database deployment"
}

variable "security_group_id" {
  type        = string
  description = "Security group ID allowing app container ingress on port 5432"
}

variable "db_name" {
  type        = string
  description = "Initial database name"
  default     = "localsaathi_staging"
}

variable "db_username" {
  type        = string
  description = "Master database username"
  default     = "localsaathi_staging_admin"
}

variable "db_password" {
  type        = string
  description = "Master database password"
  sensitive   = true
}

variable "instance_class" {
  type        = string
  description = "RDS instance class (staging optimized)"
  default     = "db.t4g.medium"
}

variable "allocated_storage_gb" {
  type        = number
  description = "Allocated storage in GB"
  default     = 20
}

variable "max_allocated_storage_gb" {
  type        = number
  description = "Autoscaling storage upper limit in GB"
  default     = 100
}

variable "multi_az" {
  type        = bool
  description = "Whether to deploy multi-AZ for high availability"
  default     = false
}

variable "backup_retention_days" {
  type        = number
  description = "Number of days to retain automated backups"
  default     = 7
}

variable "deletion_protection" {
  type        = bool
  description = "Prevent accidental database deletion"
  default     = false
}

variable "skip_final_snapshot" {
  type        = bool
  description = "Whether to skip final snapshot upon deletion"
  default     = true
}
