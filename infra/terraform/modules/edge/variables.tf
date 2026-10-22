variable "environment" {
  type        = string
  description = "Environment name"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID"
}

variable "public_subnet_ids" {
  type        = list(string)
  description = "Public subnet IDs for ALB placement"
}

variable "security_group_id" {
  type        = string
  description = "Security group ID for the ALB"
}

variable "certificate_arn" {
  type        = string
  description = "ACM Certificate ARN for TLS (leave empty if not yet provisioned)"
  default     = ""
}

variable "hosted_zone_id" {
  type        = string
  description = "Route 53 Hosted Zone ID (leave empty if not managed via Route 53)"
  default     = ""
}

variable "domain_name" {
  type        = string
  description = "Domain name for staging (e.g., staging.localsaathi.com)"
  default     = "staging.localsaathi.com"
}
