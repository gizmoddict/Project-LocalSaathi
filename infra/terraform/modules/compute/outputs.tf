output "cluster_id" {
  description = "ECS Cluster ID"
  value       = aws_ecs_cluster.staging.id
}

output "cluster_name" {
  description = "ECS Cluster Name"
  value       = aws_ecs_cluster.staging.name
}

output "api_service_name" {
  description = "ECS API Service Name"
  value       = aws_ecs_service.api.name
}

output "web_service_name" {
  description = "ECS Web Service Name"
  value       = aws_ecs_service.web.name
}

output "worker_service_name" {
  description = "ECS Worker Service Name"
  value       = aws_ecs_service.worker.name
}
