# Emergency Restore — Re-enable ALL Lambda Functions
# Restores reserved_concurrent_executions to normal operating values.
#
# Usage:  .\dev_tools\emergency_restore.ps1
#         .\dev_tools\emergency_restore.ps1 -Profile antenna-staging -Environment staging

param(
    [string]$Profile = "antenna-staging",
    [string]$Environment = "staging"
)

$ErrorActionPreference = "Stop"

# Concurrency limits must match terraform/environments/staging/main.tf
$lambdaConfig = @{
    "projects"      = 10
    "preprocessor"  = 5
    "solver"        = 10
    "postprocessor" = 5
}

Write-Host "EMERGENCY RESTORE — Setting Lambda concurrency to normal values" -ForegroundColor Green
Write-Host "Profile: $Profile | Environment: $Environment" -ForegroundColor Yellow
Write-Host ""

foreach ($entry in $lambdaConfig.GetEnumerator()) {
    $functionName = "antenna-simulator-$($entry.Key)-$Environment"
    $concurrency = $entry.Value
    Write-Host "  Restoring $functionName to $concurrency ..." -NoNewline
    try {
        aws lambda put-function-concurrency `
            --function-name $functionName `
            --reserved-concurrent-executions $concurrency `
            --profile $Profile `
            --output json | Out-Null
        Write-Host " OK" -ForegroundColor Green
    }
    catch {
        Write-Host " FAILED: $_" -ForegroundColor Magenta
    }
}

Write-Host ""
Write-Host "ALL LAMBDAS RESTORED to normal concurrency." -ForegroundColor Green
Write-Host ""
Write-Host "Service concurrency limits:" -ForegroundColor Cyan
foreach ($entry in $lambdaConfig.GetEnumerator() | Sort-Object Key) {
    Write-Host "  $($entry.Key): $($entry.Value)"
}
