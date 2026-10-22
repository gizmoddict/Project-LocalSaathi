# ==============================================================================
# LocalSaathi — Staging Environment Terraform Root Configuration
# Integrates: Network, Postgres, Redis, Storage, Registry, Secrets, Edge, Compute, Monitoring
# ==============================================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Staging remote state (configured via backend-config in CI/CD)
  # backend "s3" {}
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "LocalSaathi"
      Environment = "staging"
      ManagedBy   = "Terraform"
    }
  }
}

locals {
  environment = "localsaathi-staging"
}

# 1. Network Module
module "network" {
  source      = "../../modules/network"
  environment = local.environment
}

# 2. Database Module (PostgreSQL 16 + PostGIS 3.4)
module "postgres" {
  source             = "../../modules/postgres"
  environment        = local.environment
  subnet_ids         = module.network.private_data_subnet_ids
  security_group_id  = module.network.postgres_security_group_id
  db_name            = var.db_name
  db_username        = var.db_username
  db_password        = var.db_password
  instance_class     = var.db_instance_class
}

# 3. Cache & Queue Module (Managed Redis 7.x)
module "redis" {
  source             = "../../modules/redis"
  environment        = local.environment
  subnet_ids         = module.network.private_data_subnet_ids
  security_group_id  = module.network.redis_security_group_id
  auth_token         = var.redis_auth_token
  node_type          = var.redis_node_type
}

# 4. Storage Module (Private S3 Media Bucket)
module "storage" {
  source        = "../../modules/storage"
  environment   = local.environment
  bucket_suffix = var.bucket_suffix
}

# 5. Registry Module (ECR Repositories)
module "registry" {
  source      = "../../modules/registry"
  environment = local.environment
}

# 6. Secrets Module (AWS Secrets Manager)
module "secrets" {
  source             = "../../modules/secrets"
  environment        = local.environment
  database_url       = module.postgres.connection_url
  redis_url          = module.redis.redis_url
  jwt_access_secret  = var.jwt_access_secret
  jwt_refresh_secret = var.jwt_refresh_secret
  auth_pepper        = var.auth_pepper
  razorpay_key_id    = var.razorpay_key_id
  razorpay_key_secret= var.razorpay_key_secret
}

# 7. Edge & Routing Module (ALB + DNS)
module "edge" {
  source             = "../../modules/edge"
  environment        = local.environment
  vpc_id             = module.network.vpc_id
  public_subnet_ids  = module.network.public_subnet_ids
  security_group_id  = module.network.alb_security_group_id
  certificate_arn    = var.certificate_arn
  hosted_zone_id     = var.hosted_zone_id
  domain_name        = var.domain_name
}

# 8. Monitoring Module (CloudWatch Logs & Alarms)
module "monitoring" {
  source             = "../../modules/monitoring"
  environment        = local.environment
  cluster_name       = "${local.environment}-cluster"
  db_instance_id     = "${local.environment}-postgres"
}

# 9. Compute Module (ECS Fargate Services)
module "compute" {
  source                  = "../../modules/compute"
  environment             = local.environment
  aws_region              = var.aws_region
  private_subnet_ids      = module.network.private_app_subnet_ids
  app_security_group_id   = module.network.app_security_group_id
  secrets_read_policy_arn = module.secrets.policy_arn
  log_group_name          = module.monitoring.log_group_name
  api_target_group_arn    = module.edge.api_target_group_arn
  web_target_group_arn    = module.edge.web_target_group_arn

  api_image    = "${module.registry.repository_urls.api}:${var.release_tag}"
  web_image    = "${module.registry.repository_urls.web}:${var.release_tag}"
  worker_image = "${module.registry.repository_urls.worker}:${var.release_tag}"

  api_url      = "https://${var.domain_name}"
  web_url      = "https://${var.domain_name}"
  database_url = module.postgres.connection_url
  redis_url    = module.redis.redis_url

  jwt_access_secret  = var.jwt_access_secret
  jwt_refresh_secret = var.jwt_refresh_secret
  auth_pepper        = var.auth_pepper
}
