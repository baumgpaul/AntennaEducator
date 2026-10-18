# ============================================================================
# Operational alarms — errors, throttles, slow solves
# ============================================================================
# Kept to a few multi-metric alarms: CloudWatch bills per metric in an alarm
# (10 free per account, shared with other projects in this account).

locals {
  ops_alarms = var.enable_ops_alarms && var.alert_email != ""

  api_functions = {
    projects      = module.lambda_projects.function_name
    preprocessor  = module.lambda_preprocessor.function_name
    solver        = module.lambda_solver.function_name
    postprocessor = module.lambda_postprocessor.function_name
  }

  # Long-running functions: warn before they hit their timeout
  slow_functions = {
    solver        = { name = module.lambda_solver.function_name, timeout_s = module.lambda_solver.timeout }
    postprocessor = { name = module.lambda_postprocessor.function_name, timeout_s = module.lambda_postprocessor.timeout }
  }
}

# 5xx from the Function URLs: unhandled exceptions, FastAPI 500s, timeouts
resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  count = local.ops_alarms ? 1 : 0

  alarm_name          = "antenna-simulator-${var.environment}-api-5xx"
  alarm_description   = "5 or more 5xx responses within 15 minutes — check the Lambda logs"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 5
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "total"
    expression  = "SUM(METRICS())"
    label       = "5xx responses (all services)"
    return_data = true
  }

  dynamic "metric_query" {
    for_each = local.api_functions
    content {
      id = metric_query.key
      metric {
        namespace   = "AWS/Lambda"
        metric_name = "Url5xxCount"
        period      = 900
        stat        = "Sum"
        dimensions  = { FunctionName = metric_query.value }
      }
    }
  }

  alarm_actions = [aws_sns_topic.alerts[0].arn]
  ok_actions    = [aws_sns_topic.alerts[0].arn]
}

# Throttles: reserved concurrency reached — users get 429s
resource "aws_cloudwatch_metric_alarm" "throttles" {
  count = local.ops_alarms ? 1 : 0

  alarm_name          = "antenna-simulator-${var.environment}-throttles"
  alarm_description   = "Lambda throttled (reserved concurrency exhausted) — a class running at once, or abuse"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "total"
    expression  = "SUM(METRICS())"
    label       = "Throttles (all services)"
    return_data = true
  }

  dynamic "metric_query" {
    for_each = local.api_functions
    content {
      id = metric_query.key
      metric {
        namespace   = "AWS/Lambda"
        metric_name = "Throttles"
        period      = 900
        stat        = "Sum"
        dimensions  = { FunctionName = metric_query.value }
      }
    }
  }

  alarm_actions = [aws_sns_topic.alerts[0].arn]
  ok_actions    = [aws_sns_topic.alerts[0].arn]
}

# Duration above 80% of the timeout — the next larger mesh will time out
resource "aws_cloudwatch_metric_alarm" "duration_near_timeout" {
  for_each = local.ops_alarms ? local.slow_functions : {}

  alarm_name          = "antenna-simulator-${var.environment}-${each.key}-duration-near-timeout"
  alarm_description   = "${each.key} ran longer than 80% of its ${each.value.timeout_s}s timeout"
  namespace           = "AWS/Lambda"
  metric_name         = "Duration"
  dimensions          = { FunctionName = each.value.name }
  statistic           = "Maximum"
  period              = 900
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = each.value.timeout_s * 1000 * 0.8 # Duration is in ms
  treat_missing_data  = "notBreaching"

  alarm_actions = [aws_sns_topic.alerts[0].arn]
  ok_actions    = [aws_sns_topic.alerts[0].arn]
}
