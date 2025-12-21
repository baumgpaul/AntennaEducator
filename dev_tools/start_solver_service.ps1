# Start Solver Service
Write-Host "Starting Solver Service on port 8002..." -ForegroundColor Green
Set-Location $PSScriptRoot\..
.\.venv\Scripts\python.exe -m uvicorn backend.solver.main:app --port 8002
