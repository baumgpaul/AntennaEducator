# =============================================================================
# deploy_cefc_environment.ps1
# Full end-to-end deployment of the CEFC antenna-simulator instance.
#
# What this script does (in order):
#   1. Terraform init + apply  →  provision all AWS infrastructure
#   2. Read Terraform outputs  →  collect Lambda URLs, Cognito IDs, etc.
#   3. Write frontend/.env.production.cefc  →  bake URLs into SPA
#   4. Build + sync frontend to S3  →  invalidate CloudFront
#   5. Build + push Lambda Docker images to ECR
#   6. Seed Cognito + DynamoDB users (Python script)
#   7. Print final deployment summary
#
# Prerequisites:
#   - AWS CLI configured with profile "antenna-staging"
#   - Terraform >= 1.0 installed and on PATH
#   - Docker running (for Lambda image builds)
#   - Node.js / npm installed (for frontend build)
#   - Python venv activated (or packages installed system-wide)
#   - dev_tools/cefc_users.json (copy of cefc_users.example.json, gitignored)
#
# Usage:
#   .\dev_tools\deploy_cefc_environment.ps1
#   .\dev_tools\deploy_cefc_environment.ps1 -SkipTerraform   # infra already up
#   .\dev_tools\deploy_cefc_environment.ps1 -SkipLambda      # skip Docker builds
#   .\dev_tools\deploy_cefc_environment.ps1 -SkipUsers       # skip user seeding
# =============================================================================

