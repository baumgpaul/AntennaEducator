#!/usr/bin/env bash
# init-local.sh — Bootstrap DynamoDB Local and MinIO for Docker development.
#
# Run once after starting services with:
#   docker compose up -d
#   ./scripts/init-local.sh
#
# Requires:
#   - Python 3.11+ with venv activated (or installed globally)
#   - .env file present (copied from .env.example)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env file not found at $ENV_FILE"
    echo "       Copy .env.example → .env and fill in ADMIN_EMAIL / ADMIN_PASSWORD."
    exit 1
fi

# Export variables from .env (skip comments and blank lines)
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "=== Antenna Educator — Local Bootstrap ==="
echo "DynamoDB endpoint  : ${DYNAMODB_ENDPOINT_URL:-http://localhost:8000}"
echo "Table              : ${DYNAMODB_TABLE_NAME:-antenna-simulator-local}"
echo ""

cd "$REPO_ROOT"
python scripts/init_local_db.py
