# ==============================================================================
# LocalSaathi Terraform Module: Managed Redis (AWS ElastiCache)
# Redis 7.x, At-Rest & Transit Encryption, Auth Token, Private Subnets
# ==============================================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

resource "aws_elasticache_subnet_group" "redis" {
  name        = "${var.environment}-redis-subnet-group"
  subnet_ids  = var.subnet_ids
  description = "Private subnet group for ElastiCache Redis"

  tags = {
    Name        = "${var.environment}-redis-subnet-group"
    Environment = var.environment
  }
}

resource "aws_elasticache_parameter_group" "redis7" {
  name        = "${var.environment}-redis7-params"
  family      = "redis7"
  description = "Custom parameter group for Redis 7.x with volatile-lru eviction"

  parameter {
    name  = "maxmemory-policy"
    value = "volatile-lru"
  }

  tags = {
    Name        = "${var.environment}-redis7-params"
    Environment = var.environment
  }
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "${var.environment}-redis"
  description          = "LocalSaathi Staging Redis Replication Group"

  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.node_type
  num_cache_clusters   = var.num_cache_clusters
  port                 = 6379

  subnet_group_name    = aws_elasticache_subnet_group.redis.name
  security_group_ids   = [var.security_group_id]
  parameter_group_name = aws_elasticache_parameter_group.redis7.name

  transit_encryption_enabled = true
  at_rest_encryption_enabled = true
  auth_token                 = var.auth_token

  automatic_failover_enabled = var.num_cache_clusters > 1 ? true : false
  multi_az_enabled           = var.num_cache_clusters > 1 ? true : false

  snapshot_retention_limit = var.snapshot_retention_days
  snapshot_window          = "02:00-03:00"
  maintenance_window       = "sun:03:30-sun:04:30"

  tags = {
    Name        = "${var.environment}-redis"
    Environment = var.environment
  }
}
