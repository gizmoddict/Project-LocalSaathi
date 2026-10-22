output "secret_arn" {
  description = "ARN of the Secrets Manager secret"
  value       = aws_secretsmanager_secret.app_secrets.arn
}

output "policy_arn" {
  description = "ARN of the IAM policy granting read access to secrets"
  value       = aws_iam_policy.secrets_read.arn
}
