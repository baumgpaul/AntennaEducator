# Terraform Bootstrap

This directory contains the bootstrap infrastructure for Terraform state management.

## What This Creates

1. **S3 Bucket**: Stores Terraform state files remotely
   - Versioning enabled (keeps history of state changes)
   - Encryption at rest (AES256)
   - Public access blocked
   - Lifecycle policy prevents accidental deletion

2. **DynamoDB Table**: Provides state locking
   - Prevents concurrent Terraform operations
   - Pay-per-request billing (serverless)
   - Point-in-time recovery enabled

## First-Time Setup

```powershell
# Navigate to bootstrap directory
cd terraform/bootstrap

# Initialize Terraform
terraform init

# Review what will be created
terraform plan

# Create the resources
terraform apply

# Save the outputs (you'll need these for other Terraform projects)
terraform output -raw backend_config > ../backend-config.txt
```

## Cost

**Estimated monthly cost**: ~$0.50-1.00
- S3: $0.023/GB + $0.0004/1000 requests (minimal, only stores state files)
- DynamoDB: $1.25/million requests (only used during terraform apply/plan)

## Security

- S3 bucket has versioning (can recover from accidental state corruption)
- DynamoDB prevents concurrent runs (avoids race conditions)
- All resources encrypted
- Public access blocked

## After Bootstrap

Once created, all other Terraform projects will use:

```hcl
terraform {
  backend "s3" {
    bucket         = "antenna-simulator-terraform-state-767397882329"
    key            = "staging/terraform.tfstate"
    region         = "eu-west-1"
    dynamodb_table = "antenna-terraform-locks"
    encrypt        = true
    profile        = "antenna-staging"
  }
}
```

## Important Notes

1. **State is stored locally** for bootstrap itself (chicken-and-egg problem)
2. **Backup the local state file** (`terraform.tfstate`) to a secure location
3. **Never delete** the S3 bucket without migrating state first
4. **Never modify** DynamoDB table manually
