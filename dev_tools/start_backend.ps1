# Start Backend Services (Simple)
# Starts services in current terminal - Press Ctrl+C to stop


Write-Host "`n🚀 Starting Backend Services..." -ForegroundColor Cyan
Write-Host "Services will start on ports 8001 (Preprocessor), 8002 (Solver), 8003 (Postprocessor), 8010 (Projects)" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop all services`n" -ForegroundColor Yellow

cd $PSScriptRoot\..


# Start all four services with & to run in background
$jobs = @()

Write-Host "[1/4] Preprocessor starting..." -ForegroundColor Green
$jobs += Start-Job -ScriptBlock { 
    cd $using:PWD
    & .\.venv\Scripts\python.exe -m uvicorn backend.preprocessor.main:app --port 8001 --reload
}

Write-Host "[2/4] Solver starting..." -ForegroundColor Green  
$jobs += Start-Job -ScriptBlock {
    cd $using:PWD
    & .\.venv\Scripts\python.exe -m uvicorn backend.solver.main:app --port 8002 --reload
}

Write-Host "[3/4] Postprocessor starting..." -ForegroundColor Green
$jobs += Start-Job -ScriptBlock {
    cd $using:PWD
    & .\.venv\Scripts\python.exe -m uvicorn backend.postprocessor.main:app --port 8003 --reload
}

Write-Host "[4/4] Projects service starting..." -ForegroundColor Green
$jobs += Start-Job -ScriptBlock {
    cd $using:PWD
    $env:DISABLE_AUTH = "true"
    & .\.venv\Scripts\python.exe -m uvicorn backend.projects.main:app --port 8010 --reload
} -ErrorAction SilentlyContinue

Start-Sleep -Seconds 8

# Check if services are actually running
Write-Host "`nVerifying services..." -ForegroundColor Cyan
$running = 0
$failed = 0

foreach ($job in $jobs) {
    if ($job.State -eq "Running") {
        $running++
    } else {
        $failed++
        Write-Host "⚠️  Service failed to start: $($job.Name)" -ForegroundColor Red
        # Get the error output
        $jobOutput = Receive-Job -Job $job -Keep 2>&1
        if ($jobOutput) {
            Write-Host "Error: $jobOutput" -ForegroundColor Red
        }
    }
}

Write-Host "`n✅ Services should be running! ($running/4 started)" -ForegroundColor Green
if ($failed -gt 0) {
    Write-Host "⚠️  $failed service(s) failed to start. Check errors above." -ForegroundColor Yellow
}
Write-Host "`nTest with: .\dev_tools\test_backend_quick.ps1" -ForegroundColor Cyan
Write-Host "`nAPI Docs:" -ForegroundColor Cyan
Write-Host "  http://localhost:8001/api/docs   (Preprocessor)" -ForegroundColor White
Write-Host "  http://localhost:8002/api/docs   (Solver)" -ForegroundColor White  
Write-Host "  http://localhost:8003/api/docs   (Postprocessor)" -ForegroundColor White
Write-Host "  http://localhost:8010/docs         (Projects)" -ForegroundColor White

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
