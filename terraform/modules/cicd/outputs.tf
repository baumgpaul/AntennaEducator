# CI/CD Module — Outputs

output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions (set as AWS_DEPLOY_ROLE_ARN secret)"
  value       = aws_iam_role.github_actions.arn
}

output "codestar_connection_arn" {
  description = "CodeStar connection ARN (retained for potential future use)"
  value       = aws_codestarconnections_connection.github.arn
}

output "codebuild_test_project" {
  description = "CodeBuild test project name"
  value       = aws_codebuild_project.test.name
}

output "codebuild_deploy_project" {
  description = "CodeBuild deploy project name"
  value       = aws_codebuild_project.deploy.name
}

output "artifacts_bucket" {
  description = "S3 bucket for pipeline artifacts (set as AWS_ARTIFACTS_BUCKET secret)"
  value       = aws_s3_bucket.artifacts.bucket
}
