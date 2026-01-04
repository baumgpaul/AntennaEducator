# Deploy Cognito Module to AWS
# This script deploys the Cognito user pool and client to staging environment

Write-Host "=== Deploying Cognito to Staging ===" -ForegroundColor Cyan

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
    
    # Plan deployment targeting only Cognito
    Write-Host "`n2. Planning Cognito deployment..." -ForegroundColor Yellow
    & terraform plan -target module.cognito -out cognito.tfplan
    
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
    
    # Apply Cognito deployment
    Write-Host "`n3. Deploying Cognito..." -ForegroundColor Yellow
    terraform apply cognito.tfplan
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Terraform apply failed!" -ForegroundColor Red
        exit 1
    }
    
    # Get outputs
    Write-Host "`n4. Retrieving Cognito configuration..." -ForegroundColor Yellow
    $userPoolId = terraform output -raw cognito_user_pool_id
    $clientId = terraform output -raw cognito_client_id
    $domainUrl = terraform output -raw cognito_domain_url
    $issuerUrl = terraform output -raw cognito_issuer_url
    
    Write-Host "`n=== Cognito Deployment Complete ===" -ForegroundColor Green
    Write-Host "`nCognito Configuration:" -ForegroundColor Cyan
    Write-Host "  User Pool ID: $userPoolId"
    Write-Host "  Client ID: $clientId"
    Write-Host "  Domain URL: $domainUrl"
    Write-Host "  Issuer URL: $issuerUrl"
    
    Write-Host "`n=== Next Steps ===" -ForegroundColor Yellow
    Write-Host "1. Save these values for frontend configuration:"
    Write-Host "   VITE_COGNITO_USER_POOL_ID=$userPoolId"
    Write-Host "   VITE_COGNITO_CLIENT_ID=$clientId"
    Write-Host ""
    Write-Host "2. Test user creation with AWS CLI:"
    Write-Host "   aws cognito-idp admin-create-user --user-pool-id $userPoolId --username test@example.com --profile antenna-staging"
    Write-Host ""
    Write-Host "3. Or test signup via Cognito Hosted UI:"
    Write-Host "   $domainUrl/login?client_id=$clientId&response_type=token&redirect_uri=http://localhost:3000/auth/callback"
    
    # Save to parameter store for easy retrieval
    Write-Host "`n5. Saving to SSM Parameter Store..." -ForegroundColor Yellow
    aws ssm put-parameter --name "/antenna-simulator/staging/cognito-user-pool-id" --value $userPoolId --type "String" --overwrite --profile antenna-staging
    aws ssm put-parameter --name "/antenna-simulator/staging/cognito-client-id" --value $clientId --type "String" --overwrite --profile antenna-staging
    
    Write-Host "✓ Parameters saved to SSM" -ForegroundColor Green
    
} finally {
    Pop-Location
}
