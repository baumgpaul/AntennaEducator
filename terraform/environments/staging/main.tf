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
      Repository  = "github.com/baumgpaul/AntennaEducator"
    }
  }
}

# Provider for ACM certificates (must be in us-east-1 for CloudFront)
provider "aws" {
  alias   = "us_east_1"
  region  = "us-east-1"
  profile = var.aws_profile

  default_tags {
    tags = {
      Project     = "antenna-simulator"
      Environment = "staging"
      ManagedBy   = "terraform"
      Repository  = "github.com/baumgpaul/AntennaEducator"
    }
  }
}

# ============================================================================
# Data Sources
# ============================================================================

data "aws_caller_identity" "current" {}

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
# S3 - Simulation Results (solver/postprocessor output)
# ============================================================================

module "s3_results" {
  source = "../../modules/s3-data"

  bucket_name                = "antenna-simulator-results-${var.environment}"
  allowed_origins            = ["https://${var.domain_name}", "http://localhost:3000"]
  enable_lifecycle           = true
  data_retention_days        = 0  # Keep forever in staging
  enable_intelligent_tiering = false  # Disable for staging (low volume)

  tags = {
    Component = "storage"
    Purpose   = "simulation-results"
  }
}

# ============================================================================
# S3 - Frontend (static website)
# ============================================================================

module "s3_frontend" {
  source = "../../modules/s3-frontend"

  bucket_name                   = "antenna-simulator-frontend-${var.environment}-${data.aws_caller_identity.current.account_id}"
  cloudfront_distribution_arn   = module.cloudfront.distribution_arn
  allowed_origins               = ["https://${var.domain_name}"]

  tags = {
    Component = "frontend"
  }
}

# ============================================================================
# Route53 - DNS Management
# ============================================================================

module "route53" {
  source = "../../modules/route53"

  domain_name                 = var.domain_name
  environment                 = var.environment

  # Use existing parent zone (nyakyagyawa.com)
  use_existing_zone          = true
  existing_zone_id           = "Z044958815N0VJY4808JQ"  # Your existing nyakyagyawa.com zone
  parent_domain_name         = "nyakyagyawa.com"

  cloudfront_domain_name      = module.cloudfront.distribution_domain_name
  cloudfront_hosted_zone_id   = module.cloudfront.distribution_hosted_zone_id
  create_www_subdomain        = false  # Set to true if you want www.antennaeducator.nyakyagyawa.com

  tags = {
    Component = "dns"
  }
}

# ============================================================================
# ACM Certificate - SSL/TLS (us-east-1 for CloudFront)
# ============================================================================

module "acm_certificate" {
  source = "../../modules/acm-certificate"

  providers = {
    aws.us_east_1 = aws.us_east_1
  }

  domain_name               = var.domain_name
  subject_alternative_names = []  # Add ["www.${var.domain_name}"] if needed
  route53_zone_id           = module.route53.zone_id
  environment               = var.environment

  tags = {
    Component = "ssl-certificate"
  }
}

# ============================================================================
# CloudFront - CDN for Frontend
# ============================================================================

module "cloudfront" {
  source = "../../modules/cloudfront"

  environment                       = var.environment
  s3_bucket_name                    = module.s3_frontend.bucket_name
  s3_bucket_regional_domain_name    = module.s3_frontend.bucket_regional_domain_name

  # SSL Certificate - custom domain with ACM
  acm_certificate_arn = module.acm_certificate.certificate_arn
  domain_aliases      = [var.domain_name]  # Add "www.${var.domain_name}" if needed

  price_class = "PriceClass_100"  # North America + Europe (cheapest)

  tags = {
    Component = "cdn"
  }

  depends_on = [module.acm_certificate]
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
    USE_DYNAMODB           = "true"
    DYNAMODB_TABLE_NAME    = module.dynamodb.table_name
    DISABLE_AUTH           = "false"  # Enable authentication with Cognito
    USE_COGNITO            = "true"   # Use Cognito JWT validation
    COGNITO_REGION         = var.aws_region
    COGNITO_USER_POOL_ID   = module.cognito.user_pool_id
    # S3 storage for simulation results
    USE_S3                 = "true"
    RESULTS_BUCKET_NAME    = module.s3_results.bucket_name
  }

  dynamodb_table_arns = [module.dynamodb.table_arn]
  s3_bucket_arns      = [module.s3_results.bucket_arn]

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

  memory_size = 2048
  timeout     = 300

  environment_variables = {
    POSTPROCESSOR_LOG_LEVEL = "INFO"
  }

  create_function_url    = true
  function_url_auth_type = "NONE"
  cors_allowed_origins   = ["*"]

  tags = {
    Component = "backend"
    Service   = "postprocessor"
  }
}

# ============================================================================
# API Gateway - Unified API for all services
# ============================================================================

module "api_gateway" {
  source = "../../modules/api-gateway"

  environment = var.environment
  enable_auth = false  # Disable auth for MVP, enable later with Cognito

  # Cognito configuration (for when auth is enabled)
  cognito_user_pool_id = module.cognito.user_pool_id
  cognito_client_id    = module.cognito.client_id
  cognito_issuer_url   = module.cognito.issuer_url

  # Lambda integrations
  lambda_projects_invoke_arn        = module.lambda_projects.invoke_arn
  lambda_projects_function_name     = module.lambda_projects.function_name
  lambda_preprocessor_invoke_arn    = module.lambda_preprocessor.invoke_arn
  lambda_preprocessor_function_name = module.lambda_preprocessor.function_name
  lambda_solver_invoke_arn          = module.lambda_solver.invoke_arn
  lambda_solver_function_name       = module.lambda_solver.function_name
  lambda_postprocessor_invoke_arn   = module.lambda_postprocessor.invoke_arn
  lambda_postprocessor_function_name = module.lambda_postprocessor.function_name

  # CORS configuration
  cors_allowed_origins = [
    "https://${var.domain_name}",
    "https://${module.cloudfront.distribution_domain_name}",  # CloudFront distribution
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:3004"
  ]

  # Throttling (generous limits for staging)
  throttling_burst_limit = 100
  throttling_rate_limit  = 50

  # Logging
  log_retention_days = 7

  # Custom domain (optional - can be added later)
  # custom_domain_name   = "api.${var.domain_name}"
  # acm_certificate_arn  = var.acm_certificate_arn
  # route53_zone_id      = var.route53_zone_id

  tags = {
    Component = "api-gateway"
  }
}

# ============================================================================
# CI/CD — CodePipeline + CodeBuild
# ============================================================================

module "cicd" {
  source = "../../modules/cicd"

  environment    = var.environment
  aws_region     = var.aws_region
  aws_account_id = data.aws_caller_identity.current.account_id

  # GitHub
  github_owner      = "baumgpaul"
  github_repository = "AntennaEducator"
  branch_name       = "main"

  # Deployment targets
  s3_frontend_bucket         = module.s3_frontend.bucket_name
  cloudfront_distribution_id = module.cloudfront.distribution_id
  domain_name                = var.domain_name

  # Notifications
  approval_email = "baumg.paul@gmail.com"

  tags = { Component = "cicd" }
}
