# CloudFront Distribution Module
# CDN for frontend static website with HTTPS

resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "frontend-oac-${var.environment}"
  description                       = "Origin Access Control for Frontend S3 bucket"
  origin_access_control_origin_type = "s3"
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

  # Default cache behavior
  default_cache_behavior {
    target_origin_id       = "S3-${var.s3_bucket_name}"
    viewer_protocol_policy = "redirect-to-https"  # Force HTTPS

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
