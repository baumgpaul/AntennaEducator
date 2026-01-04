# Rebuild and deploy Lambda container images with correct Dockerfile
# This rebuilds all Lambda services with their Dockerfile.lambda files

param(
    [string]$Profile = "antenna-staging",
    [string]$Region = "eu-west-1",
    [string]$AccountId = "767397882329"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Rebuilding Lambda Container Images ===" -ForegroundColor Cyan
Write-Host "Profile: $Profile"
Write-Host "Region: $Region"
Write-Host ""

# Get ECR login
Write-Host "Logging into ECR..." -ForegroundColor Yellow
aws ecr get-login-password --region $Region --profile $Profile | docker login --username AWS --password-stdin "$AccountId.dkr.ecr.$Region.amazonaws.com"

# Services to rebuild
$services = @("projects", "preprocessor", "solver", "postprocessor")

foreach ($service in $services) {
    Write-Host "`n=== Building $service ===" -ForegroundColor Cyan
    
    $repositoryName = "antenna-simulator-$service-staging"
    $imageUri = "$AccountId.dkr.ecr.$Region.amazonaws.com/${repositoryName}:latest"
    
    # Build image with Lambda Dockerfile
    Write-Host "Building Docker image..." -ForegroundColor Yellow
    docker build `
        -f "backend/$service/Dockerfile.lambda" `
        -t $repositoryName `
        --platform linux/amd64 `
        .
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ Failed to build $service image" -ForegroundColor Red
        exit 1
    }
    
    # Tag for ECR
    Write-Host "Tagging image..." -ForegroundColor Yellow
    docker tag ${repositoryName}:latest $imageUri
    
    # Push to ECR
    Write-Host "Pushing to ECR..." -ForegroundColor Yellow
    docker push $imageUri
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ Failed to push $service image" -ForegroundColor Red
        exit 1
    }
    
    # Update Lambda function
    Write-Host "Updating Lambda function..." -ForegroundColor Yellow
    aws lambda update-function-code `
        --function-name "antenna-simulator-$service-staging" `
        --image-uri $imageUri `
        --region $Region `
        --profile $Profile `
        --no-cli-pager
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "✗ Failed to update $service Lambda" -ForegroundColor Red
        exit 1
    }
    
    # Wait for update to complete
    Write-Host "Waiting for Lambda update to complete..." -ForegroundColor Yellow
    aws lambda wait function-updated `
        --function-name "antenna-simulator-$service-staging" `
        --region $Region `
        --profile $Profile
    
    Write-Host "✓ $service updated successfully" -ForegroundColor Green
}

Write-Host "`n=== All Lambda Images Rebuilt Successfully ===" -ForegroundColor Green
Write-Host "`nNext steps:"
Write-Host "1. Test the API Gateway endpoints"
Write-Host "2. Run: .\dev_tools\test_api_gateway.ps1"
