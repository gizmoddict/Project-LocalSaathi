output "primary_endpoint_address" {
  description = "Primary endpoint hostname for Redis connection"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "port" {
  description = "Port number for Redis"
  value       = aws_elasticache_replication_group.redis.port
}

output "redis_url" {
  description = "Full connection URL for Redis with TLS enabled (sensitive)"
  value       = "rediss://:${var.auth_token}@${aws_elasticache_replication_group.redis.primary_endpoint_address}:${aws_elasticache_replication_group.redis.port}/0"
  sensitive   = true
}
