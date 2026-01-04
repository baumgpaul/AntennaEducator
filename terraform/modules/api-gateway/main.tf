# API Gateway HTTP API for Antenna Simulator
# Provides REST API endpoints with Cognito JWT authentication

# ============================================================================
# HTTP API Gateway
# ============================================================================

resource "aws_apigatewayv2_api" "main" {
  name          = "antenna-simulator-api-${var.environment}"
  protocol_type = "HTTP"
  description   = "API Gateway for Antenna Simulator ${var.environment} environment"
  
  cors_configuration {
    allow_origins     = var.cors_allowed_origins
    allow_methods     = ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"]
    allow_headers     = ["Authorization", "Content-Type", "X-Amz-Date", "X-Api-Key", "X-Amz-Security-Token"]
    expose_headers    = ["X-Request-Id", "X-Amzn-RequestId"]
    max_age           = 3600
    allow_credentials = true
  }
  
  tags = merge(
    var.tags,
    {
      Name = "antenna-simulator-api-${var.environment}"
    }
  )
}

# ============================================================================
# Cognito JWT Authorizer
# ============================================================================

resource "aws_apigatewayv2_authorizer" "cognito" {
  count = var.enable_auth ? 1 : 0
  
  api_id           = aws_apigatewayv2_api.main.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-authorizer-${var.environment}"
  
  jwt_configuration {
    audience = [var.cognito_client_id]
    issuer   = var.cognito_issuer_url
  }
}

# ============================================================================
# Lambda Integrations
# ============================================================================

# Projects Service Integration
resource "aws_apigatewayv2_integration" "projects" {
  api_id           = aws_apigatewayv2_api.main.id
  integration_type = "AWS_PROXY"
  
  connection_type      = "INTERNET"
  integration_method   = "POST"
  integration_uri      = var.lambda_projects_invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds = 30000
}

# Preprocessor Service Integration
resource "aws_apigatewayv2_integration" "preprocessor" {
  api_id           = aws_apigatewayv2_api.main.id
  integration_type = "AWS_PROXY"
  
  connection_type      = "INTERNET"
  integration_method   = "POST"
  integration_uri      = var.lambda_preprocessor_invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds = 30000
}

# Solver Service Integration
resource "aws_apigatewayv2_integration" "solver" {
  api_id           = aws_apigatewayv2_api.main.id
  integration_type = "AWS_PROXY"
  
  connection_type      = "INTERNET"
  integration_method   = "POST"
  integration_uri      = var.lambda_solver_invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds = 30000  # Max allowed by API Gateway (30s)
}

# Postprocessor Service Integration
resource "aws_apigatewayv2_integration" "postprocessor" {
  api_id           = aws_apigatewayv2_api.main.id
  integration_type = "AWS_PROXY"
  
  connection_type      = "INTERNET"
  integration_method   = "POST"
  integration_uri      = var.lambda_postprocessor_invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds = 30000  # Max allowed by API Gateway (30s)
}

# ============================================================================
# Routes
# ============================================================================
# 
# Route configuration for MVP:
# - Projects service handles: /health, /api/v1/projects/*, /api/v1/auth/*
# - Other services accessed via Lambda Function URLs (no API Gateway routes yet)
# - Future: Add API Gateway routes with path rewriting for other services

# Health check - projects service
resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "GET /health"
  target    = "integrations/${aws_apigatewayv2_integration.projects.id}"
  
  authorization_type = "NONE"  # Health check should be public
}

# Auth routes - projects service (must be public)
resource "aws_apigatewayv2_route" "auth" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "ANY /api/v1/auth/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.projects.id}"
  
  authorization_type = "NONE"  # Auth endpoints must be public
}

# Projects routes - projects service
resource "aws_apigatewayv2_route" "projects" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "ANY /api/v1/projects/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.projects.id}"
  
  authorization_type = var.enable_auth ? "JWT" : "NONE"
  authorizer_id      = var.enable_auth ? aws_apigatewayv2_authorizer.cognito[0].id : null
}

resource "aws_apigatewayv2_route" "projects_root" {
  api_id    = aws_apigatewayv2_api.main.id
  route_key = "ANY /api/v1/projects"
  target    = "integrations/${aws_apigatewayv2_integration.projects.id}"
  
  authorization_type = var.enable_auth ? "JWT" : "NONE"
  authorizer_id      = var.enable_auth ? aws_apigatewayv2_authorizer.cognito[0].id : null
}

# TODO: Add routes for other services with proper path rewriting
# For now, other services (solver, preprocessor, postprocessor) are accessed via Lambda URLs

# ============================================================================
# Stage and Deployment
# ============================================================================

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true
  
  default_route_settings {
    throttling_burst_limit = var.throttling_burst_limit
    throttling_rate_limit  = var.throttling_rate_limit
  }
  
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
      errorMessage   = "$context.error.message"
      authorizerError = "$context.authorizer.error"
    })
  }
  
  tags = var.tags
}

# CloudWatch Log Group for API Gateway
resource "aws_cloudwatch_log_group" "api_gateway" {
  name              = "/aws/apigateway/antenna-simulator-${var.environment}"
  retention_in_days = var.log_retention_days
  
  tags = var.tags
}

# ============================================================================
# Lambda Permissions
# ============================================================================

# Allow API Gateway to invoke Projects Lambda
resource "aws_lambda_permission" "api_gateway_projects" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_projects_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

# Allow API Gateway to invoke Preprocessor Lambda
resource "aws_lambda_permission" "api_gateway_preprocessor" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_preprocessor_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

# Allow API Gateway to invoke Solver Lambda
resource "aws_lambda_permission" "api_gateway_solver" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_solver_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

# Allow API Gateway to invoke Postprocessor Lambda
resource "aws_lambda_permission" "api_gateway_postprocessor" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.lambda_postprocessor_function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
}

# ============================================================================
# Custom Domain (Optional)
# ============================================================================

resource "aws_apigatewayv2_domain_name" "api" {
  count = var.custom_domain_name != "" ? 1 : 0
  
  domain_name = var.custom_domain_name
  
  domain_name_configuration {
    certificate_arn = var.acm_certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
  
  tags = var.tags
}

resource "aws_apigatewayv2_api_mapping" "api" {
  count = var.custom_domain_name != "" ? 1 : 0
  
  api_id      = aws_apigatewayv2_api.main.id
  domain_name = aws_apigatewayv2_domain_name.api[0].id
  stage       = aws_apigatewayv2_stage.default.id
}

# Route53 Record for Custom Domain
resource "aws_route53_record" "api" {
  count = var.custom_domain_name != "" && var.route53_zone_id != "" ? 1 : 0
  
  zone_id = var.route53_zone_id
  name    = var.custom_domain_name
  type    = "A"
  
  alias {
    name                   = aws_apigatewayv2_domain_name.api[0].domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api[0].domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}
