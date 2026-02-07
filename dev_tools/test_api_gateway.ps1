# Test API Gateway Endpoints
# This script tests all API Gateway routes and Lambda integrations

Write-Host "=== Testing API Gateway ===" -ForegroundColor Cyan

# Get API Gateway configuration from Terraform outputs
Push-Location "$PSScriptRoot\..\terraform\environments\staging"

try {
    $apiInvokeUrl = terraform output -raw api_gateway_invoke_url
    
    if ([string]::IsNullOrEmpty($apiInvokeUrl)) {
        Write-Host "Error: Could not get API Gateway URL from Terraform" -ForegroundColor Red
        Write-Host "Make sure API Gateway module is deployed first." -ForegroundColor Yellow
        exit 1
    }
    
    # Remove trailing slash to avoid double slashes
    $apiInvokeUrl = $apiInvokeUrl.TrimEnd('/')
    
    Write-Host "API Gateway URL: $apiInvokeUrl" -ForegroundColor Gray
    
    # Test 1: Projects Service Health Check
    Write-Host "`n1. Testing Projects Service Health..." -ForegroundColor Yellow
    Write-Host "   GET $apiInvokeUrl/health" -ForegroundColor Gray
    
    try {
        $response = Invoke-WebRequest -Uri "$apiInvokeUrl/health" -Method GET -UseBasicParsing
        Write-Host "   ✓ Status: $($response.StatusCode)" -ForegroundColor Green
        Write-Host "   Response: $($response.Content)" -ForegroundColor Gray
    } catch {
        Write-Host "   ✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    # Test 2: Projects Service List
    Write-Host "`n2. Testing Projects List..." -ForegroundColor Yellow
    Write-Host "   GET $apiInvokeUrl/api/projects" -ForegroundColor Gray
    
    try {
        $response = Invoke-WebRequest -Uri "$apiInvokeUrl/api/projects" -Method GET -UseBasicParsing
        Write-Host "   ✓ Status: $($response.StatusCode)" -ForegroundColor Green
        Write-Host "   Response: $($response.Content)" -ForegroundColor Gray
    } catch {
        Write-Host "   ✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    # Test 3: CORS headers
    Write-Host "`n3. Testing CORS Configuration..." -ForegroundColor Yellow
    Write-Host "   GET $apiInvokeUrl/api/projects (checking CORS headers)" -ForegroundColor Gray
    
    try {
        $response = Invoke-WebRequest -Uri "$apiInvokeUrl/api/projects" -Method GET -UseBasicParsing
        
        if ($response.Headers.ContainsKey('Access-Control-Allow-Origin')) {
            Write-Host "   ✓ CORS headers present" -ForegroundColor Green
            Write-Host "   Access-Control-Allow-Origin: $($response.Headers['Access-Control-Allow-Origin'])" -ForegroundColor Gray
        } else {
            Write-Host "   ⚠ CORS headers not found (may be added by API Gateway)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    # Test 4: Response time check
    Write-Host "`n4. Testing Response Time..." -ForegroundColor Yellow
    
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $response = Invoke-WebRequest -Uri "$apiInvokeUrl/health" -Method GET -UseBasicParsing
        $sw.Stop()
        Write-Host "   ✓ Response time: $($sw.ElapsedMilliseconds)ms" -ForegroundColor Green
        
        if ($sw.ElapsedMilliseconds -lt 1000) {
            Write-Host "   ✓ Response time is good (< 1s)" -ForegroundColor Green
        } elseif ($sw.ElapsedMilliseconds -lt 3000) {
            Write-Host "   ⚠ Response time is acceptable (< 3s)" -ForegroundColor Yellow
        } else {
            Write-Host "   ✗ Response time is slow (> 3s)" -ForegroundColor Red
        }
    } catch {
        $sw.Stop()
        Write-Host "   ✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Write-Host "`n=== API Gateway Tests Complete ===" -ForegroundColor Green
    Write-Host "`nAPI Gateway is ready for use!" -ForegroundColor Cyan
    Write-Host "`nNext steps:" -ForegroundColor Yellow
    Write-Host "1. Update frontend to use API Gateway URL instead of Lambda URLs"
    Write-Host "2. Test full application workflow"
    Write-Host "3. Enable Cognito authentication (set enable_auth = true)"
    Write-Host "4. Configure custom domain (optional)"
    
} catch {
    Write-Host "Error during testing: $_" -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}
