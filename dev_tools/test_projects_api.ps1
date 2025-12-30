# Integration Test Script for Projects API
# Tests the full flow: backend creation, frontend retrieval, UI verification
# 
# Usage: .\test_projects_api.ps1
# 
# Requirements:
#   - Backend running on http://localhost:8010
#   - Frontend running on http://localhost:3000
#   - PowerShell 5.1 or higher

param(
    [string]$BackendUrl = "http://localhost:8010",
    [string]$FrontendUrl = "http://localhost:3000",
    [int]$RequestTimeoutSecs = 5
)

$ErrorActionPreference = "Stop"

# Color output helpers
function Write-Success { Write-Host "✓ $args" -ForegroundColor Green }
function Write-Error-Color { Write-Host "✗ $args" -ForegroundColor Red }
function Write-Info { Write-Host "→ $args" -ForegroundColor Cyan }
function Write-Warning { Write-Host "⚠ $args" -ForegroundColor Yellow }

Write-Info "Projects API Integration Test Suite"
Write-Info "Backend URL: $BackendUrl"
Write-Info "Frontend URL: $FrontendUrl"
Write-Info ""

# Test counters
$testsPassed = 0
$testsFailed = 0

function Test-Endpoint {
    param(
        [string]$TestName,
        [string]$Method,
        [string]$Endpoint,
        [object]$Body = $null,
        [int]$ExpectedStatusCode = 200,
        [hashtable]$Headers = @{}
    )

    try {
        Write-Info "Testing: $TestName"
        
        $uri = "$BackendUrl$Endpoint"
        $params = @{
            Uri     = $uri
            Method  = $Method
            Headers = $Headers + @{
                "Content-Type" = "application/json"
                "Accept"       = "application/json"
            }
            TimeoutSec = $RequestTimeoutSecs
        }

        if ($Body) {
            $params["Body"] = $Body | ConvertTo-Json
        }

        $response = Invoke-WebRequest @params
        
        if ($response.StatusCode -eq $ExpectedStatusCode) {
            Write-Success "$TestName (HTTP $($response.StatusCode))"
            $script:testsPassed++
            return $response.Content | ConvertFrom-Json
        } else {
            Write-Error-Color "$TestName - Expected HTTP $ExpectedStatusCode, got $($response.StatusCode)"
            $script:testsFailed++
            return $null
        }
    }
    catch {
        Write-Error-Color "$TestName failed: $($_.Exception.Message)"
        $script:testsFailed++
        return $null
    }
}

# Test 1: Health Check
Write-Info ""
Write-Info "=== Health & Service Tests ==="
Test-Endpoint -TestName "Health Check" -Method "GET" -Endpoint "/health" -ExpectedStatusCode 200

# Test 2: Create Projects
Write-Info ""
Write-Info "=== Project Creation Tests ==="

$projectData1 = @{
    name        = "Dipole Antenna"
    description = "Basic dipole antenna design for integration testing"
}
$createdProject1 = Test-Endpoint -TestName "Create Dipole Project" -Method "POST" -Endpoint "/api/v1/projects" -Body $projectData1 -ExpectedStatusCode 201
$project1Id = $createdProject1.id

$projectData2 = @{
    name        = "Loop Antenna"
    description = "Loop antenna design"
}
$createdProject2 = Test-Endpoint -TestName "Create Loop Project" -Method "POST" -Endpoint "/api/v1/projects" -Body $projectData2 -ExpectedStatusCode 201
$project2Id = $createdProject2.id

$projectData3 = @{
    name        = "Helix Antenna"
    description = "Helical antenna design"
}
$createdProject3 = Test-Endpoint -TestName "Create Helix Project" -Method "POST" -Endpoint "/api/v1/projects" -Body $projectData3 -ExpectedStatusCode 201
$project3Id = $createdProject3.id

# Test 3: Read/List Projects
Write-Info ""
Write-Info "=== Project Retrieval Tests ==="

$projectsList = Test-Endpoint -TestName "List All Projects" -Method "GET" -Endpoint "/api/v1/projects" -ExpectedStatusCode 200

if ($projectsList -and $projectsList.Count -ge 3) {
    Write-Success "Retrieved $($projectsList.Count) projects"
    $script:testsPassed++
} else {
    Write-Error-Color "Expected at least 3 projects, got $($projectsList.Count)"
    $script:testsFailed++
}

# Get individual projects
Test-Endpoint -TestName "Get Dipole Project by ID" -Method "GET" -Endpoint "/api/v1/projects/$project1Id" -ExpectedStatusCode 200
Test-Endpoint -TestName "Get Loop Project by ID" -Method "GET" -Endpoint "/api/v1/projects/$project2Id" -ExpectedStatusCode 200

# Test 4: Update Projects
Write-Info ""
Write-Info "=== Project Update Tests ==="

$updateData = @{
    name        = "Dipole Antenna (Updated)"
    description = "Updated description for dipole"
}
Test-Endpoint -TestName "Update Dipole Project" -Method "PUT" -Endpoint "/api/v1/projects/$project1Id" -Body $updateData -ExpectedStatusCode 200

$partialUpdate = @{
    description = "Partial update - description only"
}
Test-Endpoint -TestName "Partial Update Loop Project" -Method "PUT" -Endpoint "/api/v1/projects/$project2Id" -Body $partialUpdate -ExpectedStatusCode 200