param(
    [string]$Profile         = "antenna-staging",
    [string]$Region          = "eu-west-1",
    [string]$Environment     = "cefc",
    [switch]$SkipTerraform,
    [switch]$SkipLambda,
    [switch]$SkipFrontend,
    [switch]$SkipUsers
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot   # one level up from dev_tools/
$TerraformDir = Join-Path $RepoRoot "terraform\environments\$Environment"
$FrontendDir  = Join-Path $RepoRoot "frontend"

function Write-Step($msg) {
    Write-Host "`n╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
}

# ── Account ID ────────────────────────────────────────────────────────────────
Write-Host "Fetching AWS account ID …" -ForegroundColor Yellow
$AccountId = (aws sts get-caller-identity --profile $Profile --query Account --output text).Trim()
if ($LASTEXITCODE -ne 0) { Write-Host "Failed to get account ID" -ForegroundColor Red; exit 1 }
Write-Host "Account: $AccountId" -ForegroundColor Green

# =============================================================================
# STEP 1 — Terraform
# =============================================================================
if (-not $SkipTerraform) {
    Write-Step "STEP 1 — Terraform: provision CEFC infrastructure"

    Push-Location $TerraformDir
    try {
        Write-Host "`nInitialising Terraform ..." -ForegroundColor Yellow
        terraform init "-backend-config=backend.hcl"
        if ($LASTEXITCODE -ne 0) { throw "terraform init failed" }

        # Phase 1: create ECR repositories first so images can be pushed before Lambda creation
        Write-Host "`nPhase 1 - creating ECR repositories ..." -ForegroundColor Yellow
        terraform apply -auto-approve "-target=module.ecr_projects" "-target=module.ecr_preprocessor" "-target=module.ecr_solver" "-target=module.ecr_postprocessor"
        if ($LASTEXITCODE -ne 0) { throw "terraform apply (ECR phase) failed" }
    } finally {
        Pop-Location
    }

    # Push Docker images now that ECR repos exist (Lambda needs them to be present)
    Write-Host "`nPushing Docker images to ECR ..." -ForegroundColor Yellow
    & "$PSScriptRoot\rebuild_lambda_images_cefc.ps1" `
        -Profile $Profile `
        -Region $Region `
        -AccountId $AccountId `
        -Environment $Environment
    if ($LASTEXITCODE -ne 0) { throw "Lambda image build/push failed" }

    Push-Location $TerraformDir
    try {
        # Phase 2: full apply - Lambda functions can now find their images in ECR
        Write-Host "`nPhase 2 - full infrastructure apply ..." -ForegroundColor Yellow
        terraform plan -out cefc.tfplan
        if ($LASTEXITCODE -ne 0) { throw "terraform plan failed" }

        Write-Host "`nApplying ..." -ForegroundColor Yellow
        terraform apply cefc.tfplan
        if ($LASTEXITCODE -ne 0) { throw "terraform apply failed" }

        Write-Host "Infrastructure provisioned." -ForegroundColor Green
    } finally {
        Pop-Location
    }
} else {
    Write-Host "`n[SkipTerraform] Skipping infrastructure provisioning." -ForegroundColor Yellow
}

# =============================================================================
# STEP 2 — Read Terraform outputs
# =============================================================================
Write-Step "STEP 2 — Reading Terraform outputs"

Push-Location $TerraformDir
try {
    $ProjectsUrl      = (terraform output -raw lambda_projects_url).Trim()
    $PreprocessorUrl  = (terraform output -raw lambda_preprocessor_url).Trim()
    $SolverUrl        = (terraform output -raw lambda_solver_url).Trim()
    $PostprocessorUrl = (terraform output -raw lambda_postprocessor_url).Trim()
    $UserPoolId       = (terraform output -raw cognito_user_pool_id).Trim()
    $ClientId         = (terraform output -raw cognito_client_id).Trim()
    $CognitoDomain    = (terraform output -raw cognito_domain_url).Trim()
    $FrontendBucket   = (terraform output -raw s3_frontend_bucket_name).Trim()
    $CloudFrontId     = (terraform output -raw cloudfront_distribution_id).Trim()
    $DomainUrl        = (terraform output -raw custom_domain_url).Trim()
} finally {
    Pop-Location
}

# Strip trailing slash from domain URL for Cognito
$CognitoDomainHost = $CognitoDomain.TrimEnd("/")

Write-Host "Projects URL     : $ProjectsUrl"
Write-Host "Preprocessor URL : $PreprocessorUrl"
Write-Host "Solver URL       : $SolverUrl"
Write-Host "Postprocessor URL: $PostprocessorUrl"
Write-Host "Cognito Pool ID  : $UserPoolId"
Write-Host "Cognito Client ID: $ClientId"
Write-Host "Frontend bucket  : $FrontendBucket"
Write-Host "CloudFront ID    : $CloudFrontId"
Write-Host "Domain           : $DomainUrl"

# =============================================================================
# STEP 3 — Write frontend environment file
# =============================================================================
Write-Step "STEP 3 — Writing frontend/.env.production (CEFC values)"

$EnvContent = @"
# CEFC production environment — generated by deploy_cefc_environment.ps1
# Do NOT edit manually; re-run the deploy script to regenerate.

VITE_API_BASE_URL=$ProjectsUrl
VITE_PROJECTS_URL=$ProjectsUrl
VITE_AUTH_URL=$ProjectsUrl
VITE_PREPROCESSOR_URL=$PreprocessorUrl
VITE_SOLVER_URL=$SolverUrl
VITE_POSTPROCESSOR_URL=$PostprocessorUrl

VITE_APP_NAME="Antenna Educator (CEFC 2026)"
VITE_APP_VERSION="0.1.0"

VITE_ENABLE_AUTH=true
VITE_ENABLE_3D_DEBUG=false

VITE_AUTH_PROVIDER=cognito

VITE_COGNITO_USER_POOL_ID=$UserPoolId
VITE_COGNITO_CLIENT_ID=$ClientId
VITE_COGNITO_DOMAIN=$CognitoDomainHost
VITE_COGNITO_REGION=$Region
"@

# Write to a cefc-specific file; we'll copy it to .env.production before build
$CefcEnvFile = Join-Path $FrontendDir ".env.cefc.generated"
Set-Content -Path $CefcEnvFile -Value $EnvContent -Encoding UTF8
Write-Host "Written: $CefcEnvFile" -ForegroundColor Green

# =============================================================================
# STEP 4 — Build and deploy frontend
# =============================================================================
if (-not $SkipFrontend) {
    Write-Step "STEP 4 — Build and deploy frontend"

    # Back up existing .env.production, replace with CEFC values for this build
    $EnvProductionPath = Join-Path $FrontendDir ".env.production"
    $EnvProductionBackup = Join-Path $FrontendDir ".env.production.staging.bak"

    Copy-Item $EnvProductionPath $EnvProductionBackup -Force
    Copy-Item $CefcEnvFile $EnvProductionPath -Force

    try {
        Push-Location $FrontendDir
        Write-Host "`nBuilding frontend …" -ForegroundColor Yellow
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }

        Write-Host "`nSyncing to S3 ($FrontendBucket) …" -ForegroundColor Yellow
        aws s3 sync dist/ "s3://$FrontendBucket/" --delete --profile $Profile
        if ($LASTEXITCODE -ne 0) { throw "S3 sync failed" }

        Write-Host "`nInvalidating CloudFront cache ($CloudFrontId) …" -ForegroundColor Yellow
        aws cloudfront create-invalidation `
            --distribution-id $CloudFrontId `
            --paths "/*" `
            --profile $Profile `
            --no-cli-pager
        if ($LASTEXITCODE -ne 0) { throw "CloudFront invalidation failed" }
    } finally {
        Pop-Location
        # Restore original .env.production
        Copy-Item $EnvProductionBackup $EnvProductionPath -Force
        Remove-Item $EnvProductionBackup -Force
        Write-Host "Restored original .env.production (staging)" -ForegroundColor Gray
    }

    Write-Host "Frontend deployed to $DomainUrl" -ForegroundColor Green
} else {
    Write-Host "`n[SkipFrontend] Skipping frontend build and deploy." -ForegroundColor Yellow
}

