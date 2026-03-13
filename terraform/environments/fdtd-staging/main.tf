# Antenna Simulator — FDTD Staging Environment
# Subdomain: fdtd-stage.nyakyagyawa.com
# Shares Cognito + DynamoDB with the main staging stack.

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "antenna-simulator-terraform-state-767397882329"
    key            = "fdtd-staging/terraform.tfstate"
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
      Environment = var.environment
      ManagedBy   = "terraform"
      Repository  = "github.com/baumgpaul/AntennaEducator"
      Component   = "fdtd"
    }
  }
}

provider "aws" {
  alias   = "us_east_1"
  region  = "us-east-1"
  profile = var.aws_profile

  default_tags {
    tags = {
      Project     = "antenna-simulator"
      Environment = var.environment
      ManagedBy   = "terraform"
      Component   = "fdtd"
    }
  }
}

# ============================================================================
# Data Sources
# ============================================================================

data "aws_caller_identity" "current" {}

# Reference existing shared resources from main staging stack
data "terraform_remote_state" "staging" {
  backend = "s3"
  config = {
    bucket  = "antenna-simulator-terraform-state-767397882329"
    key     = "staging/terraform.tfstate"
    region  = "eu-west-1"
    profile = "antenna-staging"
  }
}

# ============================================================================
# S3 — FDTD Frontend (static website)
# ============================================================================

module "s3_frontend" {
  source = "../../modules/s3-frontend"

  bucket_name                 = "antenna-simulator-fdtd-frontend-${var.environment}-${data.aws_caller_identity.current.account_id}"
  cloudfront_distribution_arn = module.cloudfront.distribution_arn
  allowed_origins             = ["https://${var.domain_name}"]

  tags = {
    Component = "frontend"
    Solver    = "fdtd"
  }
}

# ============================================================================
# Route53 — DNS for fdtd-stage.nyakyagyawa.com
# ============================================================================

module "route53" {
  source = "../../modules/route53"

  domain_name = var.domain_name
  environment = var.environment

  use_existing_zone    = true
  existing_zone_id     = "Z044958815N0VJY4808JQ"
  parent_domain_name   = "nyakyagyawa.com"

  cloudfront_domain_name    = module.cloudfront.distribution_domain_name
  cloudfront_hosted_zone_id = module.cloudfront.distribution_hosted_zone_id
  create_www_subdomain      = false

  tags = { Component = "dns", Solver = "fdtd" }
}

# ============================================================================
# ACM Certificate — SSL/TLS (us-east-1 for CloudFront)
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

  tags = { Component = "ssl-certificate", Solver = "fdtd" }
}

# ============================================================================
# CloudFront — CDN for FDTD Frontend
# ============================================================================

module "cloudfront" {
  source = "../../modules/cloudfront"

  environment                    = var.environment
  s3_bucket_name                 = module.s3_frontend.bucket_name
  s3_bucket_regional_domain_name = module.s3_frontend.bucket_regional_domain_name

  acm_certificate_arn = module.acm_certificate.certificate_arn
  domain_aliases      = [var.domain_name]

  price_class = "PriceClass_100"

  tags = { Component = "cdn", Solver = "fdtd" }

  depends_on = [module.acm_certificate]
}

# ============================================================================
# ECR — FDTD Solver Container Registry
# ============================================================================

module "ecr_solver_fdtd" {
  source = "../../modules/ecr"

  repository_name = "antenna-simulator-solver-fdtd-${var.environment}"
  environment     = var.environment

  tags = { Component = "backend", Service = "solver-fdtd" }
}

# ============================================================================
# Lambda — FDTD Solver Function
# ============================================================================

module "lambda_solver_fdtd" {
  source = "../../modules/lambda"

  function_name = "antenna-simulator-solver-fdtd-${var.environment}"
  image_uri     = "${module.ecr_solver_fdtd.repository_url}:latest"
  environment   = var.environment
  region        = var.aws_region

  memory_size = 2048
  timeout     = 900

  environment_variables = {
    SOLVER_FDTD_LOG_LEVEL = "INFO"
  }

  create_function_url    = true
  function_url_auth_type = "NONE"
  cors_allowed_origins   = ["*"]

