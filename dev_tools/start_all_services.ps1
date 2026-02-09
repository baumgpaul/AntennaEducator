# Start All Backend Services for Development
# This script starts preprocessor, solver, and postprocessor services

Write-Host "`n=== Starting PEEC Antenna Simulator Backend Services ===" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop all services`n" -ForegroundColor Yellow

# Navigate to project root
Set-Location $PSScriptRoot\..

# Check if virtual environment exists
if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Host "ERROR: Virtual environment not found!" -ForegroundColor Red
    Write-Host "Please run: python -m venv .venv" -ForegroundColor Yellow
    exit 1
}

# Start services in background jobs
Write-Host "[1/3] Starting Preprocessor Service (port 8001)..." -ForegroundColor Green
$preprocessor = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    & .\.venv\Scripts\python.exe -m uvicorn backend.preprocessor.main:app --port 8001 --reload
}

Start-Sleep -Seconds 2

Write-Host "[2/3] Starting Solver Service (port 8002)..." -ForegroundColor Green
$solver = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    & .\.venv\Scripts\python.exe -m uvicorn backend.solver.main:app --port 8002 --reload
}

Start-Sleep -Seconds 2

Write-Host "[3/3] Starting Postprocessor Service (port 8003)..." -ForegroundColor Green
$postprocessor = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    & .\.venv\Scripts\python.exe -m uvicorn backend.postprocessor.main:app --port 8003 --reload
}

Start-Sleep -Seconds 3

Write-Host "`n✅ All services started!" -ForegroundColor Green
Write-Host "`nService URLs:" -ForegroundColor Cyan
Write-Host "  • Preprocessor: http://localhost:8001/api/docs" -ForegroundColor White
Write-Host "  • Solver:       http://localhost:8002/api/docs" -ForegroundColor White
Write-Host "  • Postprocessor: http://localhost:8003/api/docs" -ForegroundColor White

Write-Host "`nMonitoring service logs (Ctrl+C to stop)...`n" -ForegroundColor Yellow

# Monitor jobs and display output
try {
    while ($true) {
        foreach ($job in @($preprocessor, $solver, $postprocessor)) {
            $output = Receive-Job -Job $job
            if ($output) {
                Write-Host $output
            }
        }
        Start-Sleep -Milliseconds 500

        # Check if any job has failed
        if ($preprocessor.State -eq 'Failed' -or $solver.State -eq 'Failed' -or $postprocessor.State -eq 'Failed') {
            Write-Host "`nERROR: One or more services have failed!" -ForegroundColor Red
            break
        }
    }
} finally {
    Write-Host "`nStopping all services..." -ForegroundColor Yellow
    Stop-Job -Job $preprocessor, $solver, $postprocessor
    Remove-Job -Job $preprocessor, $solver, $postprocessor
    Write-Host "Services stopped." -ForegroundColor Green
}
