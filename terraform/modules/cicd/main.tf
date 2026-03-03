# CI/CD Module — GitHub Actions orchestrated CodeBuild
#
# The CI/CD flow is driven by GitHub Actions (.github/workflows/):
#   1. pr-checks.yml          — lint + tests on every PR (GitHub-hosted)
#   2. aws-build-and-merge.yml — on PR approval: CodeBuild test → deploy →
#                                 manual staging verification → auto-merge
#
# This module provisions:
#   - CodeBuild projects (test + deploy)
#   - S3 bucket for build artifacts / source uploads
#   - GitHub OIDC provider + IAM role for GH Actions → AWS authentication
#
# Cost: ~$2-4/month (CodeBuild build minutes only)

# ─── CodeStar Connection to GitHub ─────────────────────────────────────
# Retained for potential future use (e.g. CodePipeline, CodeBuild GitHub triggers).
# If you completed the connection in the AWS Console, it stays valid.
resource "aws_codestarconnections_connection" "github" {
  name          = "antenna-simulator-github-${var.environment}"
  provider_type = "GitHub"
  tags          = var.tags
}

# ─── S3 Bucket for Pipeline Artifacts ──────────────────────────────────
resource "aws_s3_bucket" "artifacts" {
  bucket        = "antenna-simulator-pipeline-${var.environment}-${var.aws_account_id}"
  force_destroy = true
  tags          = merge(var.tags, { Name = "pipeline-artifacts" })
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    id     = "expire-old-artifacts"
    status = "Enabled"
    filter {}
    expiration { days = 30 }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ─── CodeBuild — Test Stage ───────────────────────────────────────────
resource "aws_codebuild_project" "test" {
  name         = "antenna-simulator-test-${var.environment}"
  description  = "Lint + unit tests (Python + frontend)"
  service_role = aws_iam_role.codebuild.arn

  source {
    type      = "S3"
    location  = "${aws_s3_bucket.artifacts.bucket}/codebuild/placeholder.zip"
    buildspec = "buildspec-test.yml"
  }

  artifacts {
    type = "NO_ARTIFACTS"
    name = ""
  }

  environment {
    compute_type    = "BUILD_GENERAL1_SMALL" # 3 GB, 2 vCPU — $0.005/min
    image           = "aws/codebuild/amazonlinux2-x86_64-standard:5.0"
    type            = "LINUX_CONTAINER"
    privileged_mode = false
  }

  cache {
    type = "LOCAL"
    modes = ["LOCAL_CUSTOM_CACHE"]
  }

  logs_config {
    cloudwatch_logs {
      group_name  = "/aws/codebuild/antenna-simulator-test-${var.environment}"
      stream_name = ""
    }
  }

  tags = merge(var.tags, { Stage = "test" })
}

# ─── CodeBuild — Deploy Stage ─────────────────────────────────────────
resource "aws_codebuild_project" "deploy" {
  name         = "antenna-simulator-deploy-${var.environment}"
  description  = "Build Docker images, deploy to Lambda + S3"
  service_role = aws_iam_role.codebuild.arn

  source {
    type      = "S3"
    location  = "${aws_s3_bucket.artifacts.bucket}/codebuild/placeholder.zip"
    buildspec = "buildspec-deploy.yml"
  }

  artifacts {
    type = "NO_ARTIFACTS"
    name = ""
  }

  environment {
    compute_type    = "BUILD_GENERAL1_MEDIUM" # 7 GB, 4 vCPU — $0.01/min
    image           = "aws/codebuild/amazonlinux2-x86_64-standard:5.0"
    type            = "LINUX_CONTAINER"
    privileged_mode = true # Required for Docker builds

    environment_variable {
      name  = "AWS_ACCOUNT_ID"
      value = var.aws_account_id
    }
    environment_variable {
      name  = "AWS_DEFAULT_REGION"
      value = var.aws_region
    }
    environment_variable {
      name  = "ENVIRONMENT"
      value = var.environment
    }
    environment_variable {
      name  = "S3_FRONTEND_BUCKET"
      value = var.s3_frontend_bucket
    }
    environment_variable {
      name  = "CLOUDFRONT_DISTRIBUTION_ID"
      value = var.cloudfront_distribution_id
    }
  }

  cache {
    type = "LOCAL"
    modes = ["LOCAL_DOCKER_LAYER_CACHE", "LOCAL_CUSTOM_CACHE"]
  }

  logs_config {
    cloudwatch_logs {
      group_name  = "/aws/codebuild/antenna-simulator-deploy-${var.environment}"
      stream_name = ""
    }
  }

  # Docker builds with numpy/scipy can take a while
  build_timeout = 30 # minutes

  tags = merge(var.tags, { Stage = "deploy" })
}

# ─── CloudWatch Log Groups ────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "codebuild_test" {
  name              = "/aws/codebuild/antenna-simulator-test-${var.environment}"
  retention_in_days = 14
  tags              = var.tags
}

resource "aws_cloudwatch_log_group" "codebuild_deploy" {
  name              = "/aws/codebuild/antenna-simulator-deploy-${var.environment}"
  retention_in_days = 14
  tags              = var.tags
}
