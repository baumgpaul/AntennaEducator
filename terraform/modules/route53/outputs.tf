# Route53 Module Outputs

output "zone_id" {
  description = "Route53 hosted zone ID"
  value       = local.zone_id
}

output "zone_name" {
  description = "Route53 hosted zone name"
  value       = var.use_existing_zone ? data.aws_route53_zone.existing[0].name : aws_route53_zone.main[0].name
}

output "name_servers" {
  description = "Route53 name servers (only for new zones)"
  value       = var.use_existing_zone ? [] : aws_route53_zone.main[0].name_servers
}

output "zone_arn" {
  description = "Route53 hosted zone ARN"
  value       = var.use_existing_zone ? data.aws_route53_zone.existing[0].arn : aws_route53_zone.main[0].arn
}
