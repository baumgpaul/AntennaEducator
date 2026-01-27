# Docker Standalone Auth Test Script
# Tests the complete authentication flow with DynamoDB Local (in-memory)

Write-Host "`n=== Docker Standalone Auth Test ===" -ForegroundColor Cyan
Write-Host "Testing with DynamoDB Local (in-memory mode)`n"

# Test 1: Health check
Write-Host "Test 1: Health Check" -ForegroundColor Yellow
try {
    $health = Invoke-WebRequest -Uri "http://localhost:8010/health" -TimeoutSec 5
    Write-Host "✓ Service is healthy" -ForegroundColor Green
} catch {
    Write-Host "✗ Service health check failed: $_" -ForegroundColor Red
    exit 1
}

# Test 2: Register new user
Write-Host "`nTest 2: User Registration" -ForegroundColor Yellow
$email = "test$(Get-Random)@example.com"
$username = "testuser$(Get-Random -Maximum 999)"
$password = "Pass123!"

$regBody = @{
    email = $email
    username = $username
    password = $password
} | ConvertTo-Json

try {
    $regResp = Invoke-WebRequest -Uri "http://localhost:8010/api/v1/auth/register" -Method POST -Body $regBody -ContentType "application/json" -TimeoutSec 10
    $user = $regResp.Content | ConvertFrom-Json
    Write-Host "✓ User registered: $($user.email)" -ForegroundColor Green
    Write-Host "  - Auto-approved: $($user.is_approved)" -ForegroundColor Gray
    Write-Host "  - Is admin: $($user.is_admin)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Registration failed: $_" -ForegroundColor Red
    exit 1
}

# Test 3: Login
Write-Host "`nTest 3: User Login" -ForegroundColor Yellow
$loginBody = @{
    email = $email
    password = $password
} | ConvertTo-Json

try {
    $loginResp = Invoke-WebRequest -Uri "http://localhost:8010/api/v1/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -TimeoutSec 10
    $loginData = $loginResp.Content | ConvertFrom-Json
    $token = $loginData.access_token
    Write-Host "✓ Login successful" -ForegroundColor Green
    Write-Host "  - Token: $($token.Substring(0,30))..." -ForegroundColor Gray
} catch {
    Write-Host "✗ Login failed: $_" -ForegroundColor Red
    exit 1
}

# Test 4: Access protected endpoint (list projects)
Write-Host "`nTest 4: Protected Endpoint Access" -ForegroundColor Yellow
$headers = @{
    Authorization = "Bearer $token"
}

try {
    $projectsResp = Invoke-WebRequest -Uri "http://localhost:8010/api/v1/projects" -Headers $headers -TimeoutSec 10
    $projects = $projectsResp.Content | ConvertFrom-Json
    Write-Host "✓ Protected endpoint accessible" -ForegroundColor Green
    Write-Host "  - Projects count: $($projects.Count)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Protected endpoint failed: $_" -ForegroundColor Red
    exit 1
}

# Test 5: Create project
Write-Host "`nTest 5: Project Creation" -ForegroundColor Yellow
$projectBody = @{
    name = "Test Project $(Get-Random)"
    description = "Docker standalone test project"
} | ConvertTo-Json

try {
    $createResp = Invoke-WebRequest -Uri "http://localhost:8010/api/v1/projects" -Method POST -Headers $headers -Body $projectBody -ContentType "application/json" -TimeoutSec 10
    $project = $createResp.Content | ConvertFrom-Json
    Write-Host "✓ Project created: $($project.name)" -ForegroundColor Green
    Write-Host "  - ID: $($project.id)" -ForegroundColor Gray
    Write-Host "  - User ID: $($project.user_id)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Project creation failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== All Tests Passed! ===" -ForegroundColor Green
Write-Host "`nNote: DynamoDB Local runs in-memory mode." -ForegroundColor Cyan
Write-Host "Data will be lost when the container restarts." -ForegroundColor Cyan
Write-Host "This is ideal for development and testing.`n"
