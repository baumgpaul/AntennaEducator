# Test Postprocessing Features
# Run all tests for incremental field computation and directivity settings

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "POSTPROCESSING FEATURE TESTS" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$ErrorActionPreference = "Continue"
$allPassed = $true

# Test 1: Frontend Unit Tests
Write-Host "1. Running Frontend Unit Tests..." -ForegroundColor Yellow
Write-Host "   - DirectivitySettingsDialog" -ForegroundColor Gray
Write-Host "   - Incremental Postprocessing Redux" -ForegroundColor Gray

Push-Location "$PSScriptRoot\..\frontend"
try {
    $result = npm run test -- --run --reporter=verbose DirectivitySettingsDialog.test.tsx solverSlice.incrementalPostprocessing.test.ts 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✓ Frontend unit tests passed`n" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Frontend unit tests failed`n" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "   ⚠ Could not run frontend tests: $_`n" -ForegroundColor Yellow
    $allPassed = $false
} finally {
    Pop-Location
}

# Test 2: Backend Integration Tests
Write-Host "2. Running Backend Integration Tests..." -ForegroundColor Yellow
Write-Host "   - Incremental field computation" -ForegroundColor Gray
Write-Host "   - Custom directivity discretization" -ForegroundColor Gray
Write-Host "   - Progress tracking" -ForegroundColor Gray

try {
    # Start backend services if not running
    $solverRunning = Get-NetTCPConnection -LocalPort 8002 -State Listen -ErrorAction SilentlyContinue
    $postprocessorRunning = Get-NetTCPConnection -LocalPort 8003 -State Listen -ErrorAction SilentlyContinue
    
    $startedServices = $false
    if (-not $solverRunning -or -not $postprocessorRunning) {
        Write-Host "   Starting backend services..." -ForegroundColor Gray
        $solverJob = Start-Job -ScriptBlock { 
            Set-Location $using:PSScriptRoot\..
            .\.venv\Scripts\python.exe -m uvicorn backend.solver.main:app --port 8002 --reload 
        }
        $postprocessorJob = Start-Job -ScriptBlock { 
            Set-Location $using:PSScriptRoot\..
            .\.venv\Scripts\python.exe -m uvicorn backend.postprocessor.main:app --port 8003 --reload 
        }
        Start-Sleep -Seconds 5
        $startedServices = $true
    }
    
    # Run integration tests
    .\.venv\Scripts\python.exe "$PSScriptRoot\test_incremental_postprocessing.py"
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✓ Backend integration tests passed`n" -ForegroundColor Green
    } else {
        Write-Host "   ✗ Backend integration tests failed`n" -ForegroundColor Red
        $allPassed = $false
    }
    
    # Stop services if we started them
    if ($startedServices) {
        Stop-Job -Job $solverJob -ErrorAction SilentlyContinue
        Stop-Job -Job $postprocessorJob -ErrorAction SilentlyContinue
        Remove-Job -Job $solverJob -ErrorAction SilentlyContinue
        Remove-Job -Job $postprocessorJob -ErrorAction SilentlyContinue
    }
    
} catch {
    Write-Host "   ✗ Backend integration tests failed: $_`n" -ForegroundColor Red
    $allPassed = $false
}

# Test 3: Manual Test Checklist
Write-Host "3. Manual Test Checklist" -ForegroundColor Yellow
Write-Host "   Please verify the following manually in the UI:`n" -ForegroundColor Gray

$manualTests = @(
    "Add Directivity → Dialog opens with theta/phi inputs",
    "Change directivity settings in properties panel → Values update",
    "Solve → Add field → Compute postprocessing → Only new field computed",
    "Directivity shows green checkmark after computation",
    "Progress shows 'N/M fields' during computation",
    "Stop button cancels postprocessing",
    "All buttons disabled during solve/postprocessing",
    "Changing directivity settings clears computed status"
)

foreach ($test in $manualTests) {
    Write-Host "   [ ] $test" -ForegroundColor Cyan
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
if ($allPassed) {
    Write-Host "✓ AUTOMATED TESTS PASSED" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "`nPlease complete the manual test checklist above." -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "✗ SOME TESTS FAILED" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "`nPlease review the errors above." -ForegroundColor Yellow
    exit 1
}
