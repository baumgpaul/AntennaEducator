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
# The CSP starts in report-only mode: violations show in the browser console
# without blocking anything; switch csp_report_only = false once clean.
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
  }

  # Custom error responses for SPA routing
  # All 404s and 403s redirect to index.html
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 300
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 300
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
