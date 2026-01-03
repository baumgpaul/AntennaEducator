output "bucket_name" {
  description = "Name of the frontend S3 bucket"
  value       = aws_s3_bucket.frontend.id
}

output "bucket_arn" {
  description = "ARN of the frontend S3 bucket"
  value       = aws_s3_bucket.frontend.arn
}

output "bucket_regional_domain_name" {
  description = "Regional domain name of the bucket"
  value       = aws_s3_bucket.frontend.bucket_regional_domain_name
}

output "website_endpoint" {
  description = "Website endpoint"
  value       = aws_s3_bucket_website_configuration.frontend.website_endpoint
}
