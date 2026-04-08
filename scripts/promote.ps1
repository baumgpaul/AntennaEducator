# scripts/promote.ps1 — Promote Antenna Educator Lambda images from staging to production.
#
# Copies the current ECR image tags from staging → production repositories,
# then updates production Lambda functions with the new image.  Use this after
# staging has been validated and a production deployment is desired.
#
# Usage:
#   .\scripts\promote.ps1                        # staging → production
#   .\scripts\promote.ps1 -SourceTag v1.2.3      # promote a specific tag
#   .\scripts\promote.ps1 -DryRun                # preview without changes
#
# Prerequisites:
#   - AWS CLI v2 with profiles antenna-staging and antenna-production configured
#   - ECR repositories for antenna-simulator-{service}-production must exist
#     (run `terraform apply` in terraform/environments/production/ first)

param(
    [string]$SourceEnvironment = "staging",
    [string]$TargetEnvironment = "production",
    [string]$Region            = "eu-west-1",
    [string]$SourceTag         = "latest",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$Services          = @("projects", "preprocessor", "solver", "postprocessor")
$SourceProfile     = "antenna-$SourceEnvironment"
$TargetProfile     = "antenna-$TargetEnvironment"

Write-Host "`n=== Antenna Educator — Promote Images ===" -ForegroundColor Cyan
Write-Host "From        : $SourceEnvironment ($SourceProfile)"
Write-Host "To          : $TargetEnvironment ($TargetProfile)"
Write-Host "Source tag  : $SourceTag"
Write-Host "Region      : $Region"
if ($DryRun) { Write-Host "(DRY RUN — no changes will be made)" -ForegroundColor Yellow }
Write-Host ""

# ── Resolve account IDs ──────────────────────────────────────────────────────
$SourceAccountId = (aws sts get-caller-identity `
    --profile $SourceProfile --query Account --output text).Trim()
$TargetAccountId = (aws sts get-caller-identity `
    --profile $TargetProfile --query Account --output text).Trim()

if (-not $SourceAccountId) {
    Write-Host "ERROR: Could not get source account ID (profile: $SourceProfile)" -ForegroundColor Red; exit 1
}
if (-not $TargetAccountId) {
    Write-Host "ERROR: Could not get target account ID (profile: $TargetProfile)" -ForegroundColor Red; exit 1
}

Write-Host "Source account : $SourceAccountId"
Write-Host "Target account : $TargetAccountId"
Write-Host ""

$SourceEcr = "$SourceAccountId.dkr.ecr.$Region.amazonaws.com"
$TargetEcr = "$TargetAccountId.dkr.ecr.$Region.amazonaws.com"

# ── ECR logins ────────────────────────────────────────────────────────────────
if (-not $DryRun) {
    Write-Host "Logging in to source ECR ($SourceEcr)…"
    aws ecr get-login-password --region $Region --profile $SourceProfile `
        | docker login --username AWS --password-stdin $SourceEcr
    if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Source ECR login failed" -ForegroundColor Red; exit 1 }

    if ($TargetAccountId -ne $SourceAccountId) {
        Write-Host "Logging in to target ECR ($TargetEcr)…"
        aws ecr get-login-password --region $Region --profile $TargetProfile `
            | docker login --username AWS --password-stdin $TargetEcr
        if ($LASTEXITCODE -ne 0) { Write-Host "ERROR: Target ECR login failed" -ForegroundColor Red; exit 1 }
    }
    Write-Host ""
}

# ── Per-service promotion ─────────────────────────────────────────────────────
foreach ($Service in $Services) {
    $SourceRepo      = "antenna-simulator-$Service-$SourceEnvironment"
    $TargetRepo      = "antenna-simulator-$Service-$TargetEnvironment"
    $SourceImageUri  = "$SourceEcr/${SourceRepo}:$SourceTag"
    $TargetImageUri  = "$TargetEcr/${TargetRepo}:latest"
    $TargetLambda    = "antenna-simulator-$Service-$TargetEnvironment"

    Write-Host "--- Promoting $Service ---" -ForegroundColor Cyan
    Write-Host "  $SourceImageUri  →  $TargetImageUri"

    if (-not $DryRun) {
        Write-Host "  Pulling source image…"
        docker pull $SourceImageUri
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ERROR: pull failed for $Service" -ForegroundColor Red; exit 1
        }

        Write-Host "  Retagging for target…"
        docker tag $SourceImageUri $TargetImageUri
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ERROR: retag failed for $Service" -ForegroundColor Red; exit 1
        }

        Write-Host "  Pushing to target ECR…"
        docker push $TargetImageUri
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ERROR: push failed for $Service" -ForegroundColor Red; exit 1
        }

        Write-Host "  Updating production Lambda function code…"
        aws lambda update-function-code `
            --function-name $TargetLambda `
            --image-uri $TargetImageUri `
            --region $Region `
            --profile $TargetProfile `
            --no-cli-pager
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  ERROR: Lambda update failed for $Service" -ForegroundColor Red; exit 1
        }

        Write-Host "  Waiting for Lambda update to settle…"
        aws lambda wait function-updated `
            --function-name $TargetLambda `
            --region $Region `
            --profile $TargetProfile
    } else {
        Write-Host "  [DRY RUN] Would pull, retag, push, and update $TargetLambda" -ForegroundColor Yellow
    }

    Write-Host "  ✓ $Service promoted" -ForegroundColor Green
    Write-Host ""
}

Write-Host "=== Promotion complete ($SourceEnvironment → $TargetEnvironment) ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Verify production services at the production URL"
Write-Host "  2. Run smoke tests: python dev_tools/test_aws_pipeline.py --environment production"
