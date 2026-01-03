output "bucket_name" {
  description = "Name of the data S3 bucket"
  value       = aws_s3_bucket.data.id
}

output "bucket_arn" {
  description = "ARN of the data S3 bucket"
  value       = aws_s3_bucket.data.arn
}

output "bucket_regional_domain_name" {
  description = "Regional domain name of the bucket"
  value       = aws_s3_bucket.data.bucket_regional_domain_name
}
