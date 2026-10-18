# ============================================================================
# Data retention — daily run of backend/projects/retention.py
# ============================================================================
# Deletes accounts inactive for a year and submissions older than a year, as
# stated in the privacy notice. The projects Lambda recognises the scheduled
# event (source "aws.events") and runs the job instead of the HTTP app.

resource "aws_cloudwatch_event_rule" "retention" {
  name                = "antenna-simulator-${var.environment}-retention"
  description         = "Daily GDPR retention: inactive accounts and old submissions"
  schedule_expression = "cron(30 3 * * ? *)" # 03:30 UTC
}

resource "aws_cloudwatch_event_target" "retention" {
  rule = aws_cloudwatch_event_rule.retention.name
  arn  = module.lambda_projects.function_arn
}

resource "aws_lambda_permission" "retention" {
  statement_id  = "AllowRetentionSchedule"
  action        = "lambda:InvokeFunction"
  function_name = module.lambda_projects.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.retention.arn
}
