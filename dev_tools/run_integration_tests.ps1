# Integration Test Runner
# Starts both services and runs integration tests

param(
    [switch]$KeepServicesRunning
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Integration Test Runner" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Check if services are already running
$preprocessorRunning = $false
$solverRunning = $false

try {
    $response = Invoke-WebRequest -Uri "http://localhost:8001/health" -TimeoutSec 1 -UseBasicParsing -ErrorAction SilentlyContinue
    if ($response.StatusCode -eq 200) {
        $preprocessorRunning = $true
        Write-Host "✓ Preprocessor already running on port 8001" -ForegroundColor Green
    }
} catch {}

try {
    $response = Invoke-WebRequest -Uri "http://localhost:8002/health" -TimeoutSec 1 -UseBasicParsing -ErrorAction SilentlyContinue
    if ($response.StatusCode -eq 200) {
        $solverRunning = $true
        Write-Host "✓ Solver already running on port 8002" -ForegroundColor Green
    }
} catch {}

$preprocessorJob = $null
$solverJob = $null

try {
    # Start preprocessor if not running
    if (-not $preprocessorRunning) {
        Write-Host "`nStarting preprocessor service..." -ForegroundColor Yellow
        $preprocessorJob = Start-Job -ScriptBlock {
            Set-Location $using:PWD
            .\.venv\Scripts\python.exe -m uvicorn backend.preprocessor.main:app --port 8001
        }
        Write-Host "✓ Preprocessor starting (Job ID: $($preprocessorJob.Id))" -ForegroundColor Green
    }

    # Start solver if not running
    if (-not $solverRunning) {
        Write-Host "Starting solver service..." -ForegroundColor Yellow
        $solverJob = Start-Job -ScriptBlock {
            Set-Location $using:PWD
            .\.venv\Scripts\python.exe -m uvicorn backend.solver.main:app --port 8002
        }
        Write-Host "✓ Solver starting (Job ID: $($solverJob.Id))" -ForegroundColor Green
    }

    Write-Host "`nWaiting for services to be ready..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10

    # Verify services are responding
    Write-Host "Verifying service health..." -ForegroundColor Yellow
    
    $maxRetries = 20
    $retryCount = 0
    $preprocessorHealthy = $false
    $solverHealthy = $false
    
    while ($retryCount -lt $maxRetries) {
        if (-not $preprocessorHealthy) {
            try {
                $response = Invoke-WebRequest -Uri "http://localhost:8001/health" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
                if ($response.StatusCode -eq 200) {
                    $preprocessorHealthy = $true
                    Write-Host "  ✓ Preprocessor ready" -ForegroundColor Green
                }
            } catch {
                if ($retryCount % 5 -eq 0) {
                    Write-Host "  Waiting for preprocessor... (attempt $retryCount)" -ForegroundColor DarkGray
                }
            }
        }
        
        if (-not $solverHealthy) {
            try {
                $response = Invoke-WebRequest -Uri "http://localhost:8002/health" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
                if ($response.StatusCode -eq 200) {
                    $solverHealthy = $true
                    Write-Host "  ✓ Solver ready" -ForegroundColor Green
                }
            } catch {
                if ($retryCount % 5 -eq 0) {
                    Write-Host "  Waiting for solver... (attempt $retryCount)" -ForegroundColor DarkGray
                }
            }
        }
        
        if ($preprocessorHealthy -and $solverHealthy) {
            break
        }
        
        Start-Sleep -Seconds 1
        $retryCount++
    }
    
    if (-not $preprocessorHealthy -or -not $solverHealthy) {
        Write-Host "`nService health check status:" -ForegroundColor Yellow
        Write-Host "  Preprocessor: $(if ($preprocessorHealthy) { '✓ Ready' } else { '✗ Not responding' })" -ForegroundColor $(if ($preprocessorHealthy) { 'Green' } else { 'Red' })
        Write-Host "  Solver: $(if ($solverHealthy) { '✓ Ready' } else { '✗ Not responding' })" -ForegroundColor $(if ($solverHealthy) { 'Green' } else { 'Red' })
        throw "Services did not become healthy in time"
    }
    
    Write-Host "`n✓ Both services are healthy" -ForegroundColor Green

    # Run integration tests
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Running Integration Tests" -ForegroundColor Cyan
    Write-Host "========================================`n" -ForegroundColor Cyan

    .\.venv\Scripts\python.exe -m pytest tests\integration\test_preprocessor_solver_pipeline.py -v --tb=short --color=yes

    $testExitCode = $LASTEXITCODE

    Write-Host "`n========================================" -ForegroundColor Cyan
    if ($testExitCode -eq 0) {
        Write-Host "✓ All integration tests passed!" -ForegroundColor Green
    } else {
        Write-Host "✗ Some integration tests failed" -ForegroundColor Red
    }
    Write-Host "========================================`n" -ForegroundColor Cyan

} finally {
    # Cleanup: Stop services if we started them
    if (-not $KeepServicesRunning) {
        if ($preprocessorJob) {
            Write-Host "Stopping preprocessor service..." -ForegroundColor Yellow
            Stop-Job -Job $preprocessorJob -ErrorAction SilentlyContinue
            Remove-Job -Job $preprocessorJob -Force -ErrorAction SilentlyContinue
        }
        
        if ($solverJob) {
            Write-Host "Stopping solver service..." -ForegroundColor Yellow
            Stop-Job -Job $solverJob -ErrorAction SilentlyContinue
            Remove-Job -Job $solverJob -Force -ErrorAction SilentlyContinue
        }
        
        Write-Host "✓ Services stopped`n" -ForegroundColor Green
    } else {
        Write-Host "`nServices left running (use Stop-Job to terminate)" -ForegroundColor Yellow
        Write-Host "  Preprocessor: http://localhost:8001/api/docs" -ForegroundColor Gray
        Write-Host "  Solver: http://localhost:8002/api/docs`n" -ForegroundColor Gray
        Write-Host "  Stop with: Get-Job | Stop-Job; Get-Job | Remove-Job" -ForegroundColor Gray
    }
}

exit $testExitCode
