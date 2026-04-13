# Start FEM backend services for local development (no Docker required).
#
# Usage:
#   .\dev_tools\start_fem_dev.ps1
#
# Services started (all with DISABLE_AUTH=true):
#   • FEM Preprocessor  http://localhost:8004
#   • FEM Solver        http://localhost:8005
#   • FEM Postprocessor http://localhost:8006
#
# The frontend dev server is NOT started here — run separately:
#   cd frontend && npm run dev
#
# DISABLE_AUTH bypasses JWT validation so no DynamoDB / projects service is needed.
# The frontend .env.development has VITE_DISABLE_AUTH=true to match.
# NEVER use DISABLE_AUTH outside of local development.

$rootDir = Split-Path -Parent $PSScriptRoot
Set-Location $rootDir

Write-Host ""
Write-Host "=== FEM Dev Services ===" -ForegroundColor Cyan
Write-Host "Starting FEM Preprocessor, Solver, and Postprocessor with DISABLE_AUTH=true" -ForegroundColor Yellow
Write-Host "(Auth bypass active — no DynamoDB or projects service needed)" -ForegroundColor DarkYellow
Write-Host ""

# --- Stop any Docker containers that may hold the FEM ports ---
$femContainers = @(
    "fem-assembly-service",
    "fem-solver-service",
    "fem-postprocessor-service",
    "antennaeducator-fem-preprocessor-1",
    "antennaeducator-fem-solver-1",
    "antennaeducator-fem-postprocessor-1"
)
$running = docker ps --format "{{.Names}}" 2>$null
foreach ($c in $femContainers) {
    if ($running -contains $c) {
        Write-Host "Stopping Docker container: $c" -ForegroundColor DarkYellow
        docker stop $c | Out-Null
    }
}

# --- Kill any existing uvicorn processes on those ports (stale reloaders) ---
foreach ($port in @(8004, 8005, 8006)) {
    $pids = netstat -ano 2>$null |
        Select-String "TCP\s+127\.0\.0\.1:$port\s" |
        ForEach-Object { ($_ -split '\s+')[-1] } |
        Where-Object { $_ -match '^\d+$' } |
        Select-Object -Unique
    foreach ($p in $pids) {
        $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
        if ($proc -and $proc.Name -match 'python') {
            Write-Host "Killing stale Python on port $port (PID $p)" -ForegroundColor DarkYellow
            Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        }
    }
}

Start-Sleep -Seconds 1

$env:DISABLE_AUTH = "true"

Write-Host "[1/3] FEM Preprocessor  -> http://localhost:8004" -ForegroundColor Green
Start-Process powershell -ArgumentList `
  "-NoExit", `
  "-Command", `
  "Set-Location '$rootDir'; `$env:DISABLE_AUTH='true'; .venv\Scripts\python.exe -m uvicorn backend.fem_preprocessor.main:app --port 8004 --reload" `
  -WindowStyle Normal

Start-Sleep -Seconds 2

Write-Host "[2/3] FEM Solver        -> http://localhost:8005" -ForegroundColor Green
Start-Process powershell -ArgumentList `
  "-NoExit", `
  "-Command", `
  "Set-Location '$rootDir'; `$env:DISABLE_AUTH='true'; .venv\Scripts\python.exe -m uvicorn backend.fem_solver.main:app --port 8005 --reload" `
  -WindowStyle Normal

Start-Sleep -Seconds 2

Write-Host "[3/3] FEM Postprocessor -> http://localhost:8006" -ForegroundColor Green
Start-Process powershell -ArgumentList `
  "-NoExit", `
  "-Command", `
  "Set-Location '$rootDir'; `$env:DISABLE_AUTH='true'; .venv\Scripts\python.exe -m uvicorn backend.fem_postprocessor.main:app --port 8006 --reload" `
  -WindowStyle Normal

Write-Host ""
Write-Host "Services are starting in separate windows." -ForegroundColor Cyan
Write-Host "Run 'curl http://localhost:800X/health' to verify each is up." -ForegroundColor Cyan
Write-Host ""
Write-Host "Health endpoints:" -ForegroundColor Cyan
Write-Host "  http://localhost:8004/health" -ForegroundColor White
Write-Host "  http://localhost:8005/health" -ForegroundColor White
Write-Host "  http://localhost:8006/health" -ForegroundColor White
Write-Host ""
Write-Host "Frontend (run separately):" -ForegroundColor Cyan
Write-Host "  cd frontend && npm run dev   ->  http://localhost:3000" -ForegroundColor White
Write-Host "  Navigate to http://localhost:3000/fem to test the FEM canvas." -ForegroundColor White
Write-Host ""
Write-Host "NOTE: The first mesh request will be slow (~10s) — gmsh DLL loads on demand." -ForegroundColor DarkYellow
Write-Host ""
