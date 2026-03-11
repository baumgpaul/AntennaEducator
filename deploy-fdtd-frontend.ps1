# Deploy FDTD Frontend to AWS S3
# Syncs built frontend to the FDTD S3 bucket and invalidates CloudFront cache

param(
    [string]$Environment = "fdtd-staging",
    [string]$Profile = "antenna-staging",
    [switch]$SkipBuild,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== FDTD Frontend Deployment to AWS ===" -ForegroundColor Cyan
Write-Host "Environment: $Environment" -ForegroundColor Yellow
Write-Host "AWS Profile: $Profile" -ForegroundColor Yellow

# Get AWS Account ID
Write-Host "`nFetching AWS Account ID..." -ForegroundColor Cyan
try {
    $accountId = aws sts get-caller-identity --profile $Profile --query Account --output text
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to get AWS Account ID. Is AWS CLI configured with profile '$Profile'?"
    }
    Write-Host "Account ID: $accountId" -ForegroundColor Green
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}

# Construct bucket name (must match Terraform naming)
$bucketName = "antenna-simulator-fdtd-frontend-$Environment-$accountId"
Write-Host "Target S3 Bucket: $bucketName" -ForegroundColor Yellow

# Navigate to frontend directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Join-Path $scriptDir "frontend"
$distDir = Join-Path $frontendDir "dist"

if (-not (Test-Path $frontendDir)) {
    Write-Host "Error: Frontend directory not found at $frontendDir" -ForegroundColor Red
    exit 1
}

Set-Location $frontendDir

# Build frontend if not skipped
if (-not $SkipBuild) {
    Write-Host "`nBuilding frontend..." -ForegroundColor Cyan
    Write-Host "Running: npx vite build" -ForegroundColor Gray

    npx vite build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Frontend build failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "Frontend build successful!" -ForegroundColor Green
}

if (-not (Test-Path $distDir)) {
    Write-Host "Error: Build output not found at $distDir. Run without -SkipBuild." -ForegroundColor Red
    exit 1
}

# Sync to S3
Write-Host "`nSyncing to S3..." -ForegroundColor Cyan
if ($DryRun) {
    Write-Host "(DRY RUN)" -ForegroundColor Yellow
    aws s3 sync $distDir "s3://$bucketName/" --delete --dryrun --profile $Profile
} else {
    aws s3 sync $distDir "s3://$bucketName/" --delete --profile $Profile
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "S3 sync failed!" -ForegroundColor Red
    exit 1
}

# Get CloudFront distribution ID from Terraform output
Write-Host "`nGetting CloudFront distribution ID..." -ForegroundColor Cyan
Set-Location (Join-Path $scriptDir "terraform" "environments" "fdtd-staging")
$cfDistId = terraform output -raw cloudfront_distribution_id 2>$null
Set-Location $scriptDir

if ($cfDistId) {
    Write-Host "Invalidating CloudFront cache (Distribution: $cfDistId)..." -ForegroundColor Cyan
    if (-not $DryRun) {
        aws cloudfront create-invalidation `
            --distribution-id $cfDistId `
            --paths "/*" `
            --profile $Profile
    }
    Write-Host "CloudFront invalidation started." -ForegroundColor Green
} else {
    Write-Host "Warning: Could not determine CloudFront distribution ID. Skipping invalidation." -ForegroundColor Yellow
}

Write-Host "`n=== FDTD Frontend Deployment Complete ===" -ForegroundColor Green
Write-Host "URL: https://fdtd-stage.nyakyagyawa.com" -ForegroundColor Cyan
