# ============================================================================
# Asynchronous solve jobs (var.async_jobs = "lambda"; default "off" = nothing)
# ============================================================================
# CloudFront waits at most 60 s for the API; with jobs the browser submits a
# solve and polls (backend/solver/jobs.py). The solver Lambda itself is the
# worker, so there is no extra function, image or always-on compute.
#
# Cost at classroom scale (30 students x 50 solves / month):
#   SQS        ~6k job requests + ~650k idle long polls  -> within the 1 M free tier
#   Lambda     same GB-seconds as synchronous solves        -> no extra cost
#   DynamoDB   ~5k writes, ~25k reads (on demand)           -> ~$0.02
#   S3         job objects deleted after 7 days             -> ~$0.01
#   Alarm      1 dead-letter alarm (if enable_ops_alarms)   -> ~$0.10
# No VPC, so no NAT gateway (~$35/month) is needed.

locals {
  async_jobs     = var.async_jobs == "lambda"
  solver_timeout = 900 # Lambda maximum; also sizes the queue visibility timeout
}

resource "aws_sqs_queue" "jobs_dlq" {
  count                     = local.async_jobs ? 1 : 0
  name                      = "antenna-simulator-${var.environment}-jobs-dlq"
  message_retention_seconds = 345600 # 4 days to inspect failures
}

resource "aws_sqs_queue" "jobs" {
  count = local.async_jobs ? 1 : 0
  name  = "antenna-simulator-${var.environment}-jobs"
  # Must exceed the worker's timeout, or a running solve is delivered twice
  visibility_timeout_seconds = local.solver_timeout + 60
  message_retention_seconds  = 86400 # jobs older than a day are not worth running
  receive_wait_time_seconds  = 20    # long polling: fewer (billed) empty receives
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.jobs_dlq[0].arn
    maxReceiveCount     = 2 # a crash (timeout, out of memory) is retried once
  })
}

resource "aws_lambda_event_source_mapping" "jobs" {
  count            = local.async_jobs ? 1 : 0
  event_source_arn = aws_sqs_queue.jobs[0].arn
  function_name    = module.lambda_solver.function_name
  batch_size       = 1
  scaling_config {
    # Leaves 5 of the solver's 10 reserved executions for synchronous solves
    maximum_concurrency = 5
  }
}

resource "aws_iam_role_policy" "solver_jobs" {
  count = local.async_jobs ? 1 : 0
  name  = "solver-async-jobs"
  role  = module.lambda_solver.role_name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SubmitJobs"
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = aws_sqs_queue.jobs[0].arn
      },
      {
        Sid      = "ConsumeJobs"
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = aws_sqs_queue.jobs[0].arn
      }
    ]
  })
}

# Jobs that crashed twice: worth an e-mail
resource "aws_cloudwatch_metric_alarm" "jobs_dlq" {
  count = local.async_jobs && local.ops_alarms ? 1 : 0

  alarm_name          = "antenna-simulator-${var.environment}-jobs-dead-letter"
  alarm_description   = "A solve job failed twice (timeout or crash) — see the solver Lambda log"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.jobs_dlq[0].name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts[0].arn]
}
