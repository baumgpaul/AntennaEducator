# CI/CD Module — deploys from GitHub Actions (free)
#
# The CI/CD flow is driven by GitHub Actions (.github/workflows/):
#   1. pr-checks.yml           — lint + tests on every PR (GitHub-hosted)
#   2. aws-build-and-merge.yml — deploy-to-staging label: build + deploy on the
#                                GitHub runner → manual staging verification → auto-merge
#
# This module provisions:
#   - GitHub OIDC provider + IAM role for GH Actions → AWS authentication
#   - the deploy configuration in SSM (github_deploy.tf)
#
# Cost: $0. (The idle CodeBuild fallback was removed 2026-11-23.)

# ─── CodeStar Connection to GitHub ─────────────────────────────────────
# Retained for potential future use (e.g. CodePipeline, CodeBuild GitHub triggers).
# If you completed the connection in the AWS Console, it stays valid.
resource "aws_codestarconnections_connection" "github" {
  name          = "antenna-simulator-github-${var.environment}"
  provider_type = "GitHub"
  tags          = var.tags
}
