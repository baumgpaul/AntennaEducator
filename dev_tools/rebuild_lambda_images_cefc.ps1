# Rebuild and deploy Lambda container images for CEFC environment
# Builds all four services and pushes to the cefc ECR repositories.

param(
    [string]$Profile   = "antenna-staging",
    [string]$Region    = "eu-west-1",
    [string]$AccountId,
    [string]$Environment = "cefc"
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

Write-Host "=== Rebuilding Lambda Container Images for CEFC ===" -ForegroundColor Cyan
Write-Host "Profile:     $Profile"
Write-Host "Region:      $Region"
Write-Host "Account:     $AccountId"
Write-Host "Environment: $Environment"
Write-Host ""

# Get ECR login
Write-Host "Logging into ECR..." -ForegroundColor Yellow
aws ecr get-login-password --region $Region --profile $Profile |
    docker login --username AWS --password-stdin "$AccountId.dkr.ecr.$Region.amazonaws.com"

$services = @("projects", "preprocessor", "solver", "postprocessor")

foreach ($service in $services) {
    Write-Host "`n=== Building $service ===" -ForegroundColor Cyan

    $repositoryName = "antenna-simulator-$service-$Environment"
    $imageUri = "$AccountId.dkr.ecr.$Region.amazonaws.com/${repositoryName}:latest"

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

    Write-Host "Tagging image..." -ForegroundColor Yellow
    docker tag "${repositoryName}:latest" $imageUri

    Write-Host "Pushing to ECR..." -ForegroundColor Yellow
    docker push $imageUri

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to push $service image" -ForegroundColor Red
        exit 1
    }

    Write-Host "Updating Lambda function..." -ForegroundColor Yellow
    $updateResult = aws lambda update-function-code `
        --function-name "antenna-simulator-$service-$Environment" `
        --image-uri $imageUri `
        --region $Region `
        --profile $Profile `
        --no-cli-pager 2>&1

    if ($LASTEXITCODE -ne 0) {
        if ($updateResult -match "ResourceNotFoundException") {
            Write-Host "  Lambda function does not exist yet - will be created by Terraform." -ForegroundColor Yellow
        } else {
            Write-Host "Failed to update $service Lambda: $updateResult" -ForegroundColor Red
            exit 1
        }
    } else {
        # Wait for update to complete only if function existed
        Write-Host "Waiting for Lambda update to complete..." -ForegroundColor Yellow
        aws lambda wait function-updated `
            --function-name "antenna-simulator-$service-$Environment" `
            --region $Region `
            --profile $Profile
    }

    Write-Host "  $service updated successfully" -ForegroundColor Green
}

Write-Host "`n=== All CEFC Lambda Images Rebuilt Successfully ===" -ForegroundColor Green
