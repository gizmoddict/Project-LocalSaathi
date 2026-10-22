variable "environment" {
  type        = string
  description = "Environment name"
}

variable "subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs for Redis deployment"
}

variable "security_group_id" {
  type        = string
  description = "Security group ID allowing app container ingress on port 6379"
}

variable "auth_token" {
  type        = string
  description = "Redis AUTH token (min 16 alphanumeric characters)"
  sensitive   = true
}

variable "node_type" {
  type        = string
  description = "ElastiCache node type (staging optimized)"
  default     = "cache.t4g.medium"
}

variable "num_cache_clusters" {
  type        = number
  description = "Number of cache clusters (1 for standalone staging, 2 for multi-AZ failover)"
  default     = 1
}

variable "snapshot_retention_days" {
  type        = number
  description = "Number of days to retain daily snapshots"
  default     = 3
}
