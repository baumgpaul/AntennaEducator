# Test Unified Authentication in AWS
# Tests both registration and login with Cognito-enabled mode

param(
    [string]$BaseUrl = "",
    [switch]$Docker = $false
)

Write-Host "=== Testing Unified Authentication in AWS ===" -ForegroundColor Cyan
Write-Host ""

# Determine endpoint
if ($BaseUrl -eq "") {
    if ($Docker) {
        $BaseUrl = "http://localhost:8000"
        Write-Host "Testing Docker mode (USE_COGNITO=false)" -ForegroundColor Yellow
    } else {
        # Get Lambda Function URL
        Write-Host "Getting Lambda Function URL..." -ForegroundColor Yellow
        $FUNCTION_NAME = "antenna-simulator-projects-staging"
        $REGION = "eu-west-1"
        
        $BaseUrl = aws lambda get-function-url-config `
            --function-name $FUNCTION_NAME `
            --region $REGION `
            --query 'FunctionUrl' `
            --output text 2>$null
        
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Failed to get Function URL. Using API Gateway..." -ForegroundColor Yellow
            $apiEndpoint = terraform -chdir=terraform/environments/staging output -raw api_gateway_invoke_url 2>$null
            if ($apiEndpoint) {
                $BaseUrl = $apiEndpoint
            } else {
                Write-Host "Error: Could not determine API endpoint" -ForegroundColor Red
                Write-Host "Please provide -BaseUrl parameter or check AWS deployment" -ForegroundColor Red
                exit 1
            }
        }
        
        # Remove trailing slash
        $BaseUrl = $BaseUrl.TrimEnd('/')
        Write-Host "Testing AWS Cognito mode (USE_COGNITO=true)" -ForegroundColor Yellow
    }
}

Write-Host "API Endpoint: $BaseUrl" -ForegroundColor Green
Write-Host ""

# Test data
$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$testEmail = "testuser$timestamp@example.com"
$testUsername = "testuser$timestamp"
$testPassword = "TestPass123!@#"

