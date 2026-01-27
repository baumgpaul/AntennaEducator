# Configure Lambda Environment Variables for Unified Authentication
# Sets up Cognito configuration in the Lambda function

param(
    [Parameter(Mandatory=$false)]
    [string]$CognitoUserPoolId = "",
    
    [Parameter(Mandatory=$false)]
    [string]$CognitoClientId = "",
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("true", "false")]
    [string]$UseCognito = "true"
)

Write-Host "=== Configuring Lambda Environment Variables ===" -ForegroundColor Cyan
Write-Host ""

$FUNCTION_NAME = "antenna-simulator-projects-staging"
$REGION = "eu-west-1"

# Get Cognito configuration from Terraform if not provided
if ($CognitoUserPoolId -eq "" -or $CognitoClientId -eq "") {
    Write-Host "Fetching Cognito configuration from Terraform..." -ForegroundColor Yellow
    
    Push-Location terraform/environments/staging
    try {
        $CognitoUserPoolId = (terraform output -raw cognito_user_pool_id 2>$null).Trim()
        $CognitoClientId = (terraform output -raw cognito_client_id 2>$null).Trim()
    } finally {
        Pop-Location
    }
    
    if ($CognitoUserPoolId -eq "" -or $CognitoClientId -eq "") {
        Write-Host "Could not fetch Cognito configuration from Terraform." -ForegroundColor Red
        Write-Host "Please provide -CognitoUserPoolId and -CognitoClientId parameters" -ForegroundColor Red
        Write-Host ""
        Write-Host "Usage:" -ForegroundColor Yellow
        Write-Host "  .\configure-lambda-auth.ps1 -CognitoUserPoolId <pool-id> -CognitoClientId <client-id>" -ForegroundColor White
        Write-Host ""
        Write-Host "Or set USE_COGNITO=false for Docker mode:" -ForegroundColor Yellow
        Write-Host "  .\configure-lambda-auth.ps1 -UseCognito false" -ForegroundColor White
        exit 1
    }
}

Write-Host "Configuration:" -ForegroundColor Green
Write-Host "  Function: $FUNCTION_NAME" -ForegroundColor White
Write-Host "  Region: $REGION" -ForegroundColor White
Write-Host "  USE_COGNITO: $UseCognito" -ForegroundColor White

if ($UseCognito -eq "true") {
    Write-Host "  Cognito User Pool ID: $CognitoUserPoolId" -ForegroundColor White
    Write-Host "  Cognito Client ID: $CognitoClientId" -ForegroundColor White
}
Write-Host ""

# Get current environment variables
Write-Host "1. Fetching current environment variables..." -ForegroundColor Yellow
$currentConfig = aws lambda get-function-configuration `
    --function-name $FUNCTION_NAME `
    --region $REGION `
    --query 'Environment.Variables' `
    --output json | ConvertFrom-Json

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to get Lambda configuration!" -ForegroundColor Red
    exit 1
}

# Convert PSCustomObject to hashtable
$envVars = @{}
$currentConfig.PSObject.Properties | ForEach-Object {
    $envVars[$_.Name] = $_.Value
}

Write-Host "  ✓ Current variables fetched" -ForegroundColor Green

# Update authentication variables
Write-Host "`n2. Updating authentication variables..." -ForegroundColor Yellow

$envVars["USE_COGNITO"] = $UseCognito

if ($UseCognito -eq "true") {
    $envVars["COGNITO_REGION"] = $REGION
    $envVars["COGNITO_USER_POOL_ID"] = $CognitoUserPoolId
    $envVars["COGNITO_CLIENT_ID"] = $CognitoClientId
    Write-Host "  ✓ Cognito mode configured" -ForegroundColor Green
} else {
    # Ensure LOCAL_JWT_SECRET exists for Docker mode
    if (-not $envVars.ContainsKey("LOCAL_JWT_SECRET") -or $envVars["LOCAL_JWT_SECRET"] -eq "") {
        # Generate a secure random secret
        $bytes = New-Object byte[] 32
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $rng.GetBytes($bytes)
        $secret = [Convert]::ToBase64String($bytes) -replace '\+', '-' -replace '/', '_' -replace '=', ''
        
        $envVars["LOCAL_JWT_SECRET"] = $secret
        Write-Host "  ✓ Generated new LOCAL_JWT_SECRET" -ForegroundColor Green
    }
    Write-Host "  ✓ Docker/Local mode configured" -ForegroundColor Green
}

# Ensure other required variables exist
if (-not $envVars.ContainsKey("JWT_ALGORITHM")) {
    $envVars["JWT_ALGORITHM"] = "HS256"
}
if (-not $envVars.ContainsKey("JWT_EXPIRE_MINUTES")) {
    $envVars["JWT_EXPIRE_MINUTES"] = "60"
}

# Convert hashtable to JSON format for AWS CLI
# Remove null values to prevent JSON parse errors
$envVarsFiltered = @{}
foreach ($key in $envVars.Keys) {
    if ($null -ne $envVars[$key]) {
        $envVarsFiltered[$key] = $envVars[$key]
    }
}

