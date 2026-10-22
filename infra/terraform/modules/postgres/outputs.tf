output "endpoint" {
  description = "Connection endpoint of the PostgreSQL instance"
  value       = aws_db_instance.postgres.endpoint
}

output "address" {
  description = "Hostname address of the database"
  value       = aws_db_instance.postgres.address
}

output "port" {
  description = "Port the database listens on"
  value       = aws_db_instance.postgres.port
}

output "db_name" {
  description = "Database name"
  value       = aws_db_instance.postgres.db_name
}

output "connection_url" {
  description = "Full connection URL for Prisma (sensitive)"
  value       = "postgresql://${aws_db_instance.postgres.username}:${var.db_password}@${aws_db_instance.postgres.endpoint}/${aws_db_instance.postgres.db_name}?sslmode=verify-full&schema=public"
  sensitive   = true
}
