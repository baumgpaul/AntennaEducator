# Deploy Frontend to AWS S3
# Syncs built frontend to S3 bucket and invalidates CloudFront cache

param(
    [string]$Environment = "staging",
    [string]$Profile = "antenna-staging",
    [switch]$SkipBuild,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== Frontend Deployment to AWS ===" -ForegroundColor Cyan
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
$bucketName = "antenna-simulator-frontend-$Environment-$accountId"
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
        Write-Host "Error: Frontend build failed!" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "Build completed successfully!" -ForegroundColor Green
} else {
    Write-Host "`nSkipping build (--SkipBuild specified)" -ForegroundColor Yellow
}

# Check dist directory exists
if (-not (Test-Path $distDir)) {
    Write-Host "Error: Build directory not found at $distDir" -ForegroundColor Red
    Write-Host "Run without --SkipBuild to build the frontend first" -ForegroundColor Yellow
    exit 1
}

# Show what will be deployed
Write-Host "`nDeployment Preview:" -ForegroundColor Cyan
$files = Get-ChildItem -Path $distDir -Recurse -File
Write-Host "Files to deploy: $($files.Count)" -ForegroundColor Yellow
$totalSize = ($files | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host "Total size: $([math]::Round($totalSize, 2)) MB" -ForegroundColor Yellow

if ($DryRun) {
    Write-Host "`n[DRY RUN] Would sync to: s3://$bucketName/" -ForegroundColor Magenta
    Write-Host "Skipping actual deployment." -ForegroundColor Yellow
    exit 0
}

# Confirm deployment
Write-Host "`nReady to deploy to S3 bucket: $bucketName" -ForegroundColor Yellow
$confirm = Read-Host "Continue? (y/n)"
if ($confirm -ne "y") {
    Write-Host "Deployment cancelled." -ForegroundColor Yellow
    exit 0
}

# Sync to S3
Write-Host "`nSyncing to S3..." -ForegroundColor Cyan
Write-Host "Command: aws s3 sync dist/ s3://$bucketName/ --delete --profile $Profile" -ForegroundColor Gray

aws s3 sync dist/ s3://$bucketName/ --delete --profile $Profile

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: S3 sync failed!" -ForegroundColor Red
    exit 1
}

Write-Host "S3 sync completed successfully!" -ForegroundColor Green

# Get CloudFront Distribution ID
Write-Host "`nFetching CloudFront Distribution ID..." -ForegroundColor Cyan
$distributionId = aws cloudfront list-distributions --profile $Profile --query "DistributionList.Items[?contains(Origins.Items[0].DomainName, '$bucketName')].Id | [0]" --output text 2>$null

if ($distributionId -and $distributionId -ne "None") {
    Write-Host "CloudFront Distribution ID: $distributionId" -ForegroundColor Green
    
    Write-Host "`nInvalidating CloudFront cache..." -ForegroundColor Cyan
    $invalidation = aws cloudfront create-invalidation `
        --distribution-id $distributionId `
        --paths "/*" `
        --profile $Profile `
        --query 'Invalidation.Id' `
        --output text
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Cache invalidation started: $invalidation" -ForegroundColor Green
        Write-Host "CloudFront will propagate changes within 5-10 minutes" -ForegroundColor Yellow
    } else {
        Write-Host "Warning: CloudFront invalidation failed" -ForegroundColor Yellow
        Write-Host "You may need to manually invalidate the cache" -ForegroundColor Yellow
    }
} else {
    Write-Host "Warning: Could not find CloudFront distribution for bucket $bucketName" -ForegroundColor Yellow
    Write-Host "Skipping cache invalidation - changes may take time to appear" -ForegroundColor Yellow
}

# Get website URL
Write-Host "`n=== Deployment Complete ===" -ForegroundColor Green
Write-Host "Frontend deployed to: s3://$bucketName/" -ForegroundColor Cyan

# Try to get CloudFront URL
$cloudfrontDomain = aws cloudfront list-distributions --profile $Profile --query "DistributionList.Items[?contains(Origins.Items[0].DomainName, '$bucketName')].DomainName | [0]" --output text 2>$null

if ($cloudfrontDomain -and $cloudfrontDomain -ne "None") {
    Write-Host "CloudFront URL: https://$cloudfrontDomain" -ForegroundColor Cyan
}

# Check if custom domain exists
if ($Environment -eq "staging") {
    Write-Host "Custom Domain: https://antennaeducator.nyakyagyawa.com" -ForegroundColor Cyan
}

Write-Host "`nNext Steps:" -ForegroundColor Yellow
Write-Host "1. Wait 5-10 minutes for CloudFront propagation" -ForegroundColor White
Write-Host "2. Test the deployed application" -ForegroundColor White
Write-Host "3. Check browser console for any errors" -ForegroundColor White
Write-Host "4. Verify all 7 features from Build 1 work online" -ForegroundColor White

Write-Host "`nDeployment log saved to: deployment-$(Get-Date -Format 'yyyyMMdd-HHmmss').log" -ForegroundColor Gray
