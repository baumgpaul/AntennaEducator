# Start the backend services on the host (without Docker for the services).
#
#   .\dev_tools\start_all_services.ps1                     # all services
#   .\dev_tools\start_all_services.ps1 -Services solver,fem
#
# The usual way is `docker compose up -d --build` (see the /run-local skill). This
# script is for debugging a service with --reload on the host. It still needs
# DynamoDB Local and MinIO:   docker compose up -d dynamodb-local minio
#
# Most services do not read .env themselves: its variables are put into each
# service's process environment here. Host-run services reach DynamoDB Local on
# host port 8888, not on the Docker-internal name used in .env for containers.

param([string[]]$Services = @("preprocessor", "solver", "postprocessor", "projects", "auth", "fem"))

$ports = [ordered]@{
    preprocessor  = 8001
    solver        = 8002
    postprocessor = 8003
    projects      = 8010
    auth          = 8011
    fem           = 8020
}

$root = Resolve-Path "$PSScriptRoot\.."
$python = Join-Path $root ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    Write-Host "ERROR: .venv not found. Run .\scripts\setup-dev.ps1 first." -ForegroundColor Red
    exit 1
}
$unknown = $Services | Where-Object { -not $ports.Contains($_) }
if ($unknown) {
    Write-Host "ERROR: unknown service(s): $($unknown -join ', '). Known: $($ports.Keys -join ', ')" -ForegroundColor Red
    exit 1
}

# .env -> environment of every service process
$envVars = @{}
$envFile = Join-Path $root ".env"
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $envVars[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
        }
    }
} else {
    Write-Host "Note: no .env found, services use their defaults." -ForegroundColor Yellow
}
if ($envVars["DYNAMODB_ENDPOINT_URL"] -match "dynamodb-local") {
    $envVars["DYNAMODB_ENDPOINT_URL"] = "http://localhost:8888"
}

Write-Host "`n=== Starting backend services on the host ===" -ForegroundColor Cyan
Write-Host "Press Ctrl+C to stop all services`n" -ForegroundColor Yellow

$jobs = @()
foreach ($name in $Services) {
    $port = $ports[$name]
    Write-Host ("  {0,-14} http://localhost:{1}/health" -f $name, $port) -ForegroundColor Green
    $jobs += Start-Job -Name $name -ScriptBlock {
        param($root, $python, $name, $port, $vars)
        Set-Location $root
        foreach ($k in $vars.Keys) { Set-Item -Path "env:$k" -Value $vars[$k] }
        & $python -m uvicorn "backend.$name.main:app" --port $port --reload 2>&1
    } -ArgumentList $root, $python, $name, $port, $envVars
}

Write-Host "`nCheck with .\dev_tools\check_services.ps1. Logs follow:`n" -ForegroundColor Cyan
try {
    while ($true) {
        foreach ($job in $jobs) {
            Receive-Job -Job $job | ForEach-Object { Write-Host "[$($job.Name)] $_" }
        }
        $failed = $jobs | Where-Object { $_.State -in "Failed", "Completed" }
        if ($failed) {
            Write-Host "`nStopped unexpectedly: $($failed.Name -join ', ')" -ForegroundColor Red
            break
        }
        Start-Sleep -Milliseconds 500
    }
} finally {
    Write-Host "`nStopping all services..." -ForegroundColor Yellow
    $jobs | Stop-Job -PassThru | Remove-Job
    Write-Host "Services stopped." -ForegroundColor Green
}
