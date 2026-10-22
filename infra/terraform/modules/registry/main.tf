# ==============================================================================
# LocalSaathi Terraform Module: Container Registry (AWS ECR)
# ECR Repositories for API, Web & Worker with Vulnerability Scanning
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

locals {
  services = ["api", "web", "worker"]
}

resource "aws_ecr_repository" "repos" {
  for_each             = toset(locals.services)
  name                 = "${var.environment}-${each.key}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Name        = "${var.environment}-${each.key}"
    Environment = var.environment
  }
}

# Retain last 30 tagged staging images and expire untagged images after 7 days
resource "aws_ecr_lifecycle_policy" "lifecycle" {
  for_each   = toset(locals.services)
  repository = aws_ecr_repository.repos[each.key].name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Expire untagged images after 7 days"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Keep last 30 tagged staging images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v0.", "stg-"]
          countType     = "imageCountMoreThan"
          countNumber   = 30
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}
