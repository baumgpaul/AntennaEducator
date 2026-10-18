# CloudFront Distribution Module
# CDN for frontend static website with HTTPS

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "frontend-oac-${var.environment}"
  description                       = "Origin Access Control for Frontend S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Security headers on every response (HSTS, nosniff, framing, referrer, CSP).
# CSP is enforced; set csp_report_only = true to only log violations in the
# browser console while trying out a policy change.
resource "aws_cloudfront_response_headers_policy" "security" {
  name    = "antenna-simulator-security-${var.environment}"
  comment = "Security headers for the Antenna Educator SPA (${var.environment})"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000 # 1 year
      include_subdomains         = false    # parent domain hosts other sites
      preload                    = false
      override                   = true
    }
    content_type_options {
      override = true
    }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    dynamic "content_security_policy" {
      for_each = var.csp_report_only ? [] : [1]
      content {
        content_security_policy = var.content_security_policy
        override                = true
      }
    }
  }

  dynamic "custom_headers_config" {
    for_each = var.csp_report_only ? [1] : []
    content {
      items {
        header   = "Content-Security-Policy-Report-Only"
        value    = var.content_security_policy
        override = true
      }
    }
  }
}

# Managed policies for the API behaviors: never cache, forward everything the
# viewer sent except Host (the Lambda URL needs its own Host header).
data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

# SPA routing: client-side routes (no file extension) get index.html. Replaces
# distribution-wide custom error responses, which would also have turned real
# API 403/404 responses into HTML pages.
resource "aws_cloudfront_function" "spa_rewrite" {
  name    = "antenna-simulator-spa-rewrite-${var.environment}"
  runtime = "cloudfront-js-2.0"
  comment = "Serve index.html for client-side routes"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      if (request.uri.indexOf('.') === -1) {
        request.uri = '/index.html';
      }
      return request;
    }
  EOT
}

# /svc/<service>/<path> -> /<path> on that service's Lambda Function URL
resource "aws_cloudfront_function" "api_prefix" {
  count   = length(var.api_origins) > 0 ? 1 : 0
  name    = "antenna-simulator-api-prefix-${var.environment}"
  runtime = "cloudfront-js-2.0"
  comment = "Strip the /svc/<service> routing prefix"
  publish = true
  code    = <<-EOT
    function handler(event) {
      var request = event.request;
      request.uri = request.uri.replace(/^\/svc\/[a-z]+/, '') || '/';
      return request;
    }
  EOT
}

# Signed requests to the Lambda Function URLs (stage B): with signing on, the
# Function URLs use AWS_IAM auth and only this distribution can call them.
resource "aws_cloudfront_origin_access_control" "lambda" {
  count                             = var.api_origin_signing && length(var.api_origins) > 0 ? 1 : 0
  name                              = "antenna-simulator-lambda-oac-${var.environment}"
  description                       = "Signs API requests to the Lambda Function URLs"
  origin_access_control_origin_type = "lambda"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "Antenna Simulator Frontend - ${var.environment}"
  default_root_object = "index.html"
  price_class         = var.price_class

  # Origin - S3 bucket
  origin {
    domain_name              = var.s3_bucket_regional_domain_name
    origin_id                = "S3-${var.s3_bucket_name}"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  # API origins: one per backend service (Lambda Function URL)
  dynamic "origin" {
    for_each = var.api_origins
    content {
      domain_name              = trimsuffix(replace(origin.value, "https://", ""), "/")
      origin_id                = "api-${origin.key}"
      origin_access_control_id = var.api_origin_signing ? aws_cloudfront_origin_access_control.lambda[0].id : null

      custom_origin_config {
        http_port                = 80
        https_port               = 443
        origin_protocol_policy   = "https-only"
        origin_ssl_protocols     = ["TLSv1.2"]
        origin_read_timeout      = 60 # CloudFront maximum; longest real call so far ~10 s
        origin_keepalive_timeout = 5
      }
    }
  }

  # Default cache behavior
  default_cache_behavior {
    target_origin_id       = "S3-${var.s3_bucket_name}"
    viewer_protocol_policy = "redirect-to-https"  # Force HTTPS
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    cached_methods  = ["GET", "HEAD"]

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 3600    # 1 hour
    max_ttl     = 86400   # 24 hours

    compress = true  # Enable gzip compression

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_rewrite.arn
    }
  }

  # API behaviors: /svc/<service>/* -> that service, never cached
  dynamic "ordered_cache_behavior" {
    for_each = var.api_origins
    content {
      path_pattern               = "/svc/${ordered_cache_behavior.key}/*"
      target_origin_id           = "api-${ordered_cache_behavior.key}"
      viewer_protocol_policy     = "https-only"
      allowed_methods            = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
      cached_methods             = ["GET", "HEAD"]
      cache_policy_id            = data.aws_cloudfront_cache_policy.caching_disabled.id
      origin_request_policy_id   = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
      response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
      compress                   = true

      function_association {
        event_type   = "viewer-request"
        function_arn = aws_cloudfront_function.api_prefix[0].arn
      }
    }
  }

  # Restrictions - none for public website
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # SSL Certificate - CloudFront default or custom (ACM)
  viewer_certificate {
    cloudfront_default_certificate = var.acm_certificate_arn == "" ? true : false
    acm_certificate_arn            = var.acm_certificate_arn != "" ? var.acm_certificate_arn : null
    ssl_support_method             = var.acm_certificate_arn != "" ? "sni-only" : null
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  # Custom domain (optional)
  aliases = var.domain_aliases

  tags = merge(
    var.tags,
    {
      Name        = "frontend-distribution-${var.environment}"
      Environment = var.environment
    }
  )
}
