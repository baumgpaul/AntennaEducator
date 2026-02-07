# CI/CD Module — Outputs

output "pipeline_name" {
  description = "CodePipeline name"
  value       = aws_codepipeline.main.name
}

output "pipeline_arn" {
  description = "CodePipeline ARN"
  value       = aws_codepipeline.main.arn
}

output "codestar_connection_arn" {
  description = "CodeStar connection ARN (must be completed in AWS Console)"
  value       = aws_codestarconnections_connection.github.arn
}

output "codestar_connection_status" {
  description = "CodeStar connection status (PENDING until manually completed)"
  value       = aws_codestarconnections_connection.github.connection_status
}

output "codebuild_test_project" {
  description = "CodeBuild test project name"
  value       = aws_codebuild_project.test.name
}

output "codebuild_deploy_project" {
  description = "CodeBuild deploy project name"
  value       = aws_codebuild_project.deploy.name
}

output "approval_topic_arn" {
  description = "SNS topic ARN for deployment approval notifications"
  value       = aws_sns_topic.approval.arn
}

output "artifacts_bucket" {
  description = "S3 bucket for pipeline artifacts"
  value       = aws_s3_bucket.artifacts.bucket
}
