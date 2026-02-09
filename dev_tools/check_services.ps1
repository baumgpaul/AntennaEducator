# Check if backend services are running and healthy

Write-Host "`n=== Checking Backend Services ===" -ForegroundColor Cyan

function Test-Service {
    param(
        [string]$ServiceName,
        [string]$Url
    )

    Write-Host "`nTesting $ServiceName at $Url..." -NoNewline

    try {
        $response = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 5 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            Write-Host " ✅ OK" -ForegroundColor Green
            $json = $response.Content | ConvertFrom-Json
            Write-Host "  Service: $($json.service)" -ForegroundColor Gray
            Write-Host "  Version: $($json.version)" -ForegroundColor Gray
            Write-Host "  Status: $($json.status)" -ForegroundColor Gray
            return $true
        } else {
            Write-Host " ❌ FAILED (Status: $($response.StatusCode))" -ForegroundColor Red
            return $false
        }
    }
    catch {
        Write-Host " ❌ NOT RUNNING" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Gray
        return $false
    }
}

$preprocessorOk = Test-Service -ServiceName "Preprocessor" -Url "http://localhost:8001/health"
$solverOk = Test-Service -ServiceName "Solver" -Url "http://localhost:8002/health"
$postprocessorOk = Test-Service -ServiceName "Postprocessor" -Url "http://localhost:8003/health"

Write-Host "`n=== Summary ===" -ForegroundColor Cyan
if ($preprocessorOk -and $solverOk -and $postprocessorOk) {
    Write-Host "✅ All services are running!" -ForegroundColor Green
    Write-Host "`nYou can now run tests:" -ForegroundColor White
    Write-Host "  pytest tests/unit/ -x -q" -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "❌ Some services are not running!" -ForegroundColor Red
    Write-Host "`nTo start services, run:" -ForegroundColor White
    Write-Host "  .\dev_tools\start_all_services.ps1" -ForegroundColor Yellow
    Write-Host "`nOr start individual services in separate terminals:" -ForegroundColor White
    if (-not $preprocessorOk) {
        Write-Host "  python -m backend.preprocessor.main" -ForegroundColor Yellow
    }
    if (-not $solverOk) {
        Write-Host "  python -m backend.solver.main" -ForegroundColor Yellow
    }
    if (-not $postprocessorOk) {
        Write-Host "  python -m backend.postprocessor.main" -ForegroundColor Yellow
    }
    exit 1
}
