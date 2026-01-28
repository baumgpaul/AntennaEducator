# Test authentication flow in production
# This simulates what the frontend does

$ErrorActionPreference = "Stop"

$BASE_URL = "https://lizbey4kcxsjtqdidcwebk6fte0hgwja.lambda-url.eu-west-1.on.aws"

Write-Host "=== Testing Auth Flow ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Register a new user (or use existing)
Write-Host "Step 1: Register user..." -ForegroundColor Yellow
$registerData = @{
    email = "test-$(Get-Random)@example.com"
    username = "testuser$(Get-Random)"
    password = "TestPass123!"
} | ConvertTo-Json

try {
    $registerResponse = Invoke-RestMethod -Uri "$BASE_URL/api/auth/register" `
        -Method POST `
        -Body $registerData `
        -ContentType "application/json" `
        -ErrorAction SilentlyContinue
    Write-Host "✓ Registration successful" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        Write-Host "! User already exists (expected)" -ForegroundColor Yellow
    } else {
        Write-Host "✗ Registration failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""

# Step 2: Login
Write-Host "Step 2: Login..." -ForegroundColor Yellow
$registerObj = $registerData | ConvertFrom-Json
$loginData = @{
    email = $registerObj.email
    password = $registerObj.password
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$BASE_URL/api/auth/login" `
        -Method POST `
        -Body $loginData `
        -ContentType "application/json"
    
    $token = $loginResponse.access_token
    Write-Host "✓ Login successful" -ForegroundColor Green
    Write-Host "  Token: $($token.Substring(0, 50))..." -ForegroundColor Gray
} catch {
    Write-Host "✗ Login failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 3: Get current user (auth endpoint)
Write-Host "Step 3: Get current user (/api/auth/me)..." -ForegroundColor Yellow
try {
    $meResponse = Invoke-RestMethod -Uri "$BASE_URL/api/auth/me" `
        -Method GET `
        -Headers @{ Authorization = "Bearer $token" }
    
    Write-Host "✓ Auth /me endpoint works" -ForegroundColor Green
    Write-Host "  User: $($meResponse.email)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Auth /me failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    Write-Host "  Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

Write-Host ""

# Step 4: Try to call projects endpoint (THIS IS WHERE IT FAILS)
Write-Host "Step 4: Get projects (/api/projects/)..." -ForegroundColor Yellow
try {
    $projectsResponse = Invoke-RestMethod -Uri "$BASE_URL/api/projects/" `
        -Method GET `
        -Headers @{ Authorization = "Bearer $token" }
    
    Write-Host "✓ Projects endpoint works" -ForegroundColor Green
    Write-Host "  Projects count: $($projectsResponse.Count)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Projects endpoint failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    Write-Host "  Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "THIS IS THE BUG - Auth works but projects endpoint returns 401" -ForegroundColor Magenta
}

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Cyan
