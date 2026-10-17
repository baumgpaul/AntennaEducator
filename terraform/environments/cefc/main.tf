# Antenna Simulator - CEFC Environment
# Domain: cefcantennaeducator.nyakyagyawa.com
# AWS Region: eu-west-1 (Ireland)
# Separate from staging — independent data, users, Cognito pool, DynamoDB.

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state in the same S3 bucket, separate key
  # The bucket name is account-specific and kept out of git (partial config):
  #   terraform init -backend-config=backend.hcl   (see backend.hcl.example)
  backend "s3" {
    key            = "cefc/terraform.tfstate"
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
      Environment = "cefc"
      ManagedBy   = "terraform"
      Repository  = "github.com/baumgpaul/AntennaEducator"
      CostCenter  = "antenna-edu"
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
      Environment = "cefc"
      ManagedBy   = "terraform"
      Repository  = "github.com/baumgpaul/AntennaEducator"
      CostCenter  = "antenna-edu"
    }
  }
}

# ============================================================================
# Data Sources
# ============================================================================

data "aws_caller_identity" "current" {}

# ============================================================================
# Cognito - User Authentication (isolated from staging)
# ============================================================================

module "cognito" {
  source = "../../modules/cognito"

  environment   = var.environment
  domain_name   = var.domain_name
  domain_suffix = "auth-${data.aws_caller_identity.current.account_id}-cefc"

  enable_mfa = "OFF"

  # Default password policy (lower + upper + digit, min 8). seed_cefc_users.py
  # generates random passwords that satisfy it, so no relaxation is needed.

  tags = {
    Component = "authentication"
  }
}

# ============================================================================
# DynamoDB - Application Database (isolated from staging)
# ============================================================================

module "dynamodb" {
  source = "../../modules/dynamodb"

  table_name                    = "antenna-simulator-${var.environment}"
  enable_point_in_time_recovery = true
  enable_streams                = false

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
  data_retention_days        = 0
  enable_intelligent_tiering = false

  tags = {
    Component = "storage"
  }
}

# ============================================================================
# S3 - Simulation Results
# ============================================================================

module "s3_results" {
  source = "../../modules/s3-data"

  bucket_name                = "antenna-simulator-results-${var.environment}"
  allowed_origins            = ["https://${var.domain_name}", "http://localhost:3000"]
  enable_lifecycle           = true
  data_retention_days        = 365
  enable_intelligent_tiering = false
  # Results are read back by the app (project + submission hydration): no Glacier
  enable_glacier_transition  = false

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

  bucket_name                 = "antenna-simulator-frontend-${var.environment}-${data.aws_caller_identity.current.account_id}"
  cloudfront_distribution_arn = module.cloudfront.distribution_arn
  allowed_origins             = ["https://${var.domain_name}"]

  tags = {
    Component = "frontend"
  }
}

# ============================================================================
# Route53 - DNS Management
# ============================================================================

module "route53" {
  source = "../../modules/route53"

  domain_name  = var.domain_name
  environment  = var.environment

  # Reuse the existing parent zone
  use_existing_zone      = true
  parent_domain_name     = "nyakyagyawa.com"

  cloudfront_domain_name    = module.cloudfront.distribution_domain_name
  cloudfront_hosted_zone_id = module.cloudfront.distribution_hosted_zone_id
  create_www_subdomain      = false

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
  subject_alternative_names = []
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

  environment                    = var.environment
  s3_bucket_name                 = module.s3_frontend.bucket_name
  s3_bucket_regional_domain_name = module.s3_frontend.bucket_regional_domain_name

  acm_certificate_arn = module.acm_certificate.certificate_arn
  domain_aliases      = [var.domain_name]

  price_class = "PriceClass_100"

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

  memory_size                    = 512
  timeout                        = 30
  reserved_concurrent_executions = 10

  environment_variables = {
    USE_DYNAMODB            = "true"
    DYNAMODB_TABLE_NAME     = module.dynamodb.table_name
    DISABLE_AUTH            = "false"
    USE_COGNITO             = "true"
    COGNITO_REGION          = var.aws_region
    COGNITO_USER_POOL_ID    = module.cognito.user_pool_id
    COGNITO_CLIENT_ID       = module.cognito.client_id
    USE_S3                  = "true"
    RESULTS_BUCKET_NAME     = module.s3_results.bucket_name
    USE_FUNCTION_URL_CORS   = "true"
  }

