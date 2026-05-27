#!/usr/bin/env bash
# Lightweight HTTP smoke against a running API (no auth required for health).
# Usage: API_BASE_URL=http://127.0.0.1:8000 ./scripts/qa/http_smoke.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${ROOT}/qa-artifacts/${TS}"
mkdir -p "${OUT}"
LOG="${OUT}/http_smoke.log"

BASE="${API_BASE_URL:-http://127.0.0.1:8000}"
BASE="${BASE%/}"

{
  echo "=== http_smoke ==="
  echo "BASE=${BASE}"
  echo "timestamp_utc=${TS}"
  echo ""

  probe() {
    local path="$1"
    echo "--- GET ${path} ---"
    curl -sS -o /dev/null -w "http_code=%{http_code} time_total=%{time_total}s\n" \
      "${BASE}${path}" || echo "curl_failed path=${path}"
  }

  probe "/health/"
  probe "/"
  # Benign fuzz on query string (should not 500)
  probe "/health/?q=test%27%22%3Cscript%3E%252f%252e%252e%252f"
} | tee "${LOG}"

echo "Wrote ${LOG}"
