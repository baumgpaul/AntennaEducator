# Cognito User Pool for Authentication
resource "aws_cognito_user_pool" "main" {
  name = "antenna-simulator-${var.environment}"

  # Password policy
  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = false
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  # User attributes - schema cannot be modified after creation
  # These were set during initial creation
  
  # Email verification
  auto_verified_attributes = ["email"]

  # Email configuration
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  # Username configuration
  username_attributes = ["email"]

  username_configuration {
    case_sensitive = false
  }

  # Account recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # MFA configuration (off for MVP, can be enabled later)
  mfa_configuration = "OFF"

  # Verification message templates
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_message        = "Your verification code for Antenna Educator is {####}"
    email_subject        = "Verify your Antenna Educator account"
  }

  # User invitation message
  admin_create_user_config {
    allow_admin_create_user_only = false

    invite_message_template {
      email_message = "Welcome to Antenna Educator! Your username is {username} and temporary password is {####}"
      email_subject = "Welcome to Antenna Educator"
      sms_message   = "Your username is {username} and temporary password is {####}"
    }
  }
  
  # Ignore schema changes - schema cannot be modified after user pool creation
  lifecycle {
    ignore_changes = [schema]
  }

  tags = {
    Name        = "antenna-simulator-${var.environment}"
    Environment = var.environment
    Project     = "antenna-simulator"
    ManagedBy   = "terraform"
  }
}

# Cognito User Pool Client for Frontend
resource "aws_cognito_user_pool_client" "frontend" {
  name         = "frontend-client-${var.environment}"
  user_pool_id = aws_cognito_user_pool.main.id

  # OAuth settings
  allowed_oauth_flows                  = ["code", "implicit"]
  allowed_oauth_scopes                 = ["email", "openid", "profile", "aws.cognito.signin.user.admin"]
  allowed_oauth_flows_user_pool_client = true

  # Token validity
  access_token_validity  = 1  # hours
  id_token_validity      = 1  # hours
  refresh_token_validity = 30 # days

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }

  # Callback URLs for OAuth
  callback_urls = concat(
    var.additional_callback_urls,
    [
      "https://${var.domain_name}/auth/callback",
      "http://localhost:3000/auth/callback", # Local development
      "http://localhost:5173/auth/callback"  # Vite default port
    ]
  )

  logout_urls = concat(
    var.additional_logout_urls,
    [
      "https://${var.domain_name}",
      "https://${var.domain_name}/login",
      "http://localhost:3000",
      "http://localhost:5173"
    ]
  )

  # Supported identity providers
  supported_identity_providers = ["COGNITO"]

  # Disable client secret for Single Page Application (SPA)
  generate_secret = false

  # Auth flows
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",        # Secure Remote Password
    "ALLOW_REFRESH_TOKEN_AUTH",   # Refresh tokens
    "ALLOW_USER_PASSWORD_AUTH"    # Direct password auth (for local testing)
  ]

  # Prevent user existence errors
  prevent_user_existence_errors = "ENABLED"

  # Read/write attributes
  read_attributes = [
    "email",
    "email_verified",
    "preferred_username"
  ]

  write_attributes = [
    "email",
    "preferred_username"
  ]
}

# Cognito User Pool Domain (for hosted UI)
resource "aws_cognito_user_pool_domain" "main" {
  domain       = "antenna-simulator-${var.environment}-${var.domain_suffix}"
  user_pool_id = aws_cognito_user_pool.main.id
}

# Optional: Custom domain with ACM certificate (for production)
# resource "aws_cognito_user_pool_domain" "custom" {
#   domain          = "auth.${var.domain_name}"
#   certificate_arn = var.acm_certificate_arn
#   user_pool_id    = aws_cognito_user_pool.main.id
# }
