#Requires -Version 7
# setup-dev.ps1 — make a fresh clone ready for development (safe to re-run).
#
#   git clone https://github.com/baumgpaul/AntennaEducator.git
#   cd AntennaEducator
#   .\scripts\setup-dev.ps1
#
# Does: Python venv + all packages (backend, mesher, femsolver, dev tools),
# pre-commit hooks, frontend npm ci, local env files from the templates,
# private notes repo into .notes/, and checks GitHub/AWS/Terraform access.
# Never writes real credentials: .env gets a freshly generated local JWT secret,
# everything account-specific is created by hand (see .notes/LOCAL_FILES.md).

param(
    [switch]$SkipFrontend,   # skip npm ci (slow)
    [switch]$SkipNotes       # don't clone/pull the private notes repo
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  ok  $msg" -ForegroundColor Green }
function Todo($msg) { Write-Host "  !!  $msg" -ForegroundColor Yellow; $script:todos += $msg }
$todos = @()

# ── Tools ────────────────────────────────────────────────────────────────
Step "Tools"
foreach ($t in "git", "python", "node", "npm", "gh", "docker", "aws", "terraform") {
    if (Get-Command $t -ErrorAction SilentlyContinue) { Ok $t } else { Todo "install $t" }
}
$pyVersion = [version]((python -c "import sys; print('.'.join(map(str, sys.version_info[:2])))") 2>$null)
if ($pyVersion -lt [version]"3.11") { throw "Python 3.11+ required (found $pyVersion)" }
Ok "Python $pyVersion (CI and Lambda use 3.11)"
$nodeMajor = [int]((node --version) -replace '^v(\d+).*', '$1')
if ($nodeMajor -lt 22) { Todo "Node 22+ recommended (found $nodeMajor; CI uses 22)" } else { Ok "Node $nodeMajor" }

# ── Python ───────────────────────────────────────────────────────────────
Step "Python venv (.venv)"
if (-not (Test-Path ".venv\Scripts\python.exe")) { python -m venv .venv }
$py = Join-Path $repoRoot ".venv\Scripts\python.exe"
& $py -m pip install --upgrade pip --quiet
# Same set as the CI "fem" job, plus pre-commit
& $py -m pip install -e ".[dev,aws]" -e "mesher[dev]" -e "femsolver[dev]" pre-commit --quiet
if ($LASTEXITCODE -ne 0) { throw "pip install failed" }
Ok "backend + mesher + femsolver installed"
& $py -m pre_commit install | Out-Null
Ok "pre-commit hooks installed (commit with the venv activated)"

# ── Frontend ─────────────────────────────────────────────────────────────
Step "Frontend (npm ci)"
if ($SkipFrontend) { Write-Host "  skipped" } else {
    npm --prefix frontend ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
    Ok "frontend/node_modules"
}

# ── Local env files (gitignored) ─────────────────────────────────────────
Step "Local env files"
if (Test-Path ".env") { Ok ".env exists (left unchanged)" } else {
    $secret = [Convert]::ToBase64String([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    (Get-Content ".env.example") -replace '^JWT_SECRET_KEY=.*', "JWT_SECRET_KEY=$secret" |
        Set-Content ".env"
    Ok ".env created from .env.example with a new local JWT secret"
    Todo "edit .env: set ADMIN_EMAIL / ADMIN_PASSWORD for your local admin"
}
$feLocal = "frontend\.env.development.local"
if (Test-Path $feLocal) { Ok "$feLocal exists (left unchanged)" } else {
    @(
        "# Local overrides for npm run dev (gitignored)"
        "VITE_AUTH_PROVIDER=local"
        "VITE_AUTH_URL=http://localhost:8010"
        "# FEM Studio preview (needs the FEM service on :8020 and a maintainer/admin login)"
        "VITE_FEATURE_FEM=true"
    ) | Set-Content $feLocal
    Ok "$feLocal created (local auth, FEM flag on)"
}

# ── Private notes ────────────────────────────────────────────────────────
Step "Private notes (.notes/)"
$ghOk = $false
if (Get-Command gh -ErrorAction SilentlyContinue) {
    gh auth status *> $null
    $ghOk = $LASTEXITCODE -eq 0
}
if (-not $ghOk) { Todo "gh auth login  (then re-run this script for .notes/)" }
elseif ($SkipNotes) { Write-Host "  skipped" }
elseif (Test-Path ".notes\.git") {
    git -C .notes pull --ff-only --quiet
    Ok ".notes pulled"
} else {
    gh repo clone baumgpaul/AntennaEducator-notes .notes -- --quiet
    if ($LASTEXITCODE -eq 0) { Ok ".notes cloned (TODO.md, ROADMAP.md, TEST_PLAN.md, LOCAL_FILES.md)" }
    else { Todo "could not clone baumgpaul/AntennaEducator-notes (private) — check gh account access" }
}

# ── AWS / Terraform (optional: only for infra work, logs, admin scripts) ─
Step "AWS / Terraform (optional)"
if (Get-Command aws -ErrorAction SilentlyContinue) {
    aws sts get-caller-identity --profile antenna-staging *> $null
    if ($LASTEXITCODE -eq 0) { Ok "AWS profile antenna-staging works" }
    else { Todo "AWS profile antenna-staging (eu-west-1) not configured or expired" }
}
foreach ($f in "terraform\environments\staging\backend.hcl", "terraform\environments\staging\terraform.tfvars") {
    if (Test-Path $f) { Ok $f } else { Todo "create $f by hand if you run Terraform (see .notes/LOCAL_FILES.md)" }
}

# ── Summary ──────────────────────────────────────────────────────────────
Step "Done"
if ($todos.Count -eq 0) { Ok "nothing left to do" }
else { Write-Host "Left for you:" -ForegroundColor Yellow; $todos | ForEach-Object { Write-Host "  - $_" } }
Write-Host "`nNext: .\.venv\Scripts\Activate.ps1, then see docs/DEVELOPMENT.md (or run /resume in Claude Code)."