# =============================================================================
# STEP 5 — Build and push Lambda images
# =============================================================================
if (-not $SkipLambda -and $SkipTerraform) {
    # Only needed when skipping Terraform (images were already pushed during Step 1 otherwise)
    Write-Step "STEP 5 — Build and push Lambda container images"

    Push-Location $RepoRoot
    try {
        & "$PSScriptRoot\rebuild_lambda_images_cefc.ps1" `
            -Profile $Profile `
            -Region $Region `
            -AccountId $AccountId `
            -Environment $Environment
        if ($LASTEXITCODE -ne 0) { throw "Lambda rebuild failed" }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "`n[Step 5] Lambda images already pushed during Terraform phase (or -SkipLambda set)." -ForegroundColor Yellow
}

# =============================================================================
# STEP 6 — Seed users
# =============================================================================
if (-not $SkipUsers) {
    Write-Step "STEP 6 — Seeding Cognito + DynamoDB users"

    Push-Location $RepoRoot
    try {
        python dev_tools/seed_cefc_users.py
        if ($LASTEXITCODE -ne 0) { throw "User seeding failed" }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "`n[SkipUsers] Skipping user seeding." -ForegroundColor Yellow
}

# =============================================================================
# STEP 7 — Summary
# =============================================================================
Write-Step "DEPLOYMENT COMPLETE"

Write-Host ""
Write-Host "  URL      : $DomainUrl" -ForegroundColor Green
Write-Host "  Cognito  : $UserPoolId" -ForegroundColor Green
Write-Host "  DynamoDB : antenna-simulator-$Environment" -ForegroundColor Green
Write-Host ""
if (-not $SkipUsers) {
    Write-Host "  Users are defined in dev_tools\cefc_users.json (gitignored)." -ForegroundColor Cyan
    Write-Host "  New passwords were written to dev_tools\cefc_credentials.csv (gitignored)." -ForegroundColor Yellow
    Write-Host ""
}
Write-Host "Deployment finished." -ForegroundColor Green
