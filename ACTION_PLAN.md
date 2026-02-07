# Action Plan: Alpha → Collaboration-Ready

**Created:** 2026-02-07  
**Status:** Planning  
**Goal:** Clean the repository, document deployment workflows, and establish a CI/CD pipeline so colleagues can contribute effectively.

---

## Current State Summary

| Metric | Value |
|---|---|
| Tracked source lines | ~57,500 (20K Python · 33K TypeScript · 1.8K PowerShell · 2.4K Terraform) |
| Git commits | 223 on `master` |
| Unit tests | All passing |
| AWS (staging) | 4 Lambda functions deployed, S3 + CloudFront frontend |
| CI/CD | **None** — manual PowerShell scripts |
| Documentation | Scattered across README, QUICK_START, PROJECT_OVERVIEW, 15 docs/*.md |

---

## Phase 1 — Repository Cleanup (est. 3–4 h)

Make the repo presentable and navigable for a new contributor who clones it for the first time.

### 1.1 Delete stale `dev_tools/` scripts (30 min)

~18 ad-hoc test/debug scripts that were used during development and are now superseded by the proper `tests/` suite. Remove:

| File | Reason |
|---|---|
| `test_api_debug.py` | Ad-hoc API debug |
| `test_api_gateway.ps1` | Ad-hoc API Gateway test |
| `test_dipole_api.ps1` | Simple smoke test, superseded by `test_aws_pipeline.py` |
| `test_far_field_api.ps1` | Ad-hoc far-field test |
| `test_farfield_direct.py` | Ad-hoc direct test |
| `test_farfield_full_dipole.py` | Ad-hoc test |
| `test_farfield_simple.py` | Ad-hoc test |
| `test_field_computation_workflow.py` | Ad-hoc workflow test (hits localhost) |
| `test_from_debug_json.py` | Reads external debug JSON — throwaway |
| `test_http_direct.py` | Ad-hoc HTTP test |
| `test_multi_antenna_api.ps1` | Ad-hoc multi-antenna test |
| `test_multi_antenna_frontend.ts` | TypeScript ad-hoc test |
| `test_postprocessing_comprehensive.py` | Ad-hoc |
| `test_postprocessing_features.ps1` | Ad-hoc |
| `test_postprocessing_integration.py` | Ad-hoc |
| `test_postprocessing_workflow.py` | Ad-hoc |
| `test_postprocessor_simple.py` | Ad-hoc |
| `test_projects_api.ps1` | Ad-hoc |
| `test_projects_direct.py` | Ad-hoc |
| `test_solver_api.py` | Ad-hoc |
| `test_solver_direct.py` | Ad-hoc |
| `test_voltage_source_current_fix.py` | One-time bug-fix verification |
| `debug_geometry.py` | Ad-hoc geometry debug |
| `migrate_add_user_approval_fields.py` | One-time migration, already applied |

**Keep:**
- `check_services.ps1`, `rebuild_lambda_images.ps1`, `run_integration_tests.ps1` — infrastructure
- `setup_dynamodb_local.py` — DynamoDB Local setup
- `start_all_services.ps1`, `start_backend.ps1`, `start_backend_windows.ps1`, `start_solver_service.ps1` — dev startup
- `test_aws_pipeline.py` — AWS E2E smoke test
- `test_current_source_golden.py` — reference validation (golden standard)
- `lumped_element_examples.py` — API usage examples
- `visualization/` — geometry debugging/plotting tools
- `deploy_api_gateway.ps1`, `deploy_cognito.ps1` — may still be useful (review if Terraform covers these)

Possibly promote `test_incremental_postprocessing.py` (uses FastAPI TestClient) to `tests/integration/` before deleting.

### 1.2 Archive completed-phase docs (20 min)

Move to `docs/archive/`:

| File | Reason |
|---|---|
| `TASK_C1_COMPLETE.md` | Completion notice |
| `TASK_C1_DEPLOYMENT_COMPLETE.md` | Deployment completion notice |
| `TESTING_COMPLETE.md` | Testing completion notice |
| `SOLVER_SERVICE_COMPLETE.md` | Completion notice |
| `AWS_MVP_DEPLOYMENT_PLAN.md` | MVP plan — implemented |
| `PHASE_C_COGNITO_GUIDE.md` | Phase C — Cognito already deployed |

Keep and review/update:
- `API_COMPLETE_REFERENCE.md` — update to match current endpoints
- `BACKEND_IMPLEMENTATION.md` — review for accuracy
- `COGNITO_DEPLOYMENT_CHECKLIST.md` — update status
- `FRONTEND_GAP_ANALYSIS.md` — update with current state
- `LUMPED_ELEMENTS_ANALYSIS.md` — still relevant domain doc
- `REFERENCE_VERIFICATION.md` — reference verification data
- `PORT_PARAMETERS.md` — engineering parameter documentation
- `AWS_PHASE2_SCALING_PLAN.md` — future plan, still relevant
- `COMPLETE_OUTPUTS.md` — describes output formats

### 1.3 Fix `.gitignore` gaps (10 min)

Add missing entries:

```gitignore
# Generated test outputs
test_outputs/

# doc archive
docs/archive/

# AWS credentials directory (if created locally)
.aws/

# Terraform plan files
*.tfplan
terraform/environments/staging/frontend_index.html
terraform/environments/staging/mainbundle.js
```

### 1.4 Clean stray files (15 min)

| Item | Action |
|---|---|
| `.aws/` (empty directory) | Delete |
| `venv/` (duplicate — `.venv` is the real one) | Delete (already in `.gitignore`) |
| `terraform/environments/staging/frontend_index.html` | Delete |
| `terraform/environments/staging/mainbundle.js` | Delete |
| `terraform/environments/staging/*.tfplan` | Delete |
| `test_outputs/*.png` | Already covered by `*.png` gitignore rule, but add `test_outputs/` explicitly |

### 1.5 Fix `deploy-auth-to-aws.ps1` (20 min)

Script still prints references to old files that no longer exist:
- `backend/projects/local_auth_service.py` → now `backend/common/auth/local_provider.py`
- `backend/projects/jwt_middleware.py` → now `backend/common/auth/dependencies.py`

Update echo/documentation lines to reflect current `backend/common/auth/` structure.

### 1.6 Update `dev_tools/README.md` (30 min)

Current README only lists a subset of files. Rewrite to document all remaining scripts with:
- Purpose
- Usage example
- Prerequisites

### 1.7 Add pre-commit hooks (30 min)

Create `.pre-commit-config.yaml`:
- **Python:** black, isort (`profile = "black"`), ruff
- **Frontend:** eslint, prettier (if configured)
- **General:** trailing-whitespace, end-of-file-fixer, check-yaml

Document in CONTRIBUTING.md: `pip install pre-commit && pre-commit install`.

### 1.8 Review legacy reference code tracking (15 min)

Delete all legacy reference code references

### 1.9 Tag baseline (15 min)

```bash
git tag -a v0.1.0-alpha -m "Alpha release: PEEC solver, 4 microservices, AWS staging deployment"
```

---

## Phase 2 — Deployment Documentation (est. 3–4 h)

### 2.1 Create `CONTRIBUTING.md` (45 min)

Content:
- Branching strategy: **GitHub Flow** — `main` is always deployable, feature branches + PRs
- PR process: create branch → implement → tests pass → code review → merge
- Code style: Black (line-length 100), isort (`profile = "black"`), ruff for Python; ESLint + Prettier for TypeScript
- Commit conventions: conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`)
- Test requirements: all PRs must pass `pytest tests/unit/` and `npm test`
- Pre-commit hooks setup

### 2.2 Create `docs/LOCAL_DEVELOPMENT.md` (60 min)

Step-by-step guide:

1. **Prerequisites:** Python 3.11+, Node.js 18+, Docker Desktop, AWS CLI v2
2. **Python setup:**
   ```bash
   python -m venv .venv
   .venv\Scripts\activate        # Windows
   source .venv/bin/activate     # Linux/macOS
   pip install -e ".[dev]"
   ```
3. **DynamoDB Local:**
   ```bash
   docker run -d -p 8000:8000 amazon/dynamodb-local -jar DynamoDBLocal.jar -inMemory
   python dev_tools/setup_dynamodb_local.py
   ```
4. **Run backend services:**
   ```bash
   uvicorn backend.preprocessor.main:app --port 8001 --reload
   uvicorn backend.solver.main:app --port 8002 --reload
   uvicorn backend.postprocessor.main:app --port 8003 --reload
   uvicorn backend.projects.main:app --port 8010 --reload
   # Or use: .\dev_tools\start_all_services.ps1
   ```
5. **Run frontend:**
   ```bash
   cd frontend && npm install && npm run dev
   ```
6. **Environment variables:** Reference table of all `USE_COGNITO`, `USE_DYNAMODB`, `DYNAMODB_*`, `COGNITO_*`, port vars.
7. **Run tests:**
   ```bash
   pytest tests/unit/              # Backend
   cd frontend && npm test         # Frontend
   ```
8. **Full stack via Docker:** `docker-compose up --build`

### 2.3 Create `docs/AWS_DEPLOYMENT.md` (60 min)

Step-by-step guide:

1. **Prerequisites:**
   - AWS CLI configured with `antenna-staging` profile
   - Docker Desktop running
   - Account `767397882329`, region `eu-west-1`
2. **Terraform (one-time or when infra changes):**
   ```bash
   cd terraform/environments/staging
   terraform init
   terraform plan -out=tfplan
   terraform apply tfplan
   ```
3. **Deploy all backend Lambda services:**
   ```powershell
   .\dev_tools\rebuild_lambda_images.ps1
   # Builds 4 Docker images, pushes to ECR, updates Lambda functions
   ```
4. **Deploy frontend:**
   ```powershell
   .\deploy-frontend.ps1           # Build + deploy
   .\deploy-frontend.ps1 -SkipBuild  # Deploy only
   ```
5. **Verify deployment:**
   ```bash
   python dev_tools/test_aws_pipeline.py
   ```
6. **Lambda Function URL reference:**
   | Service | URL |
   |---|---|
   | Preprocessor | `https://xfwks3en...lambda-url.eu-west-1.on.aws` |
   | Solver | `https://znawgmfq...lambda-url.eu-west-1.on.aws` |
   | Postprocessor | `https://3jkkorrfl...lambda-url.eu-west-1.on.aws` |
   | Projects | `https://lizbey4k...lambda-url.eu-west-1.on.aws` |
7. **Frontend:** `https://antennaeducator.nyakyagyawa.com`

### 2.4 Update root `README.md` (30 min)

Consolidate into a single authoritative entry point:
- Project description + architecture diagram (Mermaid)
- Quick links: LOCAL_DEVELOPMENT.md, AWS_DEPLOYMENT.md, CONTRIBUTING.md
- Badge placeholders for future CI
- Merge essential content from `QUICK_START.md` and `PROJECT_OVERVIEW.md`, then delete those files (or redirect)

### 2.5 Complete `.env.example` (15 min)

Ensure template covers all environment variables across services:
```env
# Auth mode
USE_COGNITO=false
USE_DYNAMODB=true

# DynamoDB
DYNAMODB_ENDPOINT_URL=http://localhost:8000
DYNAMODB_TABLE_NAME=antenna-simulator-staging

# Cognito (only when USE_COGNITO=true)
COGNITO_USER_POOL_ID=
COGNITO_CLIENT_ID=
COGNITO_REGION=eu-west-1

# Service ports
PREPROCESSOR_PORT=8001
SOLVER_PORT=8002
POSTPROCESSOR_PORT=8003
PROJECTS_PORT=8010
AUTH_PORT=8011
```

---

## Phase 3 — CI/CD Pipeline with AWS CodePipeline (est. 8–10 h)

### Architecture

```
GitHub (main branch)
  └─ Push triggers → AWS CodePipeline
       ├─ Stage 1: Source (GitHub connection via CodeStar)
       ├─ Stage 2: Test (CodeBuild)
       │   ├─ Python: black, isort, ruff, pytest
       │   └─ Frontend: npm ci, tsc --noEmit, npm test
       ├─ Stage 3: Build (CodeBuild)
       │   ├─ Build 4 Docker images (Dockerfile.lambda)
       │   └─ Push to ECR
       ├─ Stage 4: Deploy Backend (CodeBuild / Lambda update)
       │   └─ aws lambda update-function-code × 4
       ├─ Stage 5: Deploy Frontend (CodeBuild)
       │   ├─ npm run build
       │   ├─ aws s3 sync
       │   └─ CloudFront invalidation
       └─ Stage 6: Smoke Test (CodeBuild)
           └─ python dev_tools/test_aws_pipeline.py
```

### 3.1 Terraform for CodePipeline infrastructure (120 min)

Add Terraform module `terraform/modules/cicd/`:
- **CodeStar Connection** to GitHub repository
- **S3 artifact bucket** for pipeline artifacts
- **CodeBuild project** (test stage) — `buildspec-test.yml`
- **CodeBuild project** (build & deploy stage) — `buildspec-deploy.yml`
- **CodePipeline** with 4-6 stages
- **IAM roles** for CodeBuild (ECR push, Lambda update, S3 sync, CloudFront invalidation) and CodePipeline

Wire into `terraform/environments/staging/main.tf`.

### 3.2 Create `buildspec-test.yml` (60 min)

```yaml
version: 0.2
phases:
  install:
    runtime-versions:
      python: 3.11
      nodejs: 18
    commands:
      - pip install -e ".[dev]"
      - cd frontend && npm ci && cd ..
  build:
    commands:
      # Python
      - black --check backend/ tests/
      - isort --check-only backend/ tests/
      - ruff check backend/ tests/
      - pytest tests/unit/ -x -q
      # Frontend
      - cd frontend
      - npx tsc --noEmit
      - npm test -- --run
```

### 3.3 Create `buildspec-deploy.yml` (90 min)

```yaml
version: 0.2
env:
  variables:
    AWS_ACCOUNT_ID: "767397882329"
    REGION: "eu-west-1"
    ENVIRONMENT: "staging"
phases:
  pre_build:
    commands:
      - aws ecr get-login-password --region $REGION |
        docker login --username AWS --password-stdin
        $AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com
  build:
    commands:
      # Build + push 4 Lambda images
      - |
        for SERVICE in preprocessor solver postprocessor projects; do
          REPO="antenna-simulator-${SERVICE}-${ENVIRONMENT}"
          IMAGE_URI="$AWS_ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/${REPO}:latest"
          docker build -f backend/${SERVICE}/Dockerfile.lambda -t $REPO .
          docker tag ${REPO}:latest $IMAGE_URI
          docker push $IMAGE_URI
          aws lambda update-function-code \
            --function-name "antenna-simulator-${SERVICE}-${ENVIRONMENT}" \
            --image-uri $IMAGE_URI --region $REGION
          aws lambda wait function-updated \
            --function-name "antenna-simulator-${SERVICE}-${ENVIRONMENT}" \
            --region $REGION
        done
      # Build + deploy frontend
      - cd frontend && npm ci && npm run build && cd ..
      - aws s3 sync frontend/dist/
        s3://antenna-simulator-frontend-staging-767397882329/
        --delete --region $REGION
      - aws cloudfront create-invalidation
        --distribution-id E2WUND9P0FX4NA
        --paths "/*" --region $REGION
  post_build:
    commands:
      # Smoke test
      - pip install requests
      - python dev_tools/test_aws_pipeline.py
```

### 3.4 IAM permissions for CodeBuild (30 min)

CodeBuild service role needs:
- `ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:PutImage`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`
- `lambda:UpdateFunctionCode`, `lambda:GetFunction`
- `s3:PutObject`, `s3:DeleteObject`, `s3:ListBucket` (for frontend bucket)
- `cloudfront:CreateInvalidation`
- `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`

### 3.5 Manual approval gate (optional) (30 min)

Add a manual approval stage between Test and Deploy for production safety. In staging, this can be automatic (no approval needed).

### 3.6 Pipeline notifications (30 min)

- SNS topic for pipeline failure notifications
- Email subscription for team

---

## Architecture Decision: SAM vs Docker

**Decision: Stay with Docker + Terraform. Do NOT add SAM.**

### Comparison

| Factor | Docker (current) | SAM |
|---|---|---|
| Lambda packaging | Container images via ECR | ZIP or container images |
| Infrastructure | Terraform (10 modules already built) | `template.yaml` — **overlaps with Terraform** |
| Local dev | `uvicorn --reload` (instant hot-reload) | `sam local invoke` (cold starts, slower) |
| Compiled deps (NumPy, SciPy) | Handled natively by Docker | ZIP fails at >250 MB, requires layers |
| CI/CD | Build → Push ECR → Update Lambda | `sam build` → `sam deploy` (another CLI) |
| Team learning curve | Standard Docker + Terraform | Additional tool + template syntax |

### Rationale

1. **Terraform overlap:** We already have 10 Terraform modules managing ECR repos, Lambda functions, DynamoDB, Cognito, CloudFront, S3, Route 53, ACM. Adding SAM's `template.yaml` would create *two competing sources of truth* for the same Lambda resources.

2. **Compiled dependencies:** NumPy and SciPy contain compiled C extensions. Docker container images handle this naturally (we build `--platform linux/amd64`). SAM's ZIP packaging would require custom Lambda layers or struggle with the 250 MB limit.

3. **Developer experience:** `uvicorn --reload` with hot-reload is faster than `sam local invoke` which simulates Lambda cold starts. No benefit for daily development.

4. **SAM's value-add is small:** The main SAM convenience is `sam deploy` — but our existing 4-line deploy script (`docker build` → `docker tag` → `docker push` → `aws lambda update-function-code`) does exactly the same thing and will be automated by CodePipeline.

5. **When SAM *would* make sense:** Starting fresh with no IaC, using simple ZIP-packaged Lambdas without compiled deps, wanting the fastest path to deployment. That is not our situation.

---

## Timeline Summary

| Phase | Scope | Effort | Timeline |
|---|---|---|---|
| **Phase 1** | Repository cleanup | 3–4 h | Day 1 |
| **Phase 2** | Deployment documentation | 3–4 h | Day 1–2 |
| **Phase 3** | CI/CD with CodePipeline | 8–10 h | Day 2–4 |
| **Total** | | **14–18 h** | ~3–4 working days |

Estimates assume pair-working with Copilot (AI implements, human reviews). Phase 3 is larger than the GitHub Actions alternative (~6–8 h) because CodePipeline requires Terraform modules for infrastructure (CodeBuild projects, IAM roles, pipeline definition, CodeStar connection).

---

## Phase 4 — Future Backlog (not scheduled)

| # | Task | Effort | Notes |
|---|---|---|---|
| 4.1 | Add `prod` Terraform environment | 2–3 h | Separate AWS account or namespaced resources |
| 4.2 | API Gateway instead of Lambda Function URLs | 4–6 h | Custom domain, throttling, API keys. Terraform module exists but not wired. |
| 4.3 | Promote useful ad-hoc tests to `tests/integration/` | 3–4 h | Extract valuable test cases before deleting dev_tools scripts |
| 4.4 | Branch protection rules on GitHub | 30 min | Require PR reviews, status checks before merge |
| 4.5 | Staging ↔ Production pipeline promotion | 2–3 h | Deploy to staging, manual approval, then deploy to prod |
| 4.6 | Monitoring & alerting (CloudWatch) | 2–3 h | Lambda error rates, duration alarms, DynamoDB throttling |
| 4.7 | Cost optimization review | 1–2 h | Lambda memory/timeout tuning, reserved concurrency |
