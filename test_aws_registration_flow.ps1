# AWS Registration with Email Verification Test
# Complete flow: Register → Verify Email → Approve → Login

$ErrorActionPreference = "Continue"
$baseUrl = "https://vhciv2vd0e.execute-api.eu-west-1.amazonaws.com/staging"

Write-Host "`n=== AWS Registration Flow with Email Verification ===" -ForegroundColor Cyan
Write-Host "Base URL: $baseUrl`n" -ForegroundColor Cyan

# Step 1: Register
Write-Host "Step 1: User Registration" -ForegroundColor Yellow
$email = "awstest$(Get-Random)@example.com"
$username = "awstest$(Get-Random -Maximum 999)"
$password = "TestPass123!"

$regBody = @{
    email = $email
    username = $username
    password = $password
} | ConvertTo-Json

Write-Host "  Email: $email"
Write-Host "  Password: $password"

try {
    $regResp = Invoke-WebRequest -Uri "$baseUrl/api/v1/auth/register" -Method POST -Body $regBody -ContentType "application/json" -TimeoutSec 30
    $user = $regResp.Content | ConvertFrom-Json
    Write-Host "✓ Registration successful" -ForegroundColor Green
    Write-Host "  Cognito Sub: $($user.cognito_sub)" -ForegroundColor Gray
    Write-Host "  Email Verified: $($user.email_verified)" -ForegroundColor Gray
    Write-Host "`n  📧 Check your email for the verification code!`n" -ForegroundColor Yellow
    $cognitoSub = $user.cognito_sub
} catch {
    Write-Host "✗ Registration failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

# Step 2: Verify Email
Write-Host "Step 2: Email Verification" -ForegroundColor Yellow
Write-Host "  Enter the 6-digit code from your email: " -NoNewline -ForegroundColor Cyan
$verificationCode = Read-Host

try {
    $verifyResp = Invoke-WebRequest `
        -Uri "$baseUrl/api/v1/auth/verify-email?email=$([System.Web.HttpUtility]::UrlEncode($email))&code=$verificationCode" `
        -Method POST `
        -TimeoutSec 30
    
    $verifyResult = $verifyResp.Content | ConvertFrom-Json
    Write-Host "✓ Email verified successfully" -ForegroundColor Green
    Write-Host "  Message: $($verifyResult.message)`n" -ForegroundColor Gray
} catch {
    Write-Host "✗ Verification failed: $($_.Exception.Message)" -ForegroundColor Red
    $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
    Write-Host "  Error: $($errorBody.detail)" -ForegroundColor Red
    
    # Offer to resend code
    Write-Host "`n  Would you like to resend the verification code? (y/n): " -NoNewline -ForegroundColor Yellow
    $resend = Read-Host
    if ($resend -eq 'y') {
        try {
            $resendResp = Invoke-WebRequest `
                -Uri "$baseUrl/api/v1/auth/resend-verification?email=$([System.Web.HttpUtility]::UrlEncode($email))" `
                -Method POST `
                -TimeoutSec 30
            $resendResult = $resendResp.Content | ConvertFrom-Json
            Write-Host "✓ $($resendResult.message)" -ForegroundColor Green
            Write-Host "  Enter the new code: " -NoNewline -ForegroundColor Cyan
            $verificationCode = Read-Host
            
            # Try verification again
            $verifyResp = Invoke-WebRequest `
                -Uri "$baseUrl/api/v1/auth/verify-email?email=$([System.Web.HttpUtility]::UrlEncode($email))&code=$verificationCode" `
                -Method POST `
                -TimeoutSec 30
            Write-Host "✓ Email verified successfully`n" -ForegroundColor Green
        } catch {
            Write-Host "✗ Resend/verification failed. Please try manually.`n" -ForegroundColor Red
            exit 1
        }
    } else {
        exit 1
    }
}

# Step 3: Try login (should fail - not approved)
Write-Host "Step 3: Login Before Approval (should fail)" -ForegroundColor Yellow
$loginBody = @{
    email = $email
    password = $password
} | ConvertTo-Json

try {
    $loginResp = Invoke-WebRequest -Uri "$baseUrl/api/v1/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -TimeoutSec 30
    Write-Host "✗ Login should have failed but succeeded!" -ForegroundColor Red
    exit 1
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 403) {
        Write-Host "✓ Login correctly denied (403 - Pending approval)" -ForegroundColor Green
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "  Message: $($errorBody.detail)`n" -ForegroundColor Gray
    } else {
        Write-Host "✗ Unexpected error: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# Step 4: Admin approves user
Write-Host "Step 4: Admin Approval Required" -ForegroundColor Yellow
Write-Host "  Run this command to approve the user:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  aws dynamodb update-item \" -ForegroundColor White
Write-Host "    --table-name antenna-simulator-staging \" -ForegroundColor White
Write-Host "    --key '{\"PK\": {\"S\": \"USER#$cognitoSub\"}, \"SK\": {\"S\": \"METADATA\"}}' \" -ForegroundColor White
Write-Host "    --update-expression 'SET is_approved = :approved' \" -ForegroundColor White
Write-Host "    --expression-attribute-values '{\":approved\": {\"BOOL\": true}}' \" -ForegroundColor White
Write-Host "    --region eu-west-1 \" -ForegroundColor White
Write-Host "    --profile antenna-staging" -ForegroundColor White
Write-Host ""
Write-Host "  Or use AWS Console:" -ForegroundColor Cyan
Write-Host "    1. Go to DynamoDB → Tables → antenna-simulator-staging" -ForegroundColor White
Write-Host "    2. Find item with PK = USER#$cognitoSub" -ForegroundColor White
Write-Host "    3. Edit item and set is_approved = true" -ForegroundColor White
Write-Host ""
Write-Host "  Press Enter after approving..." -ForegroundColor Yellow
Read-Host

# Step 5: Login after approval
Write-Host "`nStep 5: Login After Approval" -ForegroundColor Yellow
try {
    $loginResp = Invoke-WebRequest -Uri "$baseUrl/api/v1/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -TimeoutSec 30
    $loginData = $loginResp.Content | ConvertFrom-Json
    Write-Host "✓ Login successful" -ForegroundColor Green
    Write-Host "  Token: $($loginData.access_token.Substring(0,50))..." -ForegroundColor Gray
    Write-Host "  Expires In: $($loginData.expires_in) seconds`n" -ForegroundColor Gray
    $token = $loginData.access_token
} catch {
    Write-Host "✗ Login failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

# Step 6: Access protected endpoint
Write-Host "Step 6: Access Protected Endpoint" -ForegroundColor Yellow
$headers = @{
    Authorization = "Bearer $token"
}

try {
    $userResp = Invoke-WebRequest -Uri "$baseUrl/api/v1/users/me" -Headers $headers -TimeoutSec 30
    $currentUser = $userResp.Content | ConvertFrom-Json
    Write-Host "✓ User authenticated" -ForegroundColor Green
    Write-Host "  Email: $($currentUser.email)" -ForegroundColor Gray
    Write-Host "  Username: $($currentUser.username)" -ForegroundColor Gray
    Write-Host "  Is Approved: $($currentUser.is_approved)`n" -ForegroundColor Gray
} catch {
    Write-Host "✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 7: Create test project
Write-Host "Step 7: Create Test Project" -ForegroundColor Yellow
$projectBody = @{
    name = "Verified User Project $(Get-Random)"
    description = "Project created after email verification"
} | ConvertTo-Json

try {
    $projectResp = Invoke-WebRequest -Uri "$baseUrl/api/v1/projects" -Method POST -Headers $headers -Body $projectBody -ContentType "application/json" -TimeoutSec 30
    $project = $projectResp.Content | ConvertFrom-Json
    Write-Host "✓ Project created" -ForegroundColor Green
    Write-Host "  ID: $($project.id)" -ForegroundColor Gray
    Write-Host "  Name: $($project.name)`n" -ForegroundColor Gray
} catch {
    Write-Host "✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Summary
Write-Host "=== Complete Registration Flow Successful! ===" -ForegroundColor Green
Write-Host "`nFlow Summary:" -ForegroundColor Cyan
Write-Host "  1. ✅ User registered" -ForegroundColor Green
Write-Host "  2. ✅ Email verified with code" -ForegroundColor Green
Write-Host "  3. ✅ Unapproved login blocked" -ForegroundColor Green
Write-Host "  4. ✅ Admin approved user" -ForegroundColor Green
Write-Host "  5. ✅ Approved login succeeded" -ForegroundColor Green
Write-Host "  6. ✅ Protected endpoint accessible" -ForegroundColor Green
Write-Host "  7. ✅ Project creation working" -ForegroundColor Green
Write-Host "`nTest Credentials:" -ForegroundColor Cyan
Write-Host "  Email: $email" -ForegroundColor White
Write-Host "  Password: $password" -ForegroundColor White
Write-Host "  Cognito Sub: $cognitoSub" -ForegroundColor White
Write-Host "`nAWS Authentication: FULLY WORKING! 🚀`n" -ForegroundColor Green
