#!/usr/bin/env bash
# Run Django test suite and tee output to qa-artifacts/<UTC-timestamp>/manage_test.log
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${ROOT}/qa-artifacts/${TS}"
mkdir -p "${OUT}"
cd "${ROOT}/apps/api"

export DJANGO_ENV="${DJANGO_ENV:-development}"
export USE_SQLITE="${USE_SQLITE:-true}"

# Prefer project venv, then uv, then system python3
PY="${ROOT}/apps/api/.venv/bin/python"
if [[ ! -x "${PY}" ]]; then
  if command -v uv >/dev/null 2>&1; then
    PY="uv run python"
  else
    PY="python3"
  fi
fi

{
  echo "=== run_qa_battery ==="
  echo "timestamp_utc=${TS}"
  echo "cwd=$(pwd)"
  echo "DJANGO_ENV=${DJANGO_ENV} USE_SQLITE=${USE_SQLITE}"
  echo "python_cmd=${PY}"
  echo ""
  echo "=== django version ==="
  if [[ "${PY}" == *"uv run"* ]]; then
    uv run python manage.py --version 2>&1
  else
    "${PY}" manage.py --version 2>&1
  fi
  echo ""
  echo "=== manage.py test (verbosity=2) ==="
  if [[ "${PY}" == *"uv run"* ]]; then
    uv run python manage.py test --verbosity=2 --parallel=1 2>&1
  else
    "${PY}" manage.py test --verbosity=2 --parallel=1 2>&1
  fi
} | tee "${OUT}/manage_test.log"

echo ""
echo "OK: full log at ${OUT}/manage_test.log"