  tags = { Component = "backend", Service = "solver-fdtd" }
}

# ============================================================================
# ECR — FDTD Preprocessor Container Registry
# ============================================================================

module "ecr_preprocessor_fdtd" {
  source = "../../modules/ecr"

  repository_name = "antenna-simulator-preprocessor-fdtd-${var.environment}"
  environment     = var.environment

  tags = { Component = "backend", Service = "preprocessor-fdtd" }
}

# ============================================================================
# Lambda — FDTD Preprocessor Function
# ============================================================================

module "lambda_preprocessor_fdtd" {
  source = "../../modules/lambda"

  function_name = "antenna-simulator-preprocessor-fdtd-${var.environment}"
  image_uri     = "${module.ecr_preprocessor_fdtd.repository_url}:latest"
  environment   = var.environment
  region        = var.aws_region

  memory_size = 1024
  timeout     = 300

  environment_variables = {
    FDTD_PREPROCESSOR_LOG_LEVEL = "INFO"
  }

  create_function_url    = true
  function_url_auth_type = "NONE"
  cors_allowed_origins   = ["*"]

  tags = { Component = "backend", Service = "preprocessor-fdtd" }
}

# ============================================================================
# ECR — FDTD Postprocessor Container Registry
# ============================================================================

module "ecr_postprocessor_fdtd" {
  source = "../../modules/ecr"

  repository_name = "antenna-simulator-postprocessor-fdtd-${var.environment}"
  environment     = var.environment

  tags = { Component = "backend", Service = "postprocessor-fdtd" }
}

# ============================================================================
# Lambda — FDTD Postprocessor Function
# ============================================================================

module "lambda_postprocessor_fdtd" {
  source = "../../modules/lambda"

  function_name = "antenna-simulator-postprocessor-fdtd-${var.environment}"
  image_uri     = "${module.ecr_postprocessor_fdtd.repository_url}:latest"
  environment   = var.environment
  region        = var.aws_region

  memory_size = 2048
  timeout     = 300

  environment_variables = {
    FDTD_POSTPROCESSOR_LOG_LEVEL = "INFO"
  }

  create_function_url    = true
  function_url_auth_type = "NONE"
  cors_allowed_origins   = ["*"]

  tags = { Component = "backend", Service = "postprocessor-fdtd" }
}

# ============================================================================
# CI/CD — CodeBuild for FDTD pipeline
# ============================================================================

module "cicd" {
  source = "../../modules/cicd"

  environment    = var.environment
  aws_region     = var.aws_region
  aws_account_id = data.aws_caller_identity.current.account_id

  github_owner      = "baumgpaul"
  github_repository = "AntennaEducator"

  s3_frontend_bucket         = module.s3_frontend.bucket_name
  cloudfront_distribution_id = module.cloudfront.distribution_id

  create_oidc_provider = false  # OIDC provider already exists from main staging stack

  tags = { Component = "cicd", Solver = "fdtd" }
}

# ============================================================================
# Outputs
# ============================================================================

output "cloudfront_url" {
  value = "https://${var.domain_name}"
}

output "cloudfront_distribution_id" {
  value = module.cloudfront.distribution_id
}

output "s3_frontend_bucket" {
  value = module.s3_frontend.bucket_name
}

output "solver_fdtd_function_url" {
  value = module.lambda_solver_fdtd.function_url
}

output "ecr_solver_fdtd_url" {
  value = module.ecr_solver_fdtd.repository_url
}

output "preprocessor_fdtd_function_url" {
  value = module.lambda_preprocessor_fdtd.function_url
}

output "ecr_preprocessor_fdtd_url" {
  value = module.ecr_preprocessor_fdtd.repository_url
}

output "postprocessor_fdtd_function_url" {
  value = module.lambda_postprocessor_fdtd.function_url
}

output "ecr_postprocessor_fdtd_url" {
  value = module.ecr_postprocessor_fdtd.repository_url
}

output "github_actions_role_arn" {
  value = module.cicd.github_actions_role_arn
}

output "artifacts_bucket" {
  value = module.cicd.artifacts_bucket
}
