# Deploy Unified Authentication to AWS Lambda
# This script deploys the projects service with the new unified auth implementation

Write-Host "=== Deploying Unified Authentication to AWS Lambda ===" -ForegroundColor Cyan
Write-Host ""

# Configuration
$REGION = "eu-west-1"
$ENVIRONMENT = "staging"
$ECR_REPO = "antenna-simulator-projects-staging"
$SERVICE_DIR = "backend/projects"

# Get AWS account ID
Write-Host "1. Getting AWS account information..." -ForegroundColor Yellow
$AWS_ACCOUNT_ID = (aws sts get-caller-identity --query Account --output text).Trim()

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to get AWS account ID. Please ensure AWS CLI is configured." -ForegroundColor Red
    exit 1
}

$ECR_URI = "$AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$ECR_REPO"
Write-Host "  Account ID: $AWS_ACCOUNT_ID" -ForegroundColor Green
Write-Host "  ECR Repository: $ECR_URI" -ForegroundColor Green

# Login to ECR
Write-Host "`n2. Logging in to ECR..." -ForegroundColor Yellow
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

if ($LASTEXITCODE -ne 0) {
    Write-Host "ECR login failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ ECR login successful" -ForegroundColor Green

# Build Docker image
Write-Host "`n3. Building Docker image with unified authentication..." -ForegroundColor Yellow
Write-Host "  Auth components (backend/common/auth/):" -ForegroundColor Cyan
Write-Host "    - local_provider.py (standalone JWT auth)" -ForegroundColor Cyan
Write-Host "    - cognito_provider.py (AWS Cognito auth)" -ForegroundColor Cyan
Write-Host "    - dependencies.py (FastAPI get_current_user)" -ForegroundColor Cyan
Write-Host "    - factory.py (provider selection via USE_COGNITO)" -ForegroundColor Cyan

docker build -t $ECR_REPO -f backend/projects/Dockerfile.lambda .

if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Docker image built successfully" -ForegroundColor Green

# Tag image
Write-Host "`n4. Tagging image..." -ForegroundColor Yellow
$tagLatest = "${ECR_URI}:latest"
$tagTimestamp = "${ECR_URI}:unified-auth-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

& docker tag "${ECR_REPO}:latest" $tagLatest
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to tag image with :latest" -ForegroundColor Red
    exit 1
}

& docker tag "${ECR_REPO}:latest" $tagTimestamp
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to tag image with timestamp" -ForegroundColor Red
    exit 1
}

Write-Host "  ✓ Image tagged" -ForegroundColor Green

# Push to ECR
Write-Host "`n5. Pushing to ECR..." -ForegroundColor Yellow
& docker push $tagLatest

if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker push failed!" -ForegroundColor Red
    exit 1
}
Write-Host "  ✓ Image pushed to ECR" -ForegroundColor Green

# Update Lambda function
Write-Host "`n6. Updating Lambda function..." -ForegroundColor Yellow
$FUNCTION_NAME = "antenna-simulator-projects-$ENVIRONMENT"

# Force Lambda to pull new image
$updateResult = aws lambda update-function-code `
    --function-name $FUNCTION_NAME `
    --image-uri $tagLatest `
    --region $REGION

if ($LASTEXITCODE -ne 0) {
    Write-Host "Lambda update failed!" -ForegroundColor Red
    Write-Host "Result: $updateResult" -ForegroundColor Red
    exit 1
}

Write-Host "  ✓ Lambda function updated" -ForegroundColor Green
Write-Host "  Waiting for function to become active..." -ForegroundColor Yellow

# Wait for function to be ready
$maxAttempts = 30
$attempt = 0
$ready = $false

while (-not $ready -and $attempt -lt $maxAttempts) {
    Start-Sleep -Seconds 2
    $attempt++
    
    $state = aws lambda get-function --function-name $FUNCTION_NAME --region $REGION --query 'Configuration.State' --output text
    
    if ($state -eq "Active") {
        $ready = $true
        Write-Host "  ✓ Function is active" -ForegroundColor Green
    } else {
        Write-Host "  Attempt $attempt/$maxAttempts - State: $state" -ForegroundColor Gray
    }
}

if (-not $ready) {
    Write-Host "  Warning: Function did not become active within timeout" -ForegroundColor Yellow
}

# Get Lambda Function URL
Write-Host "`n7. Getting Lambda Function URL..." -ForegroundColor Yellow
$FUNCTION_URL = aws lambda get-function-url-config --function-name $FUNCTION_NAME --region $REGION --query 'FunctionUrl' --output text 2>$null

if ($LASTEXITCODE -eq 0) {
    Write-Host "  Function URL: $FUNCTION_URL" -ForegroundColor Green
} else {
    Write-Host "  No Function URL configured (using API Gateway)" -ForegroundColor Yellow
}

# Test health endpoint
Write-Host "`n8. Testing health endpoint..." -ForegroundColor Yellow
Start-Sleep -Seconds 3  # Give Lambda time to initialize

if ($FUNCTION_URL) {
    $healthUrl = "$FUNCTION_URL/health"
    Write-Host "  Testing: $healthUrl" -ForegroundColor Cyan
    
    try {
        $response = Invoke-RestMethod -Uri $healthUrl -Method Get -ErrorAction Stop
        Write-Host "  ✓ Health check passed" -ForegroundColor Green
        Write-Host "  Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Cyan
    } catch {
        Write-Host "  ⚠ Health check failed: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "  Lambda may still be initializing..." -ForegroundColor Gray
    }
}

# Summary
Write-Host "`n=== Deployment Summary ===" -ForegroundColor Cyan
Write-Host "✓ Projects + Auth service deployed:" -ForegroundColor Green
Write-Host "  - backend/common/auth/ (strategy-pattern auth provider)" -ForegroundColor White
Write-Host "  - LocalAuthProvider (bcrypt + HS256 JWT for standalone mode)" -ForegroundColor White
Write-Host "  - CognitoAuthProvider (Cognito SDK + JWKS verification)" -ForegroundColor White
Write-Host "  - Unified /api/auth/login and /api/auth/register endpoints" -ForegroundColor White
Write-Host ""
Write-Host "Environment Configuration Required:" -ForegroundColor Yellow
Write-Host "  To enable AWS Cognito mode, set Lambda environment variables:" -ForegroundColor White
Write-Host "    USE_COGNITO=true" -ForegroundColor Cyan
Write-Host "    COGNITO_REGION=$REGION" -ForegroundColor Cyan
Write-Host "    COGNITO_USER_POOL_ID=<your-pool-id>" -ForegroundColor Cyan
Write-Host "    COGNITO_CLIENT_ID=<your-client-id>" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Configure Cognito environment variables in Lambda" -ForegroundColor White
Write-Host "  2. Run: python dev_tools/test_aws_pipeline.py to verify" -ForegroundColor White
Write-Host "  3. Test registration: POST /api/auth/register" -ForegroundColor White
Write-Host "  4. Test login: POST /api/auth/login" -ForegroundColor White
Write-Host ""

if ($FUNCTION_URL) {
    Write-Host "Lambda Function URL: $FUNCTION_URL" -ForegroundColor Green
}

Write-Host "`nDeployment complete! 🚀" -ForegroundColor Green
