# Lambda function to auto-confirm users on sign-up
# This bypasses email verification by automatically confirming users

resource "aws_lambda_function" "auto_confirm_user" {
  filename      = "${path.module}/lambda_auto_confirm.zip"
  function_name = "cognito-auto-confirm-${var.environment}"
  role          = aws_iam_role.auto_confirm_lambda.arn
  handler       = "index.handler"
  runtime       = "nodejs18.x"
  timeout       = 10

  source_code_hash = filebase64sha256("${path.module}/lambda_auto_confirm.zip")

  environment {
    variables = {
      ENVIRONMENT = var.environment
    }
  }

  tags = {
    Name        = "cognito-auto-confirm-${var.environment}"
    Environment = var.environment
    Project     = "antenna-simulator"
    ManagedBy   = "terraform"
  }
}

# IAM role for Lambda
resource "aws_iam_role" "auto_confirm_lambda" {
  name = "cognito-auto-confirm-lambda-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })

  tags = {
    Name        = "cognito-auto-confirm-lambda-${var.environment}"
    Environment = var.environment
    Project     = "antenna-simulator"
    ManagedBy   = "terraform"
  }
}

# Attach basic Lambda execution policy
resource "aws_iam_role_policy_attachment" "auto_confirm_lambda_basic" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.auto_confirm_lambda.name
}

# Lambda permission for Cognito to invoke
resource "aws_lambda_permission" "allow_cognito" {
  statement_id  = "AllowExecutionFromCognito"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auto_confirm_user.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.main.arn
}

# Attach Lambda trigger to Cognito User Pool
resource "aws_cognito_user_pool" "main_with_trigger" {
  # This updates the existing user pool with the PreSignUp trigger
  # Note: You might need to add this to the existing aws_cognito_user_pool.main resource
  
  lambda_config {
    pre_sign_up = aws_lambda_function.auto_confirm_user.arn
  }
  
  depends_on = [aws_lambda_permission.allow_cognito]
}
