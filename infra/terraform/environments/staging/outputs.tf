output "alb_dns_name" {
  description = "Public ALB DNS hostname"
  value       = module.edge.alb_dns_name
}

output "staging_url" {
  description = "Primary Staging URL"
  value       = "https://${var.domain_name}"
}

output "database_endpoint" {
  description = "RDS PostgreSQL Endpoint"
  value       = module.postgres.endpoint
}

output "redis_primary_endpoint" {
  description = "ElastiCache Redis Primary Endpoint"
  value       = module.redis.primary_endpoint_address
}

output "s3_bucket_name" {
  description = "Private S3 Media Bucket Name"
  value       = module.storage.bucket_id
}

output "ecr_repository_urls" {
  description = "ECR Repository URLs"
  value       = module.registry.repository_urls
}

output "ecs_cluster_name" {
  description = "ECS Cluster Name"
  value       = module.compute.cluster_name
}
