# Start Backend Services (Simple)
# Starts services in current terminal - Press Ctrl+C to stop

Write-Host "`n🚀 Starting Backend Services..." -ForegroundColor Cyan
Write-Host "Services will start on ports 8001, 8002, 8003" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop all services`n" -ForegroundColor Yellow

cd $PSScriptRoot\..

# Start all three services with & to run in background
$jobs = @()

Write-Host "[1/3] Preprocessor starting..." -ForegroundColor Green
$jobs += Start-Job -ScriptBlock { 
    cd $using:PWD
    & .\.venv\Scripts\python.exe -m uvicorn backend.preprocessor.main:app --port 8001
}

Write-Host "[2/3] Solver starting..." -ForegroundColor Green  
$jobs += Start-Job -ScriptBlock {
    cd $using:PWD
    & .\.venv\Scripts\python.exe -m uvicorn backend.solver.main:app --port 8002
}

Write-Host "[3/3] Postprocessor starting..." -ForegroundColor Green
$jobs += Start-Job -ScriptBlock {
    cd $using:PWD
    & .\.venv\Scripts\python.exe -m uvicorn backend.postprocessor.main:app --port 8003
}

Start-Sleep -Seconds 5

Write-Host "`n✅ Services should be running!" -ForegroundColor Green
Write-Host "`nTest with: .\dev_tools\test_backend_quick.ps1" -ForegroundColor Cyan
Write-Host "`nAPI Docs:" -ForegroundColor Cyan
Write-Host "  http://localhost:8001/api/v1/docs" -ForegroundColor White
Write-Host "  http://localhost:8002/api/v1/docs" -ForegroundColor White  
Write-Host "  http://localhost:8003/api/v1/docs" -ForegroundColor White

Write-Host "`nKeeping services alive... Press Ctrl+C to stop`n" -ForegroundColor Yellow

try {
    while ($true) {
        Start-Sleep -Seconds 1
    }
} finally {
    Write-Host "`nStopping services..." -ForegroundColor Yellow
    $jobs | Stop-Job
    $jobs | Remove-Job
}
