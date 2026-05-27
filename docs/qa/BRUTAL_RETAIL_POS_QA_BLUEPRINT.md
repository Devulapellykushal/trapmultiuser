# Brutal Retail / Tyre-Shop QA & Security Blueprint

**Latest automated battery:** run `./scripts/qa/run_qa_battery.sh`; logs land under `qa-artifacts/<timestamp>/manage_test.log` (gitignored). See `docs/qa/README.md`.

**Repository reality check (read from codebase):**

| Your prompt assumption | This repo (`trap`) |
|------------------------|---------------------|
| FastAPI | **Django 4.x + Django REST Framework** (`apps/api/pyproject.toml`) |
| React + Vite | **Next.js 14 + React 18** (`apps/web/package.json`) |
| — | **JWT** (`djangorestframework-simplejwt`), **ReportLab + WeasyPrint** for PDFs |
| — | Inventory ledger (`InventoryMovement`), sales (`process_sale`), invoices (`generate_invoice_for_sale`) |

Use this document as the **master test strategy**; implement automation incrementally per priority.

---

## 0. Priority, severity, and automation legend

| Priority | Meaning |
|----------|---------|
| **P0** | Money, stock, legal (GST), or auth — ship blocker |
| **P1** | Major UX / reconciliation / data loss risk |
| **P2** | Hardening, perf, edge polish |

| Severity | Impact |
|----------|--------|
| **S1** | Wrong tax, wrong stock, duplicate bill, silent data loss |
| **S2** | User-visible error, recoverable with retry |
| **S3** | Cosmetic / logging / non-financial |

| Automation | Tooling hint (this repo) |
|------------|-------------------------|
| **A** | `python manage.py test` / pytest-django (`apps/api/*/tests.py`) |
| **B** | Playwright (not yet in repo — add when E2E budget exists) |
| **C** | k6/Locust against staging |
| **M** | Manual / device (thermal printer) |

---

## 1. Complete test plan (by layer)

### 1.1 Unit tests (A)

- **Money:** `Decimal` only for GST, line totals, round-off; assert no `float` in invoice math paths (`invoices/`, `sales/`).
- **Rounding:** CGST/SGST split, invoice total vs sum of lines, 1-paise drift policies.
- **Stock:** single SKU sale reduces ledger exactly once; idempotency key dedupes duplicate `process_sale` calls.
- **PDF:** table pagination, empty customer name, `None` address, very long SKU — no exception from generator.
- **Auth:** role matrix (ADMIN / STAFF) on sensitive views.

### 1.2 Integration tests (A)

- Sale → inventory movement → invoice row count and totals.
- Partial payment + balance due on invoice PDF fields.
- `stock_status` + `warehouse` query params vs annotated queryset (inventory list).
- Credit note / debit note flows if exposed to POS.

### 1.3 E2E tests (B — add Playwright)

- Login → POS scan → cart → checkout → print dialog (mock print).
- Inventory filter chips + row selection + drawer.
- Multi-tab: same user two tabs — cart isolation or server truth.

### 1.4 Regression / smoke (A + shell)

- **Smoke:** health `GET /` and `GET /health/`, auth token issue, one authenticated inventory list.
- **Regression:** run full Django test suite on every PR (already in `.github/workflows/backend.yml` via `manage.py test`).

### 1.5 Load / stress (C)

- N parallel checkouts (same warehouse, overlapping SKUs) — expect **no negative stock** if business rule forbids it.
- 10k products: list API pagination latency, DB index use (`EXPLAIN` on slow queries).

### 1.6 Chaos / failure injection (M + scripted)

- Kill DB connection mid-transaction — assert rollback, no half-sale.
- Kill worker during PDF write — no orphan `Invoice` without `Sale` linkage (or explicit FAILED state).

### 1.7 Security (A + external tools)

- **OWASP API Top 10:** broken object level auth on invoice/sale IDs, mass assignment on PATCH product.
- **JWT:** expired token, malformed signature, algorithm confusion (`none`), refresh rotation.
- **Injection:** SQLi in search query params; XSS in printed name fields (PDF/HTML escape).
- **Rate limit:** login and checkout throttling (add if missing).

### 1.8 Penetration / abuse (M + C)

- Invoice ID enumeration, barcode brute-force on POS scan endpoint.
- Replay same `Authorization` + idempotency header set.

### 1.9 UX failure (B + M)

- Thermal width: 48/80 column wrap; ellipsis vs clip.
- Telugu + English mixed strings in customer name and address (see §7).

---

## 2. Edge-case matrix (samples — extend in spreadsheet)

### 2.1 Billing

| ID | Case | Expected | Sev | Auto |
|----|------|----------|-----|------|
| B1 | Quantity `0`, `-1`, `999999` | Reject / cap per policy | S1 | A |
| B2 | Double-click Pay | Single sale (idempotency) | S1 | A |
| B3 | Price override at bill time vs master price | Persist line snapshot | S1 | A |
| B4 | GST % 0, 5, 12, 18, 28, invalid | Validate allowed set | S1 | A |
| B5 | Mixed GST lines on one invoice | Correct split rows | S1 | A |
| B6 | 100% discount | Tax base rules per law | S1 | A |

### 2.2 Inventory

| ID | Case | Expected | Sev | Auto |
|----|------|----------|-----|------|
| I1 | Concurrent sale last unit | One wins, one error or queue | S1 | A/C |
| I2 | Sale during PO receipt | Serializable order or correct final qty | S1 | A |
| I3 | Warehouse filter + stock badge | Matches ledger scope | S2 | A |
| I4 | Deleted product in cart | Block or clear with message | S2 | B |

