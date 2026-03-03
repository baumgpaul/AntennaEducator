# CI/CD Module — IAM Roles and Policies

# ─── CodeBuild Service Role ───────────────────────────────────────────
resource "aws_iam_role" "codebuild" {
  name = "antenna-simulator-codebuild-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "codebuild.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = var.tags
}

# CloudWatch Logs — write build logs
resource "aws_iam_role_policy" "codebuild_logs" {
  name = "codebuild-logs"
  role = aws_iam_role.codebuild.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ]
      Resource = [
        "arn:aws:logs:${var.aws_region}:${var.aws_account_id}:log-group:/aws/codebuild/*"
      ]
    }]
  })
}

# S3 — read/write pipeline artifacts
resource "aws_iam_role_policy" "codebuild_s3_artifacts" {
  name = "codebuild-s3-artifacts"
  role = aws_iam_role.codebuild.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:GetBucketLocation"
      ]
      Resource = [
        aws_s3_bucket.artifacts.arn,
        "${aws_s3_bucket.artifacts.arn}/*"
      ]
    }]
  })
}

# ECR — pull/push container images
resource "aws_iam_role_policy" "codebuild_ecr" {
  name = "codebuild-ecr"
  role = aws_iam_role.codebuild.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload"
        ]
        Resource = [
          "arn:aws:ecr:${var.aws_region}:${var.aws_account_id}:repository/antenna-simulator-*-${var.environment}"
        ]
      }
    ]
  })
}

# Lambda — update function code
resource "aws_iam_role_policy" "codebuild_lambda" {
  name = "codebuild-lambda"
  role = aws_iam_role.codebuild.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "lambda:UpdateFunctionCode",
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration"
      ]
      Resource = [
        "arn:aws:lambda:${var.aws_region}:${var.aws_account_id}:function:antenna-simulator-*-${var.environment}"
      ]
    }]
  })
}

# S3 — deploy frontend
resource "aws_iam_role_policy" "codebuild_s3_frontend" {
  name = "codebuild-s3-frontend"
  role = aws_iam_role.codebuild.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:GetBucketLocation"
      ]
      Resource = [
        "arn:aws:s3:::${var.s3_frontend_bucket}",
        "arn:aws:s3:::${var.s3_frontend_bucket}/*"
      ]
    }]
  })
}

# CloudFront — invalidate cache after frontend deploy
resource "aws_iam_role_policy" "codebuild_cloudfront" {
  name = "codebuild-cloudfront"
  role = aws_iam_role.codebuild.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["cloudfront:CreateInvalidation"]
      Resource = ["arn:aws:cloudfront::${var.aws_account_id}:distribution/${var.cloudfront_distribution_id}"]
    }]
  })
}

# CodeBuild Reports — create/update test report groups
resource "aws_iam_role_policy" "codebuild_reports" {
  name = "codebuild-reports"
  role = aws_iam_role.codebuild.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "codebuild:CreateReportGroup",
        "codebuild:CreateReport",
        "codebuild:UpdateReport",
        "codebuild:BatchPutTestCases",
        "codebuild:BatchPutCodeCoverages"
      ]
      Resource = [
        "arn:aws:codebuild:${var.aws_region}:${var.aws_account_id}:report-group/antenna-simulator-*"
      ]
    }]
  })
}

# ─── GitHub OIDC Provider ─────────────────────────────────────────────
# Allows GitHub Actions to assume IAM roles via OpenID Connect (no long-lived keys).
# Only ONE provider per URL per AWS account — if another project already created
# this, import it: terraform import aws_iam_openid_connect_provider.github <arn>
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["ffffffffffffffffffffffffffffffffffffffff"] # AWS does not verify GitHub OIDC thumbprints
  tags            = var.tags
}

# ─── IAM Role for GitHub Actions ──────────────────────────────────────
# Assumed by the aws-build-and-merge.yml workflow via OIDC.
resource "aws_iam_role" "github_actions" {
  name = "antenna-simulator-github-actions-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.github.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:${var.github_owner}/${var.github_repository}:*"
        }
      }
    }]
  })

  tags = var.tags
}

# GitHub Actions → start and monitor CodeBuild builds
resource "aws_iam_role_policy" "github_actions_codebuild" {
  name = "github-actions-codebuild"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "codebuild:StartBuild",
        "codebuild:BatchGetBuilds",
        "codebuild:StopBuild"
      ]
      Resource = [
        aws_codebuild_project.test.arn,
        aws_codebuild_project.deploy.arn
      ]
    }]
  })
}

# GitHub Actions → upload/delete source artifacts in S3
resource "aws_iam_role_policy" "github_actions_s3" {
  name = "github-actions-s3"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:DeleteObject"]
        Resource = ["${aws_s3_bucket.artifacts.arn}/github-actions/*"]
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = [aws_s3_bucket.artifacts.arn]
      }
    ]
  })
}