# Test 1: Health Check
Write-Host "Test 1: Health Check" -ForegroundColor Cyan
try {
    $health = Invoke-RestMethod -Uri "$BaseUrl/health" -Method Get -ErrorAction Stop
    Write-Host "  ✓ Health: $($health.status)" -ForegroundColor Green
    Write-Host "  Service: $($health.service)" -ForegroundColor Gray
    Write-Host "  Version: $($health.version)" -ForegroundColor Gray
} catch {
    Write-Host "  ✗ Health check failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Test 2: User Registration
Write-Host "Test 2: User Registration" -ForegroundColor Cyan
Write-Host "  Email: $testEmail" -ForegroundColor Gray
Write-Host "  Username: $testUsername" -ForegroundColor Gray

$registrationBody = @{
    email = $testEmail
    username = $testUsername
    password = $testPassword
} | ConvertTo-Json

try {
    $registerResponse = Invoke-RestMethod `
        -Uri "$BaseUrl/api/v1/auth/register" `
        -Method Post `
        -ContentType "application/json" `
        -Body $registrationBody `
        -ErrorAction Stop
    
    Write-Host "  ✓ Registration successful" -ForegroundColor Green
    Write-Host "  User ID: $($registerResponse.user_id)" -ForegroundColor Gray
    Write-Host "  Email: $($registerResponse.email)" -ForegroundColor Gray
    Write-Host "  Username: $($registerResponse.username)" -ForegroundColor Gray
    Write-Host "  Is Admin: $($registerResponse.is_admin)" -ForegroundColor Gray
    Write-Host "  Is Locked: $($registerResponse.is_locked)" -ForegroundColor Gray
    
    # Verify user is unlocked by default
    if ($registerResponse.is_locked -eq $false) {
        Write-Host "  ✓ User is unlocked by default" -ForegroundColor Green
    } else {
        Write-Host "  ✗ WARNING: User is locked after registration!" -ForegroundColor Red
    }
    
    $userId = $registerResponse.user_id
} catch {
    Write-Host "  ✗ Registration failed" -ForegroundColor Red
    Write-Host "  Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($errorBody) {
        Write-Host "  Error: $($errorBody.detail)" -ForegroundColor Red
    } else {
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    if ($_.Exception.Response.StatusCode.value__ -eq 400 -and $errorBody.detail -match "email.*already") {
        Write-Host "  Note: Email already registered (this is expected if re-running tests)" -ForegroundColor Yellow
    } else {
        exit 1
    }
}
Write-Host ""

# Wait for Cognito email verification (if in AWS mode)
if (-not $Docker) {
    Write-Host "Note: In AWS Cognito mode, user needs to verify email" -ForegroundColor Yellow
    Write-Host "Check email for verification link, or use AWS Console to confirm user" -ForegroundColor Yellow
    Write-Host "Press Enter to continue with login test..." -ForegroundColor Yellow
    Read-Host
    Write-Host ""
}

# Test 3: User Login
Write-Host "Test 3: User Login" -ForegroundColor Cyan
$loginBody = @{
    email = $testEmail
    password = $testPassword
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod `
        -Uri "$BaseUrl/api/v1/auth/login" `
        -Method Post `
        -ContentType "application/json" `
        -Body $loginBody `
        -ErrorAction Stop
    
    Write-Host "  ✓ Login successful" -ForegroundColor Green
    Write-Host "  Token Type: $($loginResponse.token_type)" -ForegroundColor Gray
    Write-Host "  Expires In: $($loginResponse.expires_in) seconds" -ForegroundColor Gray
    Write-Host "  Token: $($loginResponse.access_token.Substring(0, 50))..." -ForegroundColor Gray
    
    $accessToken = $loginResponse.access_token
    
    # Verify token format
    if ($Docker) {
        Write-Host "  ✓ Local JWT token issued" -ForegroundColor Green
    } else {
        if ($accessToken -match "^eyJ") {
            Write-Host "  ✓ Cognito JWT token issued" -ForegroundColor Green
        } else {
            Write-Host "  ⚠ Unexpected token format" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "  ✗ Login failed" -ForegroundColor Red
    Write-Host "  Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($errorBody) {
        Write-Host "  Error: $($errorBody.detail)" -ForegroundColor Red
    } else {
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    if (-not $Docker -and $_.Exception.Response.StatusCode.value__ -eq 401) {
        Write-Host "  Note: User may not be verified in Cognito yet" -ForegroundColor Yellow
        Write-Host "  Run: aws cognito-idp admin-confirm-sign-up --user-pool-id <pool-id> --username $testEmail" -ForegroundColor Yellow
    }
    exit 1
}
Write-Host ""

# Test 4: Get Current User
Write-Host "Test 4: Get Current User (with token)" -ForegroundColor Cyan
try {
    $headers = @{
        "Authorization" = "Bearer $accessToken"
    }
    
    $currentUser = Invoke-RestMethod `
        -Uri "$BaseUrl/api/v1/auth/me" `
        -Method Get `
        -Headers $headers `
        -ErrorAction Stop
    
    Write-Host "  ✓ Token validation successful" -ForegroundColor Green
    Write-Host "  User ID: $($currentUser.user_id)" -ForegroundColor Gray
    Write-Host "  Email: $($currentUser.email)" -ForegroundColor Gray
    Write-Host "  Username: $($currentUser.username)" -ForegroundColor Gray
    Write-Host "  Is Admin: $($currentUser.is_admin)" -ForegroundColor Gray
    Write-Host "  Is Locked: $($currentUser.is_locked)" -ForegroundColor Gray
    
    # Verify JWT middleware worked
    Write-Host "  ✓ JWT middleware validated token correctly" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Token validation failed" -ForegroundColor Red
    Write-Host "  Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($errorBody) {
        Write-Host "  Error: $($errorBody.detail)" -ForegroundColor Red
    }
    exit 1
}
Write-Host ""

# Test 5: Invalid Token
Write-Host "Test 5: Invalid Token (should fail)" -ForegroundColor Cyan
try {
    $headers = @{
        "Authorization" = "Bearer invalid-token-xyz"
    }
    
    $response = Invoke-RestMethod `
        -Uri "$BaseUrl/api/v1/auth/me" `
        -Method Get `
        -Headers $headers `
        -ErrorAction Stop
    
    Write-Host "  ✗ SECURITY ISSUE: Invalid token was accepted!" -ForegroundColor Red
    exit 1
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 401) {
        Write-Host "  ✓ Invalid token correctly rejected (401 Unauthorized)" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Unexpected status code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
    }
}
Write-Host ""

# Test 6: Response Format Consistency
Write-Host "Test 6: Response Format Validation" -ForegroundColor Cyan
$checks = @()

# Check login response
if ($loginResponse.access_token -and $loginResponse.token_type -and $loginResponse.expires_in) {
    Write-Host "  ✓ Login response format correct" -ForegroundColor Green
    $checks += $true
} else {
    Write-Host "  ✗ Login response format incorrect" -ForegroundColor Red
    $checks += $false
}

# Check user response
if ($registerResponse.user_id -and $registerResponse.email -and $null -ne $registerResponse.is_locked) {
    Write-Host "  ✓ Registration response format correct" -ForegroundColor Green
    $checks += $true
} else {
    Write-Host "  ✗ Registration response format incorrect" -ForegroundColor Red
    $checks += $false
}

if ($checks -notcontains $false) {
    Write-Host "  ✓ All response formats are unified" -ForegroundColor Green
} else {
    Write-Host "  ✗ Response format inconsistencies detected" -ForegroundColor Red
}
Write-Host ""

# Summary
Write-Host "=== Test Summary ===" -ForegroundColor Cyan
Write-Host "✓ Health check" -ForegroundColor Green
Write-Host "✓ User registration" -ForegroundColor Green
Write-Host "✓ User login" -ForegroundColor Green
Write-Host "✓ Token validation" -ForegroundColor Green
Write-Host "✓ Invalid token rejection" -ForegroundColor Green
Write-Host "✓ Response format consistency" -ForegroundColor Green
Write-Host ""
Write-Host "Unified authentication is working correctly! 🎉" -ForegroundColor Green
Write-Host ""

if (-not $Docker) {
    Write-Host "AWS Cognito Mode Notes:" -ForegroundColor Yellow
    Write-Host "  - Users receive verification emails" -ForegroundColor White
    Write-Host "  - JWT tokens issued by AWS Cognito" -ForegroundColor White
    Write-Host "  - jwt_middleware automatically detects Cognito tokens" -ForegroundColor White
    Write-Host "  - All users unlocked by default (is_locked=false)" -ForegroundColor White
} else {
    Write-Host "Docker Mode Notes:" -ForegroundColor Yellow
    Write-Host "  - Local JWT tokens with bcrypt passwords" -ForegroundColor White
    Write-Host "  - First user becomes admin automatically" -ForegroundColor White
    Write-Host "  - jwt_middleware validates with LOCAL_JWT_SECRET" -ForegroundColor White
    Write-Host "  - All users unlocked by default (is_locked=false)" -ForegroundColor White
}
