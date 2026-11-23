# CI/CD Module — IAM Roles and Policies

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
        # Only the two contexts that deploy: PR runs (the deploy-to-staging
        # label) and manual runs on main. Fork PRs never get an OIDC token.
        StringLike = {
          "token.actions.githubusercontent.com:sub" = [
            "repo:${var.github_owner}/${var.github_repository}:pull_request",
            "repo:${var.github_owner}/${var.github_repository}:ref:refs/heads/main",
          ]
        }
      }
    }]
  })

  tags = var.tags
}
