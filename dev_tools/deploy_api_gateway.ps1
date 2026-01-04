# Deploy API Gateway to AWS
# This script deploys the API Gateway that connects all Lambda services

Write-Host "=== Deploying API Gateway to Staging ===" -ForegroundColor Cyan

# Change to staging directory
Push-Location "$PSScriptRoot\..\terraform\environments\staging"

try {
    # Initialize Terraform (if needed)
    Write-Host "`n1. Initializing Terraform..." -ForegroundColor Yellow
    terraform init
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Terraform init failed!" -ForegroundColor Red
        exit 1
    }
    
    # Plan deployment targeting API Gateway
    Write-Host "`n2. Planning API Gateway deployment..." -ForegroundColor Yellow
    & terraform plan -target module.api_gateway -out api-gateway.tfplan
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Terraform plan failed!" -ForegroundColor Red
        exit 1
    }
    
    # Ask for confirmation
    Write-Host "`n" -NoNewline
    $confirmation = Read-Host "Do you want to apply this plan? (yes/no)"
    
    if ($confirmation -ne "yes") {
        Write-Host "Deployment cancelled." -ForegroundColor Yellow
        exit 0
    }
    
    # Apply API Gateway deployment
    Write-Host "`n3. Deploying API Gateway..." -ForegroundColor Yellow
    terraform apply api-gateway.tfplan
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Terraform apply failed!" -ForegroundColor Red
        exit 1
    }
    
    # Get outputs
    Write-Host "`n4. Retrieving API Gateway configuration..." -ForegroundColor Yellow
    $apiId = terraform output -raw api_gateway_id
    $apiEndpoint = terraform output -raw api_gateway_endpoint
    $apiInvokeUrl = terraform output -raw api_gateway_invoke_url
    
    Write-Host "`n=== API Gateway Deployment Complete ===" -ForegroundColor Green
    Write-Host "`nAPI Gateway Configuration:" -ForegroundColor Cyan
    Write-Host "  API ID: $apiId"
    Write-Host "  API Endpoint: $apiEndpoint"
    Write-Host "  Invoke URL: $apiInvokeUrl"
    
    Write-Host "`n=== Service Endpoints ===" -ForegroundColor Cyan
    Write-Host "  Projects:      $apiInvokeUrl/projects"
    Write-Host "  Preprocessor:  $apiInvokeUrl/preprocessor"
    Write-Host "  Solver:        $apiInvokeUrl/solver"
    Write-Host "  Postprocessor: $apiInvokeUrl/postprocessor"
    
    Write-Host "`n=== Next Steps ===" -ForegroundColor Yellow
    Write-Host "1. Test the endpoints with the test script:"
    Write-Host "   .\dev_tools\test_api_gateway.ps1"
    Write-Host ""
    Write-Host "2. Update frontend environment variables:"
    Write-Host "   VITE_API_BASE_URL=$apiInvokeUrl"
    Write-Host ""
    Write-Host "3. Test a sample request:"
    Write-Host "   curl $apiInvokeUrl/projects/health"
    
} finally {
    Pop-Location
}
