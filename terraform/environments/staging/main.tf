# Antenna Simulator - Staging Environment
# AWS Region: eu-west-1 (Ireland)

terraform {
  required_version = ">= 1.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  
  # Remote state in S3 (created by bootstrap)
  backend "s3" {
    bucket         = "antenna-simulator-terraform-state-767397882329"
    key            = "staging/terraform.tfstate"
    region         = "eu-west-1"
    dynamodb_table = "antenna-terraform-locks"
    encrypt        = true
    profile        = "antenna-staging"
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
  
  default_tags {
    tags = {
      Project     = "antenna-simulator"
      Environment = "staging"
      ManagedBy   = "terraform"
      Repository  = "github.com/yourusername/antenna-simulator"
    }
  }
}

# ============================================================================
# DynamoDB - Application Database
# ============================================================================

module "dynamodb" {
  source = "../../modules/dynamodb"
  
  table_name                     = "antenna-simulator-${var.environment}"
  enable_point_in_time_recovery  = true
  enable_streams                 = false  # Enable in Phase 2 for async jobs
  
  tags = {
    Component = "database"
  }
}

# ============================================================================
# S3 - Data Storage (private)
# ============================================================================

module "s3_data" {
  source = "../../modules/s3-data"
  
  bucket_name                = "antenna-simulator-data-${var.environment}-${data.aws_caller_identity.current.account_id}"
  allowed_origins            = ["https://${var.domain_name}", "http://localhost:3000"]
  enable_lifecycle           = true
  data_retention_days        = 0  # Keep forever in staging
  enable_intelligent_tiering = false  # Disable for staging (low volume)
  
  tags = {
    Component = "storage"
  }
}

# ============================================================================
# S3 - Frontend (static website)
# ============================================================================

module "s3_frontend" {
  source = "../../modules/s3-frontend"
  
  bucket_name                   = "antenna-simulator-frontend-${var.environment}-${data.aws_caller_identity.current.account_id}"
  cloudfront_distribution_arn   = ""  # Will be populated in Phase D
  allowed_origins               = ["https://${var.domain_name}"]
  
  tags = {
    Component = "frontend"
  }
}

# ============================================================================
# Data Sources
# ============================================================================

data "aws_caller_identity" "current" {}
