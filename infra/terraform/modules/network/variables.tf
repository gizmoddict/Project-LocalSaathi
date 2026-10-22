variable "environment" {
  type        = string
  description = "Deployment environment name (e.g. staging)"
  default     = "localsaathi-staging"
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the staging VPC"
  default     = "10.10.0.0/16"
}

variable "availability_zones" {
  type        = list(string)
  description = "Availability zones for staging subnets"
  default     = ["ap-south-1a", "ap-south-1b"]
}

variable "public_subnet_cidrs" {
  type        = list(string)
  description = "Public subnet CIDR blocks for ingress/ALB"
  default     = ["10.10.1.0/24", "10.10.2.0/24"]
}

variable "private_app_subnet_cidrs" {
  type        = list(string)
  description = "Private subnet CIDR blocks for ECS containers"
  default     = ["10.10.11.0/24", "10.10.12.0/24"]
}

variable "private_data_subnet_cidrs" {
  type        = list(string)
  description = "Private subnet CIDR blocks for RDS and ElastiCache"
  default     = ["10.10.21.0/24", "10.10.22.0/24"]
}
