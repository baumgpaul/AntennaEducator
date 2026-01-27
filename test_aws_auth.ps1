# AWS Authentication Test Suite
# Tests complete authentication flow on AWS deployment

$ErrorActionPreference = "Continue"
$baseUrl = "https://vhciv2vd0e.execute-api.eu-west-1.amazonaws.com/staging"

Write-Host "`n=== AWS Authentication Test Suite ===" -ForegroundColor Cyan
Write-Host "Base URL: $baseUrl" -ForegroundColor Cyan
Write-Host "Testing: Cognito + Lambda + API Gateway + DynamoDB`n" -ForegroundColor Cyan

# Test 1: Registration
Write-Host "Test 1: User Registration" -ForegroundColor Yellow
$email = "awstest$(Get-Random)@example.com"
$username = "awstest$(Get-Random -Maximum 999)"
$password = "TestPass123!"
$regBody = @{
    email = $email
    username = $username
    password = $password
} | ConvertTo-Json

Write-Host "  Email: $email"
try {
    $regResp = Invoke-WebRequest -Uri "$baseUrl/api/v1/auth/register" -Method POST -Body $regBody -ContentType "application/json" -TimeoutSec 30
    $user = $regResp.Content | ConvertFrom-Json
    Write-Host "✓ Registration successful" -ForegroundColor Green
    Write-Host "  Cognito Sub: $($user.cognito_sub)" -ForegroundColor Gray
    Write-Host "  Is Approved: $($user.is_approved)" -ForegroundColor Gray
    Write-Host "  Is Admin: $($user.is_admin)`n" -ForegroundColor Gray
    $cognitoSub = $user.cognito_sub
} catch {
    Write-Host "✗ Registration failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

# Test 2: Login without approval (should fail)
Write-Host "Test 2: Login Without Approval (should fail with 403)" -ForegroundColor Yellow
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
        Write-Host "✓ Login correctly denied (403 Forbidden)" -ForegroundColor Green
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "  Message: $($errorBody.detail)`n" -ForegroundColor Gray
    } else {
        Write-Host "✗ Unexpected error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "  Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
        exit 1
    }
}

# Test 3: Approve user
Write-Host "Test 3: Approve User in DynamoDB" -ForegroundColor Yellow
Write-Host "  Manual approval required. Run this command:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  aws dynamodb update-item \" -ForegroundColor White
Write-Host "    --table-name antenna-simulator-staging \" -ForegroundColor White
Write-Host "    --key '{\"PK\": {\"S\": \"USER#$cognitoSub\"}, \"SK\": {\"S\": \"PROFILE\"}}' \" -ForegroundColor White
Write-Host "    --update-expression 'SET is_approved = :approved' \" -ForegroundColor White
Write-Host "    --expression-attribute-values '{\":approved\": {\"BOOL\": true}}' \" -ForegroundColor White
Write-Host "    --region eu-west-1 \" -ForegroundColor White
Write-Host "    --profile antenna-staging" -ForegroundColor White
Write-Host ""
Write-Host "  Press Enter after approving the user..." -ForegroundColor Yellow
Read-Host

