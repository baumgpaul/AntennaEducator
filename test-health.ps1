# Quick Health Check Script
# Tests all Lambda function health endpoints

Write-Host "`n================================" -ForegroundColor Cyan
Write-Host "   HEALTH CHECK - All Services" -ForegroundColor Green
Write-Host "       $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Yellow
Write-Host "================================`n" -ForegroundColor Cyan

$baseUrl = "https://vhciv2vd0e.execute-api.eu-west-1.amazonaws.com"

$services = @(
    @{Name="Projects"; Path="/api/v1/projects/health"},
    @{Name="Solver"; Path="/api/v1/solver/health"},
    @{Name="Preprocessor"; Path="/api/v1/preprocessor/health"},
    @{Name="Postprocessor"; Path="/api/v1/postprocessor/health"}
)

$allHealthy = $true

foreach ($service in $services) {
    $url = $baseUrl + $service.Path
    Write-Host "Testing $($service.Name)..." -ForegroundColor White -NoNewline
    
    try {
        $response = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 10 -ErrorAction Stop
        
        if ($response.status -eq "healthy") {
            Write-Host " ✅ HEALTHY" -ForegroundColor Green
            Write-Host "  Service: $($response.service)" -ForegroundColor DarkGray
            if ($response.timestamp) {
                Write-Host "  Time: $($response.timestamp)" -ForegroundColor DarkGray
            }
            if ($response.database) {
                Write-Host "  Database: $($response.database)" -ForegroundColor DarkGray
            }
        } else {
            Write-Host " ⚠️  WARNING: Unhealthy status" -ForegroundColor Yellow
            $allHealthy = $false
        }
    } catch {
        Write-Host " ❌ FAILED" -ForegroundColor Red
        Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor DarkRed
        $allHealthy = $false
    }
    
    Write-Host ""
}

Write-Host "================================" -ForegroundColor Cyan

if ($allHealthy) {
    Write-Host "✅ ALL SERVICES HEALTHY" -ForegroundColor Green -BackgroundColor DarkGreen
} else {
    Write-Host "⚠️  SOME SERVICES UNHEALTHY" -ForegroundColor Yellow -BackgroundColor DarkYellow
}

Write-Host "================================`n" -ForegroundColor Cyan

# Optional: Test custom domain
Write-Host "Testing Custom Domain..." -ForegroundColor Cyan
try {
    $response = Invoke-WebRequest -Uri "https://antennaeducator.nyakyagyawa.com" -Method Get -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
    if ($response.StatusCode -eq 200) {
        Write-Host "✅ Custom domain accessible" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  Custom domain not yet accessible (DNS propagation)" -ForegroundColor Yellow
    Write-Host "   Try CloudFront URL: https://d1wh11n6foy85c.cloudfront.net" -ForegroundColor Gray
}

Write-Host ""
