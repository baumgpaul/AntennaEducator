# CI/CD Module — CodePipeline + CodeBuild
#
# Pipeline stages:
#   1. Source   — GitHub (via CodeStar Connection)
#   2. Test     — CodeBuild: lint + pytest + frontend tests
#   3. Deploy   — CodeBuild: Docker build → ECR → Lambda + S3 frontend
#   4. Approval — Manual approval with SNS email notification
#
# Cost: ~$3-5/month (CodePipeline $1 + CodeBuild build minutes)

# ─── CodeStar Connection to GitHub ─────────────────────────────────────
# After terraform apply, you MUST complete the connection in the AWS Console:
#   Developer Tools → Settings → Connections → click "Update pending connection"
#   → Authorize AWS to access your GitHub account → Install the AWS Connector app
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

# ─── SNS Topic for Manual Approval ────────────────────────────────────
resource "aws_sns_topic" "approval" {
  name = "antenna-simulator-deploy-approval-${var.environment}"
  tags = var.tags
}

resource "aws_sns_topic_subscription" "approval_email" {
  topic_arn = aws_sns_topic.approval.arn
  protocol  = "email"
  endpoint  = var.approval_email
}

# ─── CodeBuild — Test Stage ───────────────────────────────────────────
resource "aws_codebuild_project" "test" {
  name         = "antenna-simulator-test-${var.environment}"
  description  = "Lint + unit tests (Python + frontend)"
  service_role = aws_iam_role.codebuild.arn

  source {
    type      = "CODEPIPELINE"
    buildspec = "buildspec-test.yml"
  }

  artifacts {
    type = "CODEPIPELINE"
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
    type      = "CODEPIPELINE"
    buildspec = "buildspec-deploy.yml"
  }

  artifacts {
    type = "CODEPIPELINE"
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

# ─── CodePipeline ─────────────────────────────────────────────────────
resource "aws_codepipeline" "main" {
  name          = "antenna-simulator-${var.environment}"
  role_arn      = aws_iam_role.codepipeline.arn
  pipeline_type = "V2"

  artifact_store {
    type     = "S3"
    location = aws_s3_bucket.artifacts.bucket
  }

  # Stage 1: Source — pull from GitHub on push to main
  stage {
    name = "Source"
    action {
      name             = "GitHub"
      category         = "Source"
      owner            = "AWS"
      provider         = "CodeStarSourceConnection"
      version          = "1"
      output_artifacts = ["source_output"]
      configuration = {
        ConnectionArn    = aws_codestarconnections_connection.github.arn
        FullRepositoryId = "${var.github_owner}/${var.github_repository}"
        BranchName       = var.branch_name
      }
    }
  }

  # Stage 2: Test — lint + unit tests
  stage {
    name = "Test"
    action {
      name             = "LintAndTest"
      category         = "Build"
      owner            = "AWS"
      provider         = "CodeBuild"
      version          = "1"
      input_artifacts  = ["source_output"]
      output_artifacts = ["test_output"]
      configuration = {
        ProjectName = aws_codebuild_project.test.name
      }
    }
  }

  # Stage 3: Deploy — build images + deploy to staging
  stage {
    name = "Deploy"
    action {
      name            = "BuildAndDeploy"
      category        = "Build"
      owner           = "AWS"
      provider        = "CodeBuild"
      version         = "1"
      input_artifacts = ["source_output"]
      configuration = {
        ProjectName = aws_codebuild_project.deploy.name
      }
    }
  }

  # Stage 4: Manual Approval — test staging, then approve
  stage {
    name = "Approval"
    action {
      name     = "ManualApproval"
      category = "Approval"
      owner    = "AWS"
      provider = "Manual"
      version  = "1"
      configuration = {
        NotificationArn    = aws_sns_topic.approval.arn
        CustomData         = "Staging deployed. Please verify at https://${var.domain_name} then approve."
        ExternalEntityLink = "https://${var.domain_name}"
      }
    }
  }

  tags = var.tags
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