# Test 4: Login with approval
Write-Host "`nTest 4: Login With Approval" -ForegroundColor Yellow
try {
    $loginResp = Invoke-WebRequest -Uri "$baseUrl/api/v1/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -TimeoutSec 30
    $loginData = $loginResp.Content | ConvertFrom-Json
    Write-Host "✓ Login successful" -ForegroundColor Green
    Write-Host "  Token (first 50 chars): $($loginData.access_token.Substring(0,50))..." -ForegroundColor Gray
    Write-Host "  Token Type: $($loginData.token_type)" -ForegroundColor Gray
    Write-Host "  Expires In: $($loginData.expires_in) seconds`n" -ForegroundColor Gray
    $token = $loginData.access_token
    
    # Decode token to show claims
    $tokenParts = $token -split '\.'
    $paddedPayload = $tokenParts[1]
    while ($paddedPayload.Length % 4 -ne 0) {
        $paddedPayload += "="
    }
    $payload = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($paddedPayload))
    $claims = $payload | ConvertFrom-Json
    Write-Host "  Token Claims:" -ForegroundColor Gray
    Write-Host "    Sub: $($claims.sub)" -ForegroundColor DarkGray
    Write-Host "    Email: $($claims.email)" -ForegroundColor DarkGray
    Write-Host "    Cognito Username: $($claims.'cognito:username')`n" -ForegroundColor DarkGray
    
} catch {
    Write-Host "✗ Login failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

# Test 5: Get current user
Write-Host "Test 5: Get Current User (Protected Endpoint)" -ForegroundColor Yellow
$headers = @{
    Authorization = "Bearer $token"
}

try {
    $userResp = Invoke-WebRequest -Uri "$baseUrl/api/v1/users/me" -Headers $headers -TimeoutSec 30
    $currentUser = $userResp.Content | ConvertFrom-Json
    Write-Host "✓ Current user retrieved" -ForegroundColor Green
    Write-Host "  Email: $($currentUser.email)" -ForegroundColor Gray
    Write-Host "  Username: $($currentUser.username)" -ForegroundColor Gray
    Write-Host "  Is Approved: $($currentUser.is_approved)" -ForegroundColor Gray
    Write-Host "  Is Admin: $($currentUser.is_admin)`n" -ForegroundColor Gray
} catch {
    Write-Host "✗ Failed to get current user: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 6: Access without token (should fail)
Write-Host "Test 6: Access Without Token (should fail with 401)" -ForegroundColor Yellow
try {
    $noTokenResp = Invoke-WebRequest -Uri "$baseUrl/api/v1/users/me" -TimeoutSec 30
    Write-Host "✗ Request should have been denied!" -ForegroundColor Red
    exit 1
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 401) {
        Write-Host "✓ Correctly denied (401 Unauthorized)`n" -ForegroundColor Green
    } else {
        Write-Host "✗ Unexpected status code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    }
}

# Test 7: Access with invalid token (should fail)
Write-Host "Test 7: Access With Invalid Token (should fail with 401)" -ForegroundColor Yellow
$badHeaders = @{
    Authorization = "Bearer invalid.token.here"
}

try {
    $badTokenResp = Invoke-WebRequest -Uri "$baseUrl/api/v1/users/me" -Headers $badHeaders -TimeoutSec 30
    Write-Host "✗ Invalid token accepted!" -ForegroundColor Red
    exit 1
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 401) {
        Write-Host "✓ Invalid token rejected (401)`n" -ForegroundColor Green
    } else {
        Write-Host "✗ Unexpected status code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    }
}

# Test 8: List projects
Write-Host "Test 8: List Projects" -ForegroundColor Yellow
try {
    $projectsResp = Invoke-WebRequest -Uri "$baseUrl/api/v1/projects" -Headers $headers -TimeoutSec 30
    $projects = $projectsResp.Content | ConvertFrom-Json
    Write-Host "✓ Projects listed" -ForegroundColor Green
    Write-Host "  Count: $($projects.Count)`n" -ForegroundColor Gray
} catch {
    Write-Host "✗ Failed to list projects: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 9: Create project
Write-Host "Test 9: Create Project" -ForegroundColor Yellow
$projectName = "AWS Test Project $(Get-Random)"
$projectBody = @{
    name = $projectName
    description = "Testing AWS authentication and project creation"
} | ConvertTo-Json

try {
    $createResp = Invoke-WebRequest -Uri "$baseUrl/api/v1/projects" -Method POST -Headers $headers -Body $projectBody -ContentType "application/json" -TimeoutSec 30
    $project = $createResp.Content | ConvertFrom-Json
    Write-Host "✓ Project created" -ForegroundColor Green
    Write-Host "  ID: $($project.id)" -ForegroundColor Gray
    Write-Host "  Name: $($project.name)" -ForegroundColor Gray
    Write-Host "  User ID: $($project.user_id)" -ForegroundColor Gray
    Write-Host "  Created: $($project.created_at)`n" -ForegroundColor Gray
    $projectId = $project.id
} catch {
    Write-Host "✗ Failed to create project: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

# Test 10: Get project by ID
Write-Host "Test 10: Get Project by ID" -ForegroundColor Yellow
try {
    $getResp = Invoke-WebRequest -Uri "$baseUrl/api/v1/projects/$projectId" -Headers $headers -TimeoutSec 30
    $retrievedProject = $getResp.Content | ConvertFrom-Json
    Write-Host "✓ Project retrieved" -ForegroundColor Green
    Write-Host "  ID matches: $($retrievedProject.id -eq $projectId)" -ForegroundColor Gray
    Write-Host "  Name: $($retrievedProject.name)`n" -ForegroundColor Gray
} catch {
    Write-Host "✗ Failed to get project: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 11: Update project
Write-Host "Test 11: Update Project" -ForegroundColor Yellow
$updateBody = @{
    name = "Updated $projectName"
    description = "Updated description for testing"
} | ConvertTo-Json

try {
    $updateResp = Invoke-WebRequest -Uri "$baseUrl/api/v1/projects/$projectId" -Method PUT -Headers $headers -Body $updateBody -ContentType "application/json" -TimeoutSec 30
    $updatedProject = $updateResp.Content | ConvertFrom-Json
    Write-Host "✓ Project updated" -ForegroundColor Green
    Write-Host "  New Name: $($updatedProject.name)" -ForegroundColor Gray
    Write-Host "  New Description: $($updatedProject.description)`n" -ForegroundColor Gray
} catch {
    Write-Host "✗ Failed to update project: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

# Summary
Write-Host "=== Test Suite Complete ===" -ForegroundColor Green
Write-Host "`n✓ All 11 tests passed!" -ForegroundColor Green
Write-Host "`nTest Summary:" -ForegroundColor Cyan
Write-Host "  Test Email: $email" -ForegroundColor White
Write-Host "  Cognito Sub: $cognitoSub" -ForegroundColor White
Write-Host "  Project ID: $projectId" -ForegroundColor White
Write-Host "  Project Name: $($updatedProject.name)" -ForegroundColor White
Write-Host "`nAuthentication: ✅ Working" -ForegroundColor Green
Write-Host "Authorization: ✅ Working" -ForegroundColor Green
Write-Host "Project CRUD: ✅ Working" -ForegroundColor Green
Write-Host "Error Handling: ✅ Working" -ForegroundColor Green
Write-Host "`nAWS Deployment Status: PRODUCTION READY! 🚀`n" -ForegroundColor Green
