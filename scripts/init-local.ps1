# init-local.ps1 — Bootstrap DynamoDB Local and MinIO for Docker development.
#
# Run once after starting services with:
#   docker compose up -d
#   .\scripts\init-local.ps1
#
# Requires:
#   - Python 3.11+ with venv activated (or installed globally in PATH)
#   - .env file present (copied from .env.example)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile  = Join-Path $repoRoot ".env"

if (-not (Test-Path $envFile)) {
    Write-Host "ERROR: .env file not found at $envFile" -ForegroundColor Red
    Write-Host "       Copy .env.example -> .env and fill in ADMIN_EMAIL / ADMIN_PASSWORD." -ForegroundColor Yellow
    exit 1
}

# Load .env into current process environment
Get-Content $envFile | Where-Object { $_ -match "^\s*[^#\s]" } | ForEach-Object {
    $parts = $_ -split "=", 2
    if ($parts.Length -eq 2) {
        $key   = $parts[0].Trim()
        $value = $parts[1].Trim().Trim('"').Trim("'")
        [System.Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
}

$endpoint  = [System.Environment]::GetEnvironmentVariable("DYNAMODB_ENDPOINT_URL") ?? "http://localhost:8000"
$tableName = [System.Environment]::GetEnvironmentVariable("DYNAMODB_TABLE_NAME")   ?? "antenna-simulator-local"

Write-Host "`n=== Antenna Educator — Local Bootstrap ===" -ForegroundColor Cyan
Write-Host "DynamoDB endpoint : $endpoint"
Write-Host "Table             : $tableName"
Write-Host ""

Set-Location $repoRoot
python scripts/init_local_db.py

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nBootstrap FAILED. Check the output above." -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Bootstrap complete ===" -ForegroundColor Green
Write-Host "You can now open http://localhost:5173 and log in with:"
Write-Host "  Email   : $([System.Environment]::GetEnvironmentVariable('ADMIN_EMAIL'))"
Write-Host "  Password: (from your .env file)"
