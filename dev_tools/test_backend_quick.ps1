# Quick Backend Health Check
# Tests if all three services are running and responding

Write-Host "`n=== Backend Services Health Check ===" -ForegroundColor Cyan

$services = @(
    @{Name="Preprocessor"; URL="http://localhost:8001/health"},
    @{Name="Solver"; URL="http://localhost:8002/health"},
    @{Name="Postprocessor"; URL="http://localhost:8003/health"}
)

$allHealthy = $true

foreach ($service in $services) {
    Write-Host "`nTesting $($service.Name)..." -ForegroundColor Yellow -NoNewline

    try {
        $response = Invoke-WebRequest -Uri $service.URL -Method GET -TimeoutSec 5 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Host " ✅ OK" -ForegroundColor Green
            $content = $response.Content | ConvertFrom-Json
            Write-Host "  Status: $($content.status)" -ForegroundColor Gray
        } else {
            Write-Host " ❌ FAILED (Status: $($response.StatusCode))" -ForegroundColor Red
            $allHealthy = $false
        }
    } catch {
        Write-Host " ❌ NOT RESPONDING" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Gray
        $allHealthy = $false
    }
}

Write-Host ""
if ($allHealthy) {
    Write-Host "✅ All services are healthy!" -ForegroundColor Green
    Write-Host "`nAPI Documentation:" -ForegroundColor Cyan
    Write-Host "  • http://localhost:8001/api/docs" -ForegroundColor White
    Write-Host "  • http://localhost:8002/api/docs" -ForegroundColor White
    Write-Host "  • http://localhost:8003/api/docs" -ForegroundColor White
    exit 0
} else {
    Write-Host "❌ Some services are not responding!" -ForegroundColor Red
    Write-Host "`nTo start services, run:" -ForegroundColor Yellow
    Write-Host "  .\dev_tools\start_all_services.ps1" -ForegroundColor White
    exit 1
}
