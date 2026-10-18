# ─── Deploy directly from GitHub Actions (default, $0) ────────────────
# GitHub-hosted runners are free for public repositories, so the deploy job
# builds images and the frontend itself (.github/workflows/aws-build-and-merge.yml).
# CodeBuild stays provisioned (idle projects cost nothing) as a fallback:
# set the repository variable DEPLOY_RUNNER=codebuild to use it (BUILD_GENERAL1_MEDIUM,
# ~$0.01/min, ~$0.15–0.30 per deploy).

# Everything the deploy job needs besides credentials, in one place.
# SSM standard parameters are free.
resource "aws_ssm_parameter" "deploy_config" {
  name        = "/antenna-simulator/${var.environment}/deploy-config"
  description = "Frontend build env + deploy targets for the GitHub Actions deploy job"
  type        = "String"
  value = jsonencode({
    frontend_env               = var.frontend_build_env
    s3_frontend_bucket         = var.s3_frontend_bucket
    cloudfront_distribution_id = var.cloudfront_distribution_id
    aws_account_id             = var.aws_account_id
  })
  tags = var.tags
}

resource "aws_iam_role_policy" "github_actions_deploy" {
  name = "github-actions-deploy"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadDeployConfig"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter"]
        Resource = aws_ssm_parameter.deploy_config.arn
      },
      {
        Sid      = "EcrLogin"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Sid    = "EcrPush"
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
        Resource = "arn:aws:ecr:${var.aws_region}:${var.aws_account_id}:repository/antenna-simulator-*-${var.environment}"
      },
      {
        Sid    = "LambdaUpdate"
        Effect = "Allow"
        Action = [
          "lambda:UpdateFunctionCode",
          "lambda:GetFunction",
          "lambda:GetFunctionConfiguration"
        ]
        Resource = "arn:aws:lambda:${var.aws_region}:${var.aws_account_id}:function:antenna-simulator-*-${var.environment}"
      },
      {
        Sid    = "FrontendBucket"
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:DeleteObject", "s3:ListBucket", "s3:GetBucketLocation"]
        Resource = [
          "arn:aws:s3:::${var.s3_frontend_bucket}",
          "arn:aws:s3:::${var.s3_frontend_bucket}/*"
        ]
      },
      {
        Sid      = "InvalidateCdn"
        Effect   = "Allow"
        Action   = ["cloudfront:CreateInvalidation"]
        Resource = "arn:aws:cloudfront::${var.aws_account_id}:distribution/${var.cloudfront_distribution_id}"
      }
    ]
  })
}
