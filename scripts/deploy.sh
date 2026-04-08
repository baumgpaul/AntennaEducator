#!/usr/bin/env bash
# scripts/deploy.sh — Build, push, and deploy Antenna Educator to AWS.
#
# Usage:
#   ./scripts/deploy.sh                           # deploy to staging
#   ./scripts/deploy.sh --environment production  # deploy to production
#   ./scripts/deploy.sh --skip-backend            # frontend only
#   ./scripts/deploy.sh --skip-frontend           # backend only
#
# Prerequisites:
#   - Docker Desktop running
#   - AWS CLI v2 configured (profile: antenna-staging or antenna-production)
#   - Node.js 18+  (for frontend build)

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────────────
ENVIRONMENT="staging"
SKIP_BACKEND=false
SKIP_FRONTEND=false
SERVICES=("projects" "preprocessor" "solver" "postprocessor")
REGION="eu-west-1"

# ── Argument parsing ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --environment|-e) ENVIRONMENT="$2"; shift 2 ;;
        --skip-backend)   SKIP_BACKEND=true; shift ;;
        --skip-frontend)  SKIP_FRONTEND=true; shift ;;
        *) echo "Unknown argument: $1"; exit 1 ;;
    esac
done

AWS_PROFILE="antenna-${ENVIRONMENT}"

echo ""
echo "=== Antenna Educator — AWS Deploy ==="
echo "Environment : ${ENVIRONMENT}"
echo "AWS Profile : ${AWS_PROFILE}"
echo "Region      : ${REGION}"
echo ""

# ── Resolve AWS account ────────────────────────────────────────────────────
ACCOUNT_ID=$(aws sts get-caller-identity \
    --profile "${AWS_PROFILE}" \
    --query Account --output text)
echo "Account ID  : ${ACCOUNT_ID}"
echo ""

ECR_BASE="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"

# ── Backend Lambda images ──────────────────────────────────────────────────
if [[ "${SKIP_BACKEND}" == "false" ]]; then
    echo "--- ECR Login ---"
    aws ecr get-login-password --region "${REGION}" --profile "${AWS_PROFILE}" \
        | docker login --username AWS --password-stdin "${ECR_BASE}"
    echo ""

    for SERVICE in "${SERVICES[@]}"; do
        REPO="antenna-simulator-${SERVICE}-${ENVIRONMENT}"
        IMAGE_URI="${ECR_BASE}/${REPO}:latest"
        LAMBDA_NAME="antenna-simulator-${SERVICE}-${ENVIRONMENT}"

        echo "--- Building ${SERVICE} ---"
        docker build \
            -f "backend/${SERVICE}/Dockerfile.lambda" \
            -t "${REPO}" \
            --platform linux/amd64 \
            .

        echo "Tagging…"
        docker tag "${REPO}:latest" "${IMAGE_URI}"

        echo "Pushing to ECR…"
        docker push "${IMAGE_URI}"

        echo "Updating Lambda function-code…"
        aws lambda update-function-code \
            --function-name "${LAMBDA_NAME}" \
            --image-uri "${IMAGE_URI}" \
            --region "${REGION}" \
            --profile "${AWS_PROFILE}" \
            --no-cli-pager

        echo "Waiting for update to settle…"
        aws lambda wait function-updated \
            --function-name "${LAMBDA_NAME}" \
            --region "${REGION}" \
            --profile "${AWS_PROFILE}"

        echo "✓ ${SERVICE} deployed"
        echo ""
    done
fi

# ── Frontend ───────────────────────────────────────────────────────────────
if [[ "${SKIP_FRONTEND}" == "false" ]]; then
    BUCKET_NAME="antenna-simulator-frontend-${ENVIRONMENT}-${ACCOUNT_ID}"

    echo "--- Building frontend ---"
    (cd frontend && npm ci --prefer-offline && npx vite build --mode "${ENVIRONMENT}")

    # Resolve CloudFront distribution ID from Terraform outputs or a tag query
    CF_DIST_ID=$(aws cloudfront list-distributions \
        --profile "${AWS_PROFILE}" \
        --query "DistributionList.Items[?Comment=='antenna-simulator-${ENVIRONMENT}'].Id | [0]" \
        --output text 2>/dev/null || true)

    echo "Syncing frontend to s3://${BUCKET_NAME}…"
    aws s3 sync frontend/dist "s3://${BUCKET_NAME}" \
        --delete \
        --profile "${AWS_PROFILE}"

    if [[ -n "${CF_DIST_ID}" && "${CF_DIST_ID}" != "None" ]]; then
        echo "Invalidating CloudFront distribution ${CF_DIST_ID}…"
        aws cloudfront create-invalidation \
            --distribution-id "${CF_DIST_ID}" \
            --paths "/*" \
            --profile "${AWS_PROFILE}" \
            --no-cli-pager
        echo "✓ CloudFront invalidation created"
    else
        echo "⚠ CloudFront distribution not found — skipping invalidation"
    fi

    echo "✓ Frontend deployed to s3://${BUCKET_NAME}"
fi

echo ""
echo "=== Deploy complete (${ENVIRONMENT}) ==="
