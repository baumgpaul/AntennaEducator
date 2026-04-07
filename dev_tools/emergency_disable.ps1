# Emergency Kill Switch — Disable ALL Lambda Functions
# Sets reserved_concurrent_executions = 0 for all Lambdas,
# instantly blocking all traffic (requests get 429 Throttled).
#
# Usage:  .\dev_tools\emergency_disable.ps1
#         .\dev_tools\emergency_disable.ps1 -Profile antenna-staging -Environment staging

param(
    [string]$Profile = "antenna-staging",
    [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

$lambdas = @("projects", "preprocessor", "solver", "postprocessor")

Write-Host "EMERGENCY DISABLE — Setting all Lambda concurrency to 0" -ForegroundColor Red
Write-Host "Profile: $Profile | Environment: $Environment" -ForegroundColor Yellow
Write-Host ""

foreach ($service in $lambdas) {
    $functionName = "antenna-simulator-$service-$Environment"
    Write-Host "  Disabling $functionName ..." -NoNewline
    try {
        aws lambda put-function-concurrency `
            --function-name $functionName `
            --reserved-concurrent-executions 0 `
            --profile $Profile `
            --output json | Out-Null
        Write-Host " DISABLED" -ForegroundColor Red
    }
    catch {
        Write-Host " FAILED: $_" -ForegroundColor Magenta
    }
}

Write-Host ""
Write-Host "ALL LAMBDAS DISABLED. No requests will be processed." -ForegroundColor Red
Write-Host "Run .\dev_tools\emergency_restore.ps1 to re-enable." -ForegroundColor Yellow