  dynamodb_table_arns = [module.dynamodb.table_arn]
  s3_bucket_arns      = [module.s3_results.bucket_arn]

  create_function_url    = true
  function_url_auth_type = "NONE"
  cors_allowed_origins   = [
    "https://${var.domain_name}",
    "http://localhost:5173",
    "http://localhost:3000",
  ]

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

  memory_size                    = 512
  timeout                        = 30
  reserved_concurrent_executions = 5

  environment_variables = {
    USE_COGNITO               = "true"
    COGNITO_USER_POOL_ID      = module.cognito.user_pool_id
    COGNITO_CLIENT_ID         = module.cognito.client_id
    COGNITO_REGION            = var.aws_region
    USE_DYNAMODB              = "true"
    DYNAMODB_TABLE_NAME       = module.dynamodb.table_name
    PREPROCESSOR_CORS_ORIGINS = jsonencode(["*"])
    USE_FUNCTION_URL_CORS     = "true"
  }

  dynamodb_table_arns = [module.dynamodb.table_arn]

  create_function_url    = true
  function_url_auth_type = "NONE"
  cors_allowed_origins   = [
    "https://${var.domain_name}",
    "http://localhost:5173",
    "http://localhost:3000",
  ]

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

  memory_size                    = 2048
  timeout                        = 900
  reserved_concurrent_executions = 10

  environment_variables = {
    USE_COGNITO           = "true"
    COGNITO_USER_POOL_ID  = module.cognito.user_pool_id
    COGNITO_CLIENT_ID     = module.cognito.client_id
    COGNITO_REGION        = var.aws_region
    USE_DYNAMODB          = "true"
    DYNAMODB_TABLE_NAME   = module.dynamodb.table_name
    SOLVER_CORS_ORIGINS   = jsonencode(["*"])
    USE_FUNCTION_URL_CORS = "true"
  }

  dynamodb_table_arns = [module.dynamodb.table_arn]

  create_function_url    = true
  function_url_auth_type = "NONE"
  cors_allowed_origins   = [
    "https://${var.domain_name}",
    "http://localhost:5173",
    "http://localhost:3000",
  ]

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

  memory_size                    = 2048
  timeout                        = 300
  reserved_concurrent_executions = 5

  environment_variables = {
    USE_COGNITO                = "true"
    COGNITO_USER_POOL_ID       = module.cognito.user_pool_id
    COGNITO_CLIENT_ID          = module.cognito.client_id
    COGNITO_REGION             = var.aws_region
    USE_DYNAMODB               = "true"
    DYNAMODB_TABLE_NAME        = module.dynamodb.table_name
    POSTPROCESSOR_LOG_LEVEL    = "INFO"
    POSTPROCESSOR_CORS_ORIGINS = jsonencode(["*"])
    USE_FUNCTION_URL_CORS      = "true"
  }

  dynamodb_table_arns = [module.dynamodb.table_arn]

  create_function_url    = true
  function_url_auth_type = "NONE"
  cors_allowed_origins   = [
    "https://${var.domain_name}",
    "http://localhost:5173",
    "http://localhost:3000",
  ]

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
  enable_auth = false

  cognito_user_pool_id = module.cognito.user_pool_id
  cognito_client_id    = module.cognito.client_id
  cognito_issuer_url   = module.cognito.issuer_url

  lambda_projects_invoke_arn         = module.lambda_projects.invoke_arn
  lambda_projects_function_name      = module.lambda_projects.function_name
  lambda_preprocessor_invoke_arn     = module.lambda_preprocessor.invoke_arn
  lambda_preprocessor_function_name  = module.lambda_preprocessor.function_name
  lambda_solver_invoke_arn           = module.lambda_solver.invoke_arn
  lambda_solver_function_name        = module.lambda_solver.function_name
  lambda_postprocessor_invoke_arn    = module.lambda_postprocessor.invoke_arn
  lambda_postprocessor_function_name = module.lambda_postprocessor.function_name

  cors_allowed_origins = [
    "https://${var.domain_name}",
    "https://${module.cloudfront.distribution_domain_name}",
    "http://localhost:3000",
    "http://localhost:5173",
  ]

  throttling_burst_limit = 100
  throttling_rate_limit  = 50

  log_retention_days = 7

  tags = {
    Component = "api-gateway"
  }
}
