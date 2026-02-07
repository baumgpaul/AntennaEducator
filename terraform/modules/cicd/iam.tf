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

# ─── CodePipeline Service Role ────────────────────────────────────────
resource "aws_iam_role" "codepipeline" {
  name = "antenna-simulator-codepipeline-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "codepipeline.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "codepipeline" {
  name = "codepipeline-policy"
  role = aws_iam_role.codepipeline.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # S3 artifacts
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:ListBucket",
          "s3:GetBucketVersioning"
        ]
        Resource = [
          aws_s3_bucket.artifacts.arn,
          "${aws_s3_bucket.artifacts.arn}/*"
        ]
      },
      {
        # CodeStar connection (GitHub source)
        Effect   = "Allow"
        Action   = ["codestar-connections:UseConnection"]
        Resource = [aws_codestarconnections_connection.github.arn]
      },
      {
        # CodeBuild
        Effect = "Allow"
        Action = [
          "codebuild:BatchGetBuilds",
          "codebuild:StartBuild"
        ]
        Resource = [
          aws_codebuild_project.test.arn,
          aws_codebuild_project.deploy.arn
        ]
      },
      {
        # SNS — manual approval notifications
        Effect   = "Allow"
        Action   = ["sns:Publish"]
        Resource = [aws_sns_topic.approval.arn]
      }
    ]
  })
}
