# scripts/deploy.ps1 — Build, push, and deploy Antenna Educator to AWS.
#
# Usage:
#   .\scripts\deploy.ps1                              # deploy to staging
#   .\scripts\deploy.ps1 -Environment production      # deploy to production
#   .\scripts\deploy.ps1 -SkipBackend                 # frontend only
#   .\scripts\deploy.ps1 -SkipFrontend                # backend only
#
# Prerequisites:
#   - Docker Desktop running
#   - AWS CLI v2 configured (profile antenna-staging or antenna-production)
#   - Node.js 18+  (for frontend build)

param(
    [string]$Environment  = "staging",
    [string]$Region       = "eu-west-1",
    [switch]$SkipBackend,
    [switch]$SkipFrontend,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$Services   = @("projects", "preprocessor", "solver", "postprocessor")
$AwsProfile = "antenna-$Environment"

Write-Host "`n=== Antenna Educator — AWS Deploy ===" -ForegroundColor Cyan
Write-Host "Environment : $Environment"
Write-Host "AWS Profile : $AwsProfile"
Write-Host "Region      : $Region"
if ($DryRun) { Write-Host "(DRY RUN — no changes will be made)" -ForegroundColor Yellow }
Write-Host ""

# ── Resolve AWS account ──────────────────────────────────────────────────────
$AccountId = (aws sts get-caller-identity `
    --profile $AwsProfile `
    --query Account `
    --output text).Trim()

if ($LASTEXITCODE -ne 0 -or -not $AccountId) {
    Write-Host "ERROR: Failed to get AWS account ID. Is profile '$AwsProfile' configured?" -ForegroundColor Red
    exit 1
}
Write-Host "Account ID  : $AccountId"
Write-Host ""

$EcrBase = "$AccountId.dkr.ecr.$Region.amazonaws.com"

# ── Backend Lambda images ────────────────────────────────────────────────────
if (-not $SkipBackend) {
    Write-Host "--- ECR Login ---" -ForegroundColor Cyan
    if (-not $DryRun) {
        aws ecr get-login-password --region $Region --profile $AwsProfile `
            | docker login --username AWS --password-stdin $EcrBase
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: ECR login failed" -ForegroundColor Red; exit 1
        }
    }
    Write-Host ""

    foreach ($Service in $Services) {
        $RepoName    = "antenna-simulator-$Service-$Environment"
        $ImageUri    = "$EcrBase/${RepoName}:latest"
        $LambdaName  = "antenna-simulator-$Service-$Environment"

        Write-Host "--- Building $Service ---" -ForegroundColor Cyan

        if (-not $DryRun) {
            docker build `
                -f "backend/$Service/Dockerfile.lambda" `
                -t $RepoName `
                --platform linux/amd64 `
                .
            if ($LASTEXITCODE -ne 0) {
                Write-Host "ERROR: docker build failed for $Service" -ForegroundColor Red; exit 1
            }

            docker tag "${RepoName}:latest" $ImageUri
            if ($LASTEXITCODE -ne 0) {
                Write-Host "ERROR: docker tag failed for $Service" -ForegroundColor Red; exit 1
            }

            Write-Host "Pushing to ECR…"
            docker push $ImageUri
            if ($LASTEXITCODE -ne 0) {
                Write-Host "ERROR: docker push failed for $Service" -ForegroundColor Red; exit 1
            }

            Write-Host "Updating Lambda function code…"
            aws lambda update-function-code `
                --function-name $LambdaName `
                --image-uri $ImageUri `
                --region $Region `
                --profile $AwsProfile `
                --no-cli-pager
            if ($LASTEXITCODE -ne 0) {
                Write-Host "ERROR: Lambda update failed for $Service" -ForegroundColor Red; exit 1
            }

            Write-Host "Waiting for Lambda update to settle…"
            aws lambda wait function-updated `
                --function-name $LambdaName `
                --region $Region `
                --profile $AwsProfile
        } else {
            Write-Host "  [DRY RUN] Would build + push $ImageUri and update $LambdaName" -ForegroundColor Yellow
        }

        Write-Host "✓ $Service deployed" -ForegroundColor Green
        Write-Host ""
    }
}

# ── Frontend ─────────────────────────────────────────────────────────────────
if (-not $SkipFrontend) {
    $BucketName = "antenna-simulator-frontend-$Environment-$AccountId"

    Write-Host "--- Building frontend ---" -ForegroundColor Cyan
    if (-not $DryRun) {
        Push-Location frontend
        try {
            npm ci --prefer-offline
            if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }

            npx vite build --mode $Environment
            if ($LASTEXITCODE -ne 0) { throw "vite build failed" }
        } finally {
            Pop-Location
        }
    } else {
        Write-Host "  [DRY RUN] Would run: npm ci && vite build --mode $Environment" -ForegroundColor Yellow
    }

    # Resolve CloudFront distribution ID
    $CfDistId = (aws cloudfront list-distributions `
        --profile $AwsProfile `
        --query "DistributionList.Items[?Comment=='antenna-simulator-$Environment'].Id | [0]" `
        --output text 2>$null).Trim()

    Write-Host "Syncing frontend to s3://$BucketName…"
    if (-not $DryRun) {
        aws s3 sync frontend/dist "s3://$BucketName" `
            --delete `
            --profile $AwsProfile
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: S3 sync failed" -ForegroundColor Red; exit 1
        }

        if ($CfDistId -and $CfDistId -ne "None") {
            Write-Host "Invalidating CloudFront distribution $CfDistId…"
            aws cloudfront create-invalidation `
                --distribution-id $CfDistId `
                --paths "/*" `
                --profile $AwsProfile `
                --no-cli-pager
            Write-Host "✓ CloudFront invalidation created" -ForegroundColor Green
        } else {
            Write-Host "⚠ CloudFront distribution not found — skipping invalidation" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  [DRY RUN] Would sync to s3://$BucketName and invalidate $CfDistId" -ForegroundColor Yellow
    }

    Write-Host "✓ Frontend deployed to s3://$BucketName" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Deploy complete ($Environment) ===" -ForegroundColor Green
