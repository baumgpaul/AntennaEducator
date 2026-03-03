# AWS Deployment Guide

How to deploy the Antenna Simulator to AWS (staging environment).

## Architecture Overview

```
Browser → CloudFront → S3 (frontend bundle)
              ↓ API calls (Lambda Function URLs)
         ┌──────────────────────────────────────────┐
         │  Preprocessor Lambda  (512 MB, 30s)      │
         │  Solver Lambda        (2048 MB, 900s)    │
         │  Postprocessor Lambda (1024 MB, 60s)     │
         │  Projects Lambda      (512 MB, 30s)      │
         │    └── Auth endpoints merged here        │
         └──────────────────────────────────────────┘
              ↓ persistence
         DynamoDB (single-table: antenna-simulator-staging)
         S3 Data Bucket (simulation result storage)
         Cognito (user authentication)
```

**Custom domain:** `https://antennaeducator.nyakyagyawa.com`
**Region:** `eu-west-1` (Ireland) — ACM certificate in `us-east-1` for CloudFront.
**Profile:** `antenna-staging`.

## Prerequisites

| Tool | Purpose |
|---|---|
| AWS CLI v2 | AWS resource access |
| Docker Desktop | Lambda container image builds |
| Terraform | Infrastructure provisioning |
| PowerShell | Deployment scripts |

### AWS Profile Setup

```bash
aws configure --profile antenna-staging
# Region: eu-west-1
# Output format: json
```

Verify access:

```bash
aws sts get-caller-identity --profile antenna-staging
```

## Infrastructure (Terraform)

Infrastructure-as-Code lives in `terraform/`. The staging environment uses 10 reusable modules:

| Module | Provisions |
|---|---|
| `cognito` | User Pool, App Client, hosted UI domain |
| `dynamodb` | Single-table (PK/SK + GSI1), PAY_PER_REQUEST |
| `ecr` | 4 container repos (one per service), image scanning |
| `lambda` | 4 Lambda functions, IAM roles, Function URLs, CloudWatch logs |
| `s3-frontend` | Frontend bucket with CloudFront OAC policy |
| `s3-data` | Data bucket with lifecycle rules |
| `cloudfront` | Distribution with SPA error handling |
| `acm-certificate` | TLS cert (us-east-1) with Route53 DNS validation |
| `route53` | DNS records for custom domain |
| `api-gateway` | HTTP API Gateway (provisioned but auth disabled for MVP) |

### Terraform Commands

```bash
cd terraform/environments/staging

terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

State stored in S3 (`antenna-simulator-terraform-state-<ACCOUNT_ID>`) with DynamoDB locking (`antenna-terraform-locks`).

## Deploy Backend (Lambda Services)

Each service is packaged as a Docker container image, pushed to ECR, then deployed to Lambda.

### Deploy All Services

```powershell
.\dev_tools\rebuild_lambda_images.ps1
```

This script performs, for each service (projects, preprocessor, solver, postprocessor):
1. ECR login
2. `docker build -f backend/{service}/Dockerfile.lambda --platform linux/amd64 .`
3. Tag and push to ECR
4. `aws lambda update-function-code` with new image URI
5. Wait for Lambda to become `Active`

### Deploy Projects/Auth Only

```powershell
.\deploy-auth-to-aws.ps1
```

This is a focused version that deploys only the projects Lambda (which includes the auth endpoints). It also tags with a timestamp for rollback reference.

### Lambda Container Images

All `Dockerfile.lambda` files share the same structure:
- Base image: `public.ecr.aws/lambda/python:3.11`
- System deps: `gcc`, `gfortran`, `lapack-devel`, `blas-devel`
- Pre-installs: `numpy==1.26.4`, `scipy==1.11.4`
- Handler: `lambda_handler.handler` via Mangum (wraps FastAPI)

Build context is always the repository root (`.`), ensuring `backend/` package structure is preserved.

### Lambda Resource Allocation

| Service | Memory | Timeout | DynamoDB | Key Env Vars |
|---|---|---|---|---|
| Projects | 512 MB | 30s | Yes | `USE_DYNAMODB=true`, `USE_COGNITO=true`, Cognito pool/client IDs |
| Preprocessor | 512 MB | 30s | No | — |
| Solver | 2048 MB | 900s | No | — |
| Postprocessor | 1024 MB | 60s | No | — |

## Deploy Frontend

```powershell
.\deploy-frontend.ps1                 # Full build + deploy
.\deploy-frontend.ps1 -SkipBuild      # Deploy existing build only
.\deploy-frontend.ps1 -DryRun         # Preview without deploying
```

The script:
1. Builds the frontend (`npx vite build`)
2. Syncs `frontend/dist/` to S3 (`antenna-simulator-frontend-staging-{accountId}`)
3. Creates CloudFront invalidation (`/*`)

### Frontend Environment

Production config: `frontend/.env.production`

The frontend connects directly to Lambda Function URLs (not API Gateway) in production. Each service has its own URL:

| Variable | Service |
|---|---|
| `VITE_PREPROCESSOR_URL` | Preprocessor Lambda Function URL |
| `VITE_SOLVER_URL` | Solver Lambda Function URL |
| `VITE_POSTPROCESSOR_URL` | Postprocessor Lambda Function URL |
| `VITE_PROJECTS_URL` | Projects Lambda Function URL |
| `VITE_AUTH_URL` | Same as Projects (auth merged) |

Cognito settings are also configured here (`VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, etc.).

## Verify Deployment

### Health Checks

Each Lambda exposes a `/health` endpoint:

```bash
curl https://<function-url>/health
```

### Full Pipeline Smoke Test

```bash
python dev_tools/test_aws_pipeline.py
```

This test:
1. Health-checks all 4 Lambda services
2. Generates a dipole mesh (preprocessor)
3. Solves at 300 MHz (solver)
4. Computes far-field pattern (postprocessor)
5. Reports impedance, directivity, gain, efficiency

## Resource Naming Convention

All AWS resources follow: **`antenna-simulator-{component}-{environment}`**

| Resource Type | Example Name |
|---|---|
| Lambda function | `antenna-simulator-solver-staging` |
| ECR repository | `antenna-simulator-solver-staging` |
| DynamoDB table | `antenna-simulator-staging` |
| S3 (frontend) | `antenna-simulator-frontend-staging-{account_id}` |
| S3 (data) | `antenna-simulator-data-staging-{account_id}` |
| IAM role | `antenna-simulator-solver-staging-execution-role` |
| CloudWatch logs | `/aws/lambda/antenna-simulator-solver-staging` |

## Troubleshooting

### Lambda cold start timeout

Simulation Lambdas (especially solver at 2 GB) have cold starts of 5–15 seconds. The solver timeout is set to 900s (15 minutes) for complex simulations.

### ECR push authentication error

ECR login tokens expire after 12 hours:

```powershell
aws ecr get-login-password --profile antenna-staging | docker login --username AWS --password-stdin $(aws sts get-caller-identity --profile antenna-staging --query Account --output text).dkr.ecr.eu-west-1.amazonaws.com
```

### CloudFront serving stale content

After deploying frontend, ensure invalidation completed:

```bash
aws cloudfront list-invalidations --distribution-id <DISTRIBUTION_ID> --profile antenna-staging
```

### Lambda Function URL returns 5xx

Check CloudWatch logs:

```bash
aws logs tail /aws/lambda/antenna-simulator-solver-staging --since 10m --profile antenna-staging
```
