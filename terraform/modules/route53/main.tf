# Route53 Module
# DNS configuration for custom domain

# Use existing hosted zone (data source)
data "aws_route53_zone" "existing" {
  count = var.use_existing_zone ? 1 : 0
  
  zone_id      = var.existing_zone_id != "" ? var.existing_zone_id : null
  name         = var.existing_zone_id == "" ? var.parent_domain_name : null
  private_zone = false
}

# Create new hosted zone only if not using existing one
resource "aws_route53_zone" "main" {
  count = var.use_existing_zone ? 0 : 1
  
  name          = var.domain_name
  comment       = "${var.environment} - ${var.domain_name}"
  force_destroy = var.environment != "production"
  
  tags = merge(
    var.tags,
    {
      Name        = "${var.domain_name}-zone"
      Environment = var.environment
    }
  )
}

# Local value to reference the correct zone ID
locals {
  zone_id = var.use_existing_zone ? data.aws_route53_zone.existing[0].zone_id : aws_route53_zone.main[0].zone_id
}

# A record for subdomain pointing to CloudFront
resource "aws_route53_record" "root" {
  count = var.cloudfront_domain_name != "" ? 1 : 0
  
  zone_id = local.zone_id
  name    = var.domain_name
  type    = "A"
  
  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

# AAAA record (IPv6) for subdomain
resource "aws_route53_record" "root_ipv6" {
  count = var.cloudfront_domain_name != "" ? 1 : 0
  
  zone_id = local.zone_id
  name    = var.domain_name
  type    = "AAAA"
  
  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

# Optional: www subdomain
resource "aws_route53_record" "www" {
  count = var.create_www_subdomain && var.cloudfront_domain_name != "" ? 1 : 0
  
  zone_id = local.zone_id
  name    = "www.${var.domain_name}"
  type    = "A"
  
  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www_ipv6" {
  count = var.create_www_subdomain && var.cloudfront_domain_name != "" ? 1 : 0
  
  zone_id = local.zone_id
  name    = "www.${var.domain_name}"
  type    = "AAAA"
  
  alias {
    name                   = var.cloudfront_domain_name
    zone_id                = var.cloudfront_hosted_zone_id
    evaluate_target_health = false
  }
}

# Optional: API subdomain (for API Gateway custom domain)
resource "aws_route53_record" "api" {
  count = var.api_gateway_domain_name != "" ? 1 : 0
  
  zone_id = local.zone_id
  name    = "api.${var.domain_name}"
  type    = "A"
  
  alias {
    name                   = var.api_gateway_domain_name
    zone_id                = var.api_gateway_hosted_zone_id
    evaluate_target_health = false
  }
}