### 2.3 Auth / session

| ID | Case | Expected | Sev | Auto |
|----|------|----------|-----|------|
| A1 | Access invoice of other org (if multi-tenant) | 403 | S1 | A |
| A2 | Staff tries admin-only import | 403 | S2 | A |
| A3 | Token expired mid-checkout | Clear error, no partial commit | S1 | B |

### 2.4 PDF / print

| ID | Case | Expected | Sev | Auto |
|----|------|----------|-----|------|
| P1 | 300+ lines | Paginate, no overlap footer | S1 | A |
| P2 | 4KB product name | Wrap / truncate policy | S2 | A |
| P3 | Unicode + special chars | Embedded font or safe substitute | S1 | A |
| P4 | Print 10× rapid | Idempotent server-side or queue | S2 | M |

### 2.5 GST / decimals

| ID | Case | Expected | Sev | Auto |
|----|------|----------|-----|------|
| G1 | Line total 10.005 × qty | Banker’s / govt rule documented | S1 | A |
| G2 | Invoice total vs sum lines | Match within 1 paisa policy | S1 | A |

### 2.6 Network / client

| ID | Case | Expected | Sev | Auto |
|----|------|----------|-----|------|
| N1 | Offline mid-request | Retry-safe POST or duplicate protection | S1 | B |
| N2 | Refresh on success screen | No double POST if idempotent | S1 | B |
| N3 | Multi-tab two carts | Document behaviour | S2 | B |

---

## 3. Real shop scenarios (Telangana tyre retail)

1. **Rush hour:** 20 customers — queue depth, printer buffer, operator errors (wrong vehicle selected).
2. **Owner overrides MRP** on one line while second counter sells same SKU — line snapshot vs live master.
3. **Power cut** after `process_sale` returns 200 — client must not assume print success; server state already committed.
4. **GST filing month-end** — HSN summary export matches sum of invoices (reconciliation report).
5. **Return with partial tread** — credit note quantity and value rules.
6. **Cash + UPI split** — two payments, one sale; receipt shows both.
7. **Telugu customer name** on thermal — font / transliteration policy.

---

## 4. Security testing (attack simulations)

| Attack | Target | Mitigation to verify |
|--------|--------|----------------------|
| SQLi | `?search=`, filters | Parameterized ORM / validated inputs |
| IDOR | `/invoices/{id}/`, `/sales/{id}/` | Object-level permission |
| JWT tamper | Change payload sub | Signature verify fail |
| Rate limit | `/auth/token/` | 429 after threshold |
| Replay | Replay checkout body | Idempotency / unique constraints |
| PDF injection | `<script>` in name | Escaped in PDF text |
| DoS | 10MB JSON body | Size limits |

---

## 5. Database validation

- Atomic: `transaction.atomic()` around sale + movements + invoice.
- Deadlock: concurrent updates on same product — retry or ordering.
- Orphan: invoice without sale — forbidden or reconciliation job.
- Decimal column precision vs Python `Decimal` quantize.

---

## 6. PDF + print (extreme cases)

- **Pages:** 3+ pages, 500 lines — memory RSS cap, generation time SLA.
- **Overflow:** GST table, totals block, signature line — no overlap (visual diff golden PDFs).
- **QR/barcode:** invalid payload, clipped module width on 58mm.
- **Corruption:** stream interrupted — validate PDF magic bytes `%PDF` on download endpoint tests.

---

## 7. Performance

- 100 concurrent `process_sale` (k6) on staging with monitoring.
- Cold vs warm PDF generation.
- N+1 on product list — `select_related` / `prefetch_related` audit.

---

## 8. Failure recovery

- App restart: in-flight requests fail client-side; DB must not half-apply.
- Draft cart (if implemented): localStorage + server sync rules.
- Interrupted payment: sale `PENDING` vs `COMPLETED` state machine tests.

---

## 9. Frontend (Next.js)

- React Query stale data after mutation — invalidate keys (`hooks/use-inventory.ts` patterns).
- Empty API / slow API — skeleton vs error boundary.
- `null` pricing — table shows `—` without crash (`inventory/page.tsx` patterns).
- Keyboard: POS barcode field focus trap.

---

## 10. Automated implementation map

| Suite | Location | Command |
|-------|----------|---------|
| Django tests | `apps/api/*/tests.py` | `USE_SQLITE=true DJANGO_ENV=development python manage.py test` |
| QA battery + logs | `scripts/qa/run_qa_battery.sh` | `./scripts/qa/run_qa_battery.sh` |
| HTTP smoke | `scripts/qa/http_smoke.sh` | `API_BASE_URL=... ./scripts/qa/http_smoke.sh` |
| Future E2E | `apps/web/e2e/` (create) | `pnpm exec playwright test` |

---

## 11. Repro template (use in tickets)

**Steps:** …  
**Expected:** …  
**Actual:** …  
**Logs:** attach `qa-artifacts/<run>/manage_test.log`  
**Automation:** A/B/C/M  

---

## 12. Deep mindset checklist (pre-release gate)

- [ ] No `float` rupees in financial paths  
- [ ] Idempotency on all money-moving POSTs  
- [ ] Negative stock policy explicit and tested  
- [ ] Invoice sequence gap audit (legal)  
- [ ] IST date on printed invoice vs UTC storage  
- [ ] Thermal and A4 both signed off on real hardware  
- [ ] Fraud: discount limits, manager PIN for overrides  
- [ ] Accountant: export matches GL  

---

*Generated for repo `trap` — align domain copy (tyre / alignment) with product attributes and POS copy in UI when writing BDD scenarios.*
