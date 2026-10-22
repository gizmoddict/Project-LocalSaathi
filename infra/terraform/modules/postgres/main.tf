# ==============================================================================
# LocalSaathi Terraform Module: Managed PostgreSQL (AWS RDS)
# PostgreSQL 16 + PostGIS, Encrypted Storage, Automated Backups, Private Subnets
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

resource "aws_db_subnet_group" "postgres" {
  name        = "${var.environment}-pg-subnet-group"
  subnet_ids  = var.subnet_ids
  description = "Private database subnet group for LocalSaathi PostgreSQL"

  tags = {
    Name        = "${var.environment}-pg-subnet-group"
    Environment = var.environment
  }
}

resource "aws_db_parameter_group" "postgres16" {
  name        = "${var.environment}-pg16-params"
  family      = "postgres16"
  description = "Custom parameter group for PostgreSQL 16 with PostGIS optimization"

  # Performance and connection parameters
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  tags = {
    Name        = "${var.environment}-pg16-params"
    Environment = var.environment
  }
}

resource "aws_db_instance" "postgres" {
  identifier     = "${var.environment}-postgres"
  engine         = "postgres"
  engine_version = "16.4"
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage_gb
  max_allocated_storage = var.max_allocated_storage_gb
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.db_username
  password = var.db_password # Stored securely via Secrets Manager in root module

  db_subnet_group_name   = aws_db_subnet_group.postgres.name
  vpc_security_group_ids = [var.security_group_id]
  parameter_group_name   = aws_db_parameter_group.postgres16.name

  publicly_accessible = false
  multi_az            = var.multi_az

  backup_retention_period   = var.backup_retention_days
  backup_window             = "03:00-04:00"
  maintenance_window        = "Sun:04:30-Sun:05:30"
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot     = true
  deletion_protection       = var.deletion_protection
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = "${var.environment}-postgres-final-snapshot"

  tags = {
    Name        = "${var.environment}-postgres"
    Environment = var.environment
  }
}
