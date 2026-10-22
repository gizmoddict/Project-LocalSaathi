output "vpc_id" {
  description = "The ID of the VPC"
  value       = aws_vpc.staging_vpc.id
}

output "public_subnet_ids" {
  description = "IDs of the public subnets"
  value       = aws_subnet.public[*].id
}

output "private_app_subnet_ids" {
  description = "IDs of the private application subnets"
  value       = aws_subnet.private_app[*].id
}

output "private_data_subnet_ids" {
  description = "IDs of the private database/data subnets"
  value       = aws_subnet.private_data[*].id
}

output "alb_security_group_id" {
  description = "Security group ID for the ALB"
  value       = aws_security_group.alb.id
}

output "app_security_group_id" {
  description = "Security group ID for ECS application containers"
  value       = aws_security_group.app.id
}

output "postgres_security_group_id" {
  description = "Security group ID for PostgreSQL RDS instance"
  value       = aws_security_group.postgres.id
}

output "redis_security_group_id" {
  description = "Security group ID for ElastiCache Redis cluster"
  value       = aws_security_group.redis.id
}
