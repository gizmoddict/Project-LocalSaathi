# ==============================================================================
# LocalSaathi Terraform Module: Secrets Management (AWS Secrets Manager)
# Stores Encrypted Runtime Secrets; Zero Plaintext Secrets in Repository
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

resource "aws_secretsmanager_secret" "app_secrets" {
  name                    = "${var.environment}/app-secrets"
  description             = "Runtime environment secrets for LocalSaathi ${var.environment}"
  recovery_window_in_days = 0 # Staging allow immediate deletion

  tags = {
    Name        = "${var.environment}-app-secrets"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "app_secrets_val" {
  secret_id = aws_secretsmanager_secret.app_secrets.id
  secret_string = jsonencode({
    DATABASE_URL         = var.database_url
    REDIS_URL            = var.redis_url
    JWT_ACCESS_SECRET    = var.jwt_access_secret
    JWT_REFRESH_SECRET   = var.jwt_refresh_secret
    AUTH_PEPPER          = var.auth_pepper
    RAZORPAY_KEY_ID      = var.razorpay_key_id
    RAZORPAY_KEY_SECRET  = var.razorpay_key_secret
    STORAGE_ACCESS_KEY   = var.storage_access_key
    STORAGE_SECRET_KEY   = var.storage_secret_key
  })
}

# IAM Policy allowing ECS Task Execution Role to read Secrets
resource "aws_iam_policy" "secrets_read" {
  name        = "${var.environment}-secrets-read-policy"
  description = "Allows ECS tasks to read LocalSaathi runtime secrets"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [aws_secretsmanager_secret.app_secrets.arn]
      }
    ]
  })
}
