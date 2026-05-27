# QA artifacts & scripts

## Run backend battery (Django)

From repo root:

```bash
./scripts/qa/run_qa_battery.sh
```

- Uses `apps/api/.venv/bin/python` when present, otherwise `uv run python`, then `python3`.
- Sets `USE_SQLITE=true` and `DJANGO_ENV=development` by default.
- Writes **`qa-artifacts/<UTC>/manage_test.log`** (folder is gitignored).

## HTTP smoke (optional)

Requires API running (e.g. `manage.py runserver`):

```bash
API_BASE_URL=http://127.0.0.1:8000 ./scripts/qa/http_smoke.sh
```

## Strategy document

See **[BRUTAL_RETAIL_POS_QA_BLUEPRINT.md](./BRUTAL_RETAIL_POS_QA_BLUEPRINT.md)** for the full matrix (billing, inventory, GST, PDF, security, load, recovery).

## Stack note

This monorepo uses **Django + DRF + SimpleJWT** (API) and **Next.js** (web), not FastAPI/Vite. Align automation with that stack.

## WeasyPrint / PDF tests

On macOS, WeasyPrint may warn if system libraries (Pango, etc.) are missing. Install per [WeasyPrint docs](https://doc.courtbouillon.org/weasyprint/stable/first_steps.html#installation) before treating PDF-related test failures as product bugs.
