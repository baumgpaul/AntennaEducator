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
# Cognito - User Authentication
# ============================================================================

module "cognito" {
  source = "../../modules/cognito"
  
  environment   = var.environment
  domain_name   = var.domain_name
  domain_suffix = "auth-${data.aws_caller_identity.current.account_id}"
  
  # MFA disabled for MVP, can be enabled later
  enable_mfa = "OFF"
  
  tags = {
    Component = "authentication"
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
# ECR - Container Registries
# ============================================================================

module "ecr_projects" {
  source = "../../modules/ecr"
  
  repository_name = "antenna-simulator-projects-${var.environment}"
  environment     = var.environment
  
  tags = {
    Component = "backend"
    Service   = "projects"
  }
}

module "ecr_preprocessor" {
  source = "../../modules/ecr"
  
  repository_name = "antenna-simulator-preprocessor-${var.environment}"
  environment     = var.environment
  
  tags = {
    Component = "backend"
    Service   = "preprocessor"
  }
}

module "ecr_solver" {
  source = "../../modules/ecr"
  
  repository_name = "antenna-simulator-solver-${var.environment}"
  environment     = var.environment
  
  tags = {
    Component = "backend"
    Service   = "solver"
  }
}

module "ecr_postprocessor" {
  source = "../../modules/ecr"
  
  repository_name = "antenna-simulator-postprocessor-${var.environment}"
  environment     = var.environment
  
  tags = {
    Component = "backend"
    Service   = "postprocessor"
  }
}

# ============================================================================
# Lambda Functions (container-based)
# ============================================================================

module "lambda_projects" {
  source = "../../modules/lambda"
  
  function_name = "antenna-simulator-projects-${var.environment}"
  image_uri     = "${module.ecr_projects.repository_url}:latest"
  environment   = var.environment
  region        = var.aws_region
  
  memory_size = 512
  timeout     = 30
  
  environment_variables = {
    USE_DYNAMODB       = "true"
    DYNAMODB_TABLE_NAME = module.dynamodb.table_name
    DISABLE_AUTH       = "true"  # Temporary for MVP
  }
  
  dynamodb_table_arns = [module.dynamodb.table_arn]
  
  create_function_url    = true
  function_url_auth_type = "NONE"
  cors_allowed_origins   = ["*"]
  
  tags = {
    Component = "backend"
    Service   = "projects"
  }
}

module "lambda_preprocessor" {
  source = "../../modules/lambda"
  
  function_name = "antenna-simulator-preprocessor-${var.environment}"
  image_uri     = "${module.ecr_preprocessor.repository_url}:latest"
  environment   = var.environment
  region        = var.aws_region
  
  memory_size = 512
  timeout     = 30
  
  environment_variables = {}
  
  create_function_url    = true
  function_url_auth_type = "NONE"
  cors_allowed_origins   = ["*"]
  
  tags = {
    Component = "backend"
    Service   = "preprocessor"
  }
}

module "lambda_solver" {
  source = "../../modules/lambda"
  
  function_name = "antenna-simulator-solver-${var.environment}"
  image_uri     = "${module.ecr_solver.repository_url}:latest"
  environment   = var.environment
  region        = var.aws_region
  
  memory_size = 2048
  timeout     = 900
  
  environment_variables = {}
  
  create_function_url    = true
  function_url_auth_type = "NONE"
  cors_allowed_origins   = ["*"]
  
  tags = {
    Component = "backend"
    Service   = "solver"
  }
}

module "lambda_postprocessor" {
  source = "../../modules/lambda"
  
  function_name = "antenna-simulator-postprocessor-${var.environment}"
  image_uri     = "${module.ecr_postprocessor.repository_url}:latest"
  environment   = var.environment
  region        = var.aws_region
  
  memory_size = 1024
  timeout     = 60
  
  environment_variables = {}
  
  create_function_url    = true
  function_url_auth_type = "NONE"
  cors_allowed_origins   = ["*"]
  
  tags = {
    Component = "backend"
    Service   = "postprocessor"
  }
}

# ============================================================================
# Data Sources
# ============================================================================

data "aws_caller_identity" "current" {}
