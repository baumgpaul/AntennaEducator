# ============================================================================
# FEM Studio service (preview; var.enable_fem, default false = nothing, $0)
# ============================================================================
# One Lambda (container: FastAPI + Gmsh + fem_mesher + fem_solver) behind
# CloudFront at /svc/fem. Only maintainers/admins can use it (frontend and
# backend gates). Cost: Lambda time per mesh/solve request only (seconds);
# ECR storage of one ~1 GB image ≈ $0.10/month.
#
# First rollout in an environment (an image Lambda needs its image to exist):
#   1. terraform apply -target=module.ecr_fem       (repository)
#   2. deploy (GitHub Actions pushes the fem image; the function does not exist yet)
#   3. terraform apply                               (function, CloudFront route, deploy config)

locals {
  fem = var.enable_fem
}

module "ecr_fem" {
  count  = local.fem ? 1 : 0
  source = "../../modules/ecr"

  repository_name = "antenna-simulator-fem-${var.environment}"
  environment     = var.environment

  tags = {
    Component = "backend"
    Service   = "fem"
  }
}

module "lambda_fem" {
  count  = local.fem ? 1 : 0
  source = "../../modules/lambda"

  function_name = "antenna-simulator-fem-${var.environment}"
  image_uri     = "${module.ecr_fem[0].repository_url}:latest"
  environment   = var.environment
  region        = var.aws_region

  memory_size                    = 2048 # ≈ 1.2 vCPU for meshing + sparse solves
  timeout                        = 90   # CloudFront answers after 60 s anyway
  reserved_concurrent_executions = 2    # preview: a few maintainers, hard cost cap

  environment_variables = {
    USE_COGNITO          = "true"
    COGNITO_USER_POOL_ID = module.cognito.user_pool_id
    COGNITO_CLIENT_ID    = module.cognito.client_id
    COGNITO_REGION       = var.aws_region
    USE_DYNAMODB         = "true"
    DYNAMODB_TABLE_NAME  = module.dynamodb.table_name
  }

  dynamodb_table_arns = [module.dynamodb.table_arn]

  create_function_url    = true
  function_url_auth_type = var.api_origin_signing ? "AWS_IAM" : "NONE"
  cors_allowed_origins   = []

  tags = {
    Component = "backend"
    Service   = "fem"
  }
}
