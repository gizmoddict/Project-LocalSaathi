output "repository_urls" {
  description = "Map of service names to ECR repository URLs"
  value = {
    api    = aws_ecr_repository.repos["api"].repository_url
    web    = aws_ecr_repository.repos["web"].repository_url
    worker = aws_ecr_repository.repos["worker"].repository_url
  }
}

output "repository_arns" {
  description = "Map of service names to ECR repository ARNs"
  value = {
    api    = aws_ecr_repository.repos["api"].arn
    web    = aws_ecr_repository.repos["web"].arn
    worker = aws_ecr_repository.repos["worker"].arn
  }
}