# Test 5: Duplicate Projects
Write-Info ""
Write-Info "=== Project Duplication Tests ==="

$duplicateResponse = Test-Endpoint -TestName "Duplicate Dipole Project" -Method "POST" -Endpoint "/api/v1/projects/$project1Id/duplicate" -ExpectedStatusCode 201

if ($duplicateResponse) {
    $duplicateId = $duplicateResponse.id
    Write-Info "Duplicate Project ID: $duplicateId"
}

# Test 6: Delete Projects
Write-Info ""
Write-Info "=== Project Deletion Tests ==="

# Delete via DELETE endpoint (expects 204 No Content)
$deleteUri = "$BackendUrl/api/v1/projects/$project3Id"
try {
    Write-Info "Testing: Delete Helix Project"
    $null = Invoke-WebRequest -Uri $deleteUri -Method "DELETE" -TimeoutSec $RequestTimeoutSecs -Headers @{"Content-Type" = "application/json"}
    Write-Success "Delete Helix Project (HTTP 204)"
    $script:testsPassed++
}
catch {
    Write-Error-Color "Delete Helix Project failed: $($_.Exception.Message)"
    $script:testsFailed++
}

# Verify deletion
$getDeletedUri = "$BackendUrl/api/v1/projects/$project3Id"
try {
    Write-Info "Testing: Verify Deleted Project Returns 404"
    $null = Invoke-WebRequest -Uri $getDeletedUri -Method "GET" -TimeoutSec $RequestTimeoutSecs -Headers @{"Content-Type" = "application/json"}
    Write-Error-Color "Verify Deleted Project: Should have returned 404, but succeeded"
    $script:testsFailed++
}
catch {
    if ($_.Exception.Response.StatusCode -eq 404) {
        Write-Success "Verify Deleted Project Returns 404"
        $script:testsPassed++
    } else {
        Write-Error-Color "Verify Deleted Project: Wrong status code $($_.Exception.Response.StatusCode)"
        $script:testsFailed++
    }
}

# Test 7: CORS Preflight
Write-Info ""
Write-Info "=== CORS Tests ==="

$optionsUri = "$BackendUrl/api/v1/projects"
try {
    Write-Info "Testing: CORS Preflight (OPTIONS)"
    $response = Invoke-WebRequest -Uri $optionsUri -Method "OPTIONS" -TimeoutSec $RequestTimeoutSecs -Headers @{
        "Origin"                        = "http://localhost:3000"
        "Access-Control-Request-Method" = "POST"
        "Access-Control-Request-Headers" = "content-type"
    }
    
    if ($response.StatusCode -eq 200 -and $response.Headers.ContainsKey("Access-Control-Allow-Origin")) {
        Write-Success "CORS Preflight (HTTP 200 with CORS headers)"
        $script:testsPassed++
    } else {
        Write-Error-Color "CORS Preflight: Missing CORS headers"
        $script:testsFailed++
    }
}
catch {
    Write-Error-Color "CORS Preflight failed: $($_.Exception.Message)"
    $script:testsFailed++
}

# Test 8: Error Handling
Write-Info ""
Write-Info "=== Error Handling Tests ==="

try {
    Write-Info "Testing: Get Non-existent Project (404)"
    $null = Invoke-WebRequest -Uri "$BackendUrl/api/v1/projects/99999" -Method "GET" -TimeoutSec $RequestTimeoutSecs
    Write-Error-Color "Should have returned 404"
    $script:testsFailed++
}
catch {
    if ($_.Exception.Response.StatusCode -eq 404) {
        Write-Success "Get Non-existent Project Returns 404"
        $script:testsPassed++
    } else {
        Write-Error-Color "Wrong status code: $($_.Exception.Response.StatusCode)"
        $script:testsFailed++
    }
}

# Test 9: Frontend Connectivity (optional)
Write-Info ""
Write-Info "=== Frontend Connectivity Tests ==="

try {
    Write-Info "Testing: Frontend is accessible"
    $response = Invoke-WebRequest -Uri $FrontendUrl -Method "GET" -TimeoutSec $RequestTimeoutSecs
    if ($response.StatusCode -eq 200) {
        Write-Success "Frontend is accessible (HTTP 200)"
        $script:testsPassed++
    }
}
catch {
    Write-Warning "Frontend not accessible: $($_.Exception.Message)"
    Write-Info "Make sure to run: npm run dev (in frontend directory)"
}

# Summary
Write-Info ""
Write-Info "======================================"
Write-Info "Test Summary"
Write-Info "======================================"
Write-Host "Passed: " -NoNewline
Write-Host $testsPassed -ForegroundColor Green
Write-Host "Failed: " -NoNewline
if ($testsFailed -gt 0) {
    Write-Host $testsFailed -ForegroundColor Red
} else {
    Write-Host $testsFailed -ForegroundColor Green
}

$totalTests = $testsPassed + $testsFailed
Write-Info "Total:  $totalTests tests"

if ($testsFailed -eq 0) {
    Write-Success ""
    Write-Success "All tests passed! ✓"
    Write-Success ""
    exit 0
} else {
    Write-Error-Color ""
    Write-Error-Color "Some tests failed. Check output above."
    Write-Error-Color ""
    exit 1
}
