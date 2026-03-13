# Rebuild and deploy FDTD Lambda container images
# Builds the solver_fdtd Docker image, pushes to ECR, and updates the Lambda

param(
    [string]$Profile = "antenna-staging",
    [string]$Region = "eu-west-1",
    [string]$Environment = "fdtd-staging",
    [string]$AccountId
)

$ErrorActionPreference = "Stop"

# Fetch account ID from AWS if not provided
if (-not $AccountId) {
    Write-Host "Fetching AWS account ID..." -ForegroundColor Yellow
    $AccountId = (aws sts get-caller-identity --profile $Profile --query Account --output text).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $AccountId) {
        Write-Host "Failed to get AWS account ID. Pass -AccountId or configure AWS CLI." -ForegroundColor Red
        exit 1
    }
}

Write-Host "=== Rebuilding FDTD Lambda Container Images ===" -ForegroundColor Cyan
Write-Host "Profile: $Profile"
Write-Host "Region: $Region"
Write-Host "Environment: $Environment"
Write-Host "Account: $AccountId"
Write-Host ""

# Get ECR login
Write-Host "Logging into ECR..." -ForegroundColor Yellow
aws ecr get-login-password --region $Region --profile $Profile | docker login --username AWS --password-stdin "$AccountId.dkr.ecr.$Region.amazonaws.com"

# FDTD services to rebuild
$services = @(
    @{ Name = "fdtd_preprocessor"; AwsName = "preprocessor-fdtd" },
    @{ Name = "solver_fdtd"; AwsName = "solver-fdtd" },
    @{ Name = "fdtd_postprocessor"; AwsName = "postprocessor-fdtd" }
)

foreach ($svc in $services) {
    $service = $svc.Name
    $awsName = $svc.AwsName
    Write-Host "`n=== Building $service ===" -ForegroundColor Cyan

    $repositoryName = "antenna-simulator-$awsName-$Environment"
    $imageUri = "$AccountId.dkr.ecr.$Region.amazonaws.com/${repositoryName}:latest"

    # Build image with Lambda Dockerfile
    Write-Host "Building Docker image..." -ForegroundColor Yellow
    docker build `
        -f "backend/$service/Dockerfile.lambda" `
        -t $repositoryName `
        --platform linux/amd64 `
        .

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to build $service image" -ForegroundColor Red
        exit 1
    }

    # Tag for ECR
    Write-Host "Tagging image..." -ForegroundColor Yellow
    docker tag ${repositoryName}:latest $imageUri

    # Push to ECR
    Write-Host "Pushing to ECR..." -ForegroundColor Yellow
    docker push $imageUri

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to push $service image" -ForegroundColor Red
        exit 1
    }

    # Update Lambda function
    Write-Host "Updating Lambda function..." -ForegroundColor Yellow
    aws lambda update-function-code `
        --function-name $repositoryName `
        --image-uri $imageUri `
        --region $Region `
        --profile $Profile `
        --no-cli-pager

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to update $service Lambda" -ForegroundColor Red
        exit 1
    }

    # Wait for update to complete
    Write-Host "Waiting for Lambda update to complete..." -ForegroundColor Yellow
    aws lambda wait function-updated `
        --function-name $repositoryName `
        --region $Region `
        --profile $Profile

    Write-Host "$service updated successfully" -ForegroundColor Green
}

Write-Host "`n=== All FDTD Lambda Images Rebuilt Successfully ===" -ForegroundColor Green
Write-Host "`nNext steps:"
Write-Host "1. Test the FDTD solver health endpoint"
Write-Host "2. Deploy the FDTD frontend: .\deploy-fdtd-frontend.ps1"
