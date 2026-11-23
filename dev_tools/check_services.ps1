# Check that the backend services answer on their /health endpoints.
#
#   .\dev_tools\check_services.ps1            # all services
#   .\dev_tools\check_services.ps1 -NoFem     # without the FEM service (preview, host-run)
#
# Ports as in docker-compose.yml; FEM runs on the host (see the /run-local skill).

param([switch]$NoFem)

$services = [ordered]@{
    "Preprocessor"  = 8001
    "Solver"        = 8002
    "Postprocessor" = 8003
    "Projects"      = 8010
    "Auth"          = 8011
}
if (-not $NoFem) { $services["FEM"] = 8020 }

Write-Host "`n=== Checking Backend Services ===" -ForegroundColor Cyan

$down = @()
foreach ($name in $services.Keys) {
    $url = "http://localhost:$($services[$name])/health"
    Write-Host ("{0,-14} {1,-32}" -f $name, $url) -NoNewline
    try {
        $response = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
        $status = ($response.Content | ConvertFrom-Json).status
        Write-Host " OK ($status)" -ForegroundColor Green
    } catch {
        Write-Host " NOT RUNNING" -ForegroundColor Red
        $down += $name
    }
}

Write-Host ""
if ($down.Count -eq 0) {
    Write-Host "All services are running." -ForegroundColor Green
    exit 0
}
Write-Host "Not running: $($down -join ', ')" -ForegroundColor Red
Write-Host "Start them with:  docker compose up -d --build   (or .\dev_tools\start_all_services.ps1 on the host)" -ForegroundColor Yellow
exit 1
