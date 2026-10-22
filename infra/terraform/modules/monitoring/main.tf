# ==============================================================================
# LocalSaathi Terraform Module: Monitoring (AWS CloudWatch)
# Log Groups with Retention, Metric Alarms for 5xx Errors, CPU/Memory & Storage
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

# --- CloudWatch Log Group ---
resource "aws_cloudwatch_log_group" "app_logs" {
  name              = "/aws/ecs/${var.environment}"
  retention_in_days = var.log_retention_days

  tags = {
    Name        = "${var.environment}-logs"
    Environment = var.environment
  }
}

# --- CloudWatch Alarm: ALB 5XX Error Rate ---
resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${var.environment}-alb-high-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "Triggers if target 5XX error count exceeds 10 per minute"
  treat_missing_data  = "notBreaching"

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
  }

  tags = {
    Environment = var.environment
  }
}

# --- CloudWatch Alarm: ECS Service High CPU ---
resource "aws_cloudwatch_metric_alarm" "ecs_cpu" {
  alarm_name          = "${var.environment}-ecs-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Triggers if ECS CPU utilization exceeds 80% for 3 consecutive minutes"

  dimensions = {
    ClusterName = var.cluster_name
  }

  tags = {
    Environment = var.environment
  }
}

# --- CloudWatch Alarm: RDS Low Free Storage ---
resource "aws_cloudwatch_metric_alarm" "rds_storage" {
  alarm_name          = "${var.environment}-rds-low-storage"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 5000000000 # 5 GB in bytes
  alarm_description   = "Triggers if PostgreSQL free storage drops below 5GB"

  dimensions = {
    DBInstanceIdentifier = var.db_instance_id
  }

  tags = {
    Environment = var.environment
  }
}