# Write to temp file to avoid escaping issues
$tempFile = [System.IO.Path]::GetTempFileName()
$envConfig = @{ Variables = $envVarsFiltered } | ConvertTo-Json -Compress
$envConfig | Out-File -FilePath $tempFile -Encoding utf8

# Update Lambda function
Write-Host "`n3. Applying configuration to Lambda..." -ForegroundColor Yellow

$updateResult = aws lambda update-function-configuration `
    --function-name $FUNCTION_NAME `
    --environment file://$tempFile `
    --region $REGION 2>&1

Remove-Item $tempFile -Force -ErrorAction SilentlyContinue

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to update Lambda configuration!" -ForegroundColor Red
    Write-Host "Error: $updateResult" -ForegroundColor Red
    exit 1
}

Write-Host "  ✓ Lambda configuration updated" -ForegroundColor Green

# Wait for update to complete
Write-Host "  Waiting for configuration update..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

$maxAttempts = 20
$attempt = 0
$ready = $false

while (-not $ready -and $attempt -lt $maxAttempts) {
    $attempt++
    
    $state = aws lambda get-function `
        --function-name $FUNCTION_NAME `
        --region $REGION `
        --query 'Configuration.LastUpdateStatus' `
        --output text
    
    if ($state -eq "Successful") {
        $ready = $true
        Write-Host "  ✓ Configuration update completed" -ForegroundColor Green
    } elseif ($state -eq "Failed") {
        Write-Host "  ✗ Configuration update failed!" -ForegroundColor Red
        exit 1
    } else {
        Write-Host "  Attempt $attempt/$maxAttempts - Status: $state" -ForegroundColor Gray
        Start-Sleep -Seconds 2
    }
}

if (-not $ready) {
    Write-Host "  ⚠ Configuration update did not complete within timeout" -ForegroundColor Yellow
}

# Verify configuration
Write-Host "`n4. Verifying configuration..." -ForegroundColor Yellow
$verifyConfig = aws lambda get-function-configuration `
    --function-name $FUNCTION_NAME `
    --region $REGION `
    --query 'Environment.Variables' `
    --output json | ConvertFrom-Json

$verified = $true
if ($verifyConfig.USE_COGNITO -eq $UseCognito) {
    Write-Host "  ✓ USE_COGNITO: $($verifyConfig.USE_COGNITO)" -ForegroundColor Green
} else {
    Write-Host "  ✗ USE_COGNITO not set correctly" -ForegroundColor Red
    $verified = $false
}

if ($UseCognito -eq "true") {
    if ($verifyConfig.COGNITO_USER_POOL_ID) {
        Write-Host "  ✓ COGNITO_USER_POOL_ID: $($verifyConfig.COGNITO_USER_POOL_ID)" -ForegroundColor Green
    } else {
        Write-Host "  ✗ COGNITO_USER_POOL_ID not set" -ForegroundColor Red
        $verified = $false
    }
    
    if ($verifyConfig.COGNITO_CLIENT_ID) {
        Write-Host "  ✓ COGNITO_CLIENT_ID: $($verifyConfig.COGNITO_CLIENT_ID)" -ForegroundColor Green
    } else {
        Write-Host "  ✗ COGNITO_CLIENT_ID not set" -ForegroundColor Red
        $verified = $false
    }
} else {
    if ($verifyConfig.LOCAL_JWT_SECRET) {
        Write-Host "  ✓ LOCAL_JWT_SECRET: [configured]" -ForegroundColor Green
    } else {
        Write-Host "  ✗ LOCAL_JWT_SECRET not set" -ForegroundColor Red
        $verified = $false
    }
}

Write-Host ""

if ($verified) {
    Write-Host "=== Configuration Complete ===" -ForegroundColor Green
    Write-Host ""
    
    if ($UseCognito -eq "true") {
        Write-Host "Lambda is now configured for AWS Cognito authentication:" -ForegroundColor Cyan
        Write-Host "  • Users authenticate with Cognito" -ForegroundColor White
        Write-Host "  • Email verification required" -ForegroundColor White
        Write-Host "  • JWT tokens issued by AWS" -ForegroundColor White
        Write-Host "  • jwt_middleware validates Cognito tokens" -ForegroundColor White
        Write-Host "  • Users unlocked by default (is_locked=false)" -ForegroundColor White
    } else {
        Write-Host "Lambda is now configured for Docker/Local authentication:" -ForegroundColor Cyan
        Write-Host "  • Users authenticate with local JWT" -ForegroundColor White
        Write-Host "  • Passwords hashed with bcrypt" -ForegroundColor White
        Write-Host "  • First user becomes admin" -ForegroundColor White
        Write-Host "  • jwt_middleware validates local tokens" -ForegroundColor White
        Write-Host "  • Users unlocked by default (is_locked=false)" -ForegroundColor White
    }
    
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Yellow
    Write-Host "  1. Run: .\test-auth-aws.ps1 to test authentication" -ForegroundColor White
    Write-Host "  2. Verify registration and login work correctly" -ForegroundColor White
    Write-Host "  3. Check CloudWatch Logs for any errors" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "=== Configuration Issues Detected ===" -ForegroundColor Red
    Write-Host "Please check the errors above and try again." -ForegroundColor Red
    exit 1
}

Write-Host "Configuration successful! ✅" -ForegroundColor Green
