# CI/CD Module — Outputs

output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions (set as AWS_DEPLOY_ROLE_ARN secret)"
  value       = aws_iam_role.github_actions.arn
}

output "codestar_connection_arn" {
  description = "CodeStar connection ARN (retained for potential future use)"
  value       = aws_codestarconnections_connection.github.arn
}
