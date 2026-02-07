# Start backend services in separate background jobs
# Run this script and keep it open

Write-Host "`n=== Starting Backend Services ===" -ForegroundColor Cyan
Write-Host "This window will show service logs" -ForegroundColor Yellow
Write-Host "Press Ctrl+C to stop all services`n" -ForegroundColor Yellow

$scriptPath = $PSScriptRoot
cd "$scriptPath\.."

# Activate virtual environment
& .\.venv\Scripts\Activate.ps1

Write-Host "[Starting Preprocessor on port 8001]" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; .\.venv\Scripts\python.exe -m uvicorn backend.preprocessor.main:app --port 8001 --reload"

Start-Sleep -Seconds 2

Write-Host "[Starting Solver on port 8002]" -ForegroundColor Green  
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; .\.venv\Scripts\python.exe -m uvicorn backend.solver.main:app --port 8002 --reload"

Start-Sleep -Seconds 2

Write-Host "[Starting Postprocessor on port 8003]" -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; .\.venv\Scripts\python.exe -m uvicorn backend.postprocessor.main:app --port 8003 --reload"

Start-Sleep -Seconds 3

Write-Host "`n✅ Backend services started in separate windows!" -ForegroundColor Green
Write-Host "`nAPI Documentation:" -ForegroundColor Cyan
Write-Host "  • http://localhost:8001/api/docs" -ForegroundColor White
Write-Host "  • http://localhost:8002/api/docs" -ForegroundColor White
Write-Host "  • http://localhost:8003/api/docs" -ForegroundColor White

Write-Host "`nTest health:" -ForegroundColor Cyan
Write-Host "  Invoke-RestMethod http://localhost:8001/health" -ForegroundColor White

Write-Host "`nTo stop: Close the 3 new PowerShell windows`n" -ForegroundColor Yellow

Read-Host "Press Enter to exit this launcher"
