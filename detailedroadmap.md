Your **TRAP / Quake Inventory** repo already encodes many of the non‑negotiables you described: **append-only `InventoryMovement`**, **stock = Σ(movements)** in `get_product_stock`, a **POS-oriented `Sale` / `SaleItem` / `Payment`** stack with **immutable line items**, **credit / partial payment concepts**, **`transaction.atomic` + `select_for_update`** patterns (invoice sequence, inventory movement), **ADMIN / STAFF** permissions, **organization tenancy** (each signup gets its own empty workspace — ADR 0003), and **drf-spectacular** at `/api/docs/`. The architecture below is written as an **upgrade and convergence plan** on that foundation—not a greenfield rewrite.

**Shipped product docs:** root [`README.md`](./README.md), [`docs/architecture/README.md`](./docs/architecture/README.md), [`CUSTOMERS.md`](./CUSTOMERS.md), [`docs/adr/0003-organization-tenancy-rbac.md`](./docs/adr/0003-organization-tenancy-rbac.md).

---

## 1. Complete implementation architecture

### 1.1 Layering (Django)

| Layer | Responsibility | Rule |
|--------|----------------|------|
| **Views / ViewSets** | HTTP, auth, pagination, filtering | No business rules beyond input shape |
| **Serializers** | Validation, read/write shapes, nested limits | No stock math, no invoice totals |
| **Services** (`inventory/services.py`, `sales/services.py`, new `customers/services.py`, `invoicing/pdf_service.py`) | All mutations, atomic workflows | **Only** entry points that create movements / sales / payments |
| **Models** | Invariants via constraints, immutability hooks | `save()` blocks illegal updates where needed |
| **Selectors / queries** (`sales/selectors.py`, `reports/queries.py`) | Read models, aggregations | No writes |
| **Tasks** (optional, Celery later) | Email/WhatsApp PDF—**not Phase 1** | Queue off the transaction **after** commit |

### 1.2 Bounded contexts (logical modules inside the monolith)

1. **Catalog** – `Product`, `ServiceItem`, categories/brands, HSN, GST%, cost, alerts  
2. **Inventory ledger** – `InventoryMovement` (+ optional snapshot/cache later)  
3. **Sales / POS** – cart → checkout → `Sale` + `SaleItem` + movements  
4. **Billing / compliance** – invoice number, GST breakup, PDF, print payload  
5. **AR (accounts receivable)** – partial / unpaid / collections (`Payment` + `CreditPayment` you already have)  
6. **Reporting** – reads over sales + movements + catalog  

Keep these as **folders + services** inside existing apps; avoid new microservices.

### 1.3 Single writer principle

- **One checkout function** (extend existing `sales/services.py` checkout) owns: validate → lock sequence → create `Sale` rows → create movements → create `Invoice` / PDF path → mark sale `COMPLETED`.  
- **One movement creator** (`create_inventory_movement`) for all stock deltas.  
- **No** “update `Product.current_stock`” in Phase 1; if such a column exists for UX, treat it as **cache only** (optional background reconcile) or remove from write paths—**ledger is truth**.

### 1.4 Tax model for Telangana (intra-state)

You need a **clear, documented choice**:

- **Option A – Tax-inclusive line (typical Indian retail / MRP-style)**  
  User enters **one rate per line** (what customer pays). GST is **extracted** for CGST/SGST columns. Matches much of your current `SaleItem` commentary.  
- **Option B – Tax-exclusive line + GST on top**  
  User enters taxable value; GST added. Invoice shows taxable + CGST + SGST + total.

For tyre shops doing **manual bargaining**, **Option A** is usually faster at the counter (one number). Either way, persist per line:

- `gst_percent`  
- `cgst_amount`, `sgst_amount` (or derive at print time from `gst_amount` ÷ 2 for symmetric rates)  
- `line_total` (what POS uses for payment)

**Recommendation:** store **`gst_amount` + split** on `SaleItem` at sale time so PDFs never recompute tax differently if law/rounding changes.

### 1.5 Alignment with your “user spec” vs **current code**

| Your ask | Current repo | Action |
|----------|--------------|--------|
| Ledger movements | `InventoryMovement` + `create_inventory_movement` | Extend types/fields; unify naming (`ADJUSTMENT` vs `MANUAL_ADJUSTMENT`) |
| `sold_price` manual | `SaleItem.selling_price` | POS always sends explicit price; rename in API only if you want parity with spec |
| `PaymentTransaction` | `Payment` (+ `CreditPayment` for later collections) | Either alias in API or add thin wrapper model—avoid duplicating rows |
| `Customer` entity | Customer fields on `Sale` | Add `Customer` model + FK nullable; migrate denormalized snapshot onto sale for print |
| `ServiceItem` | Services as products or missing | Add model; sell as line items referencing `ServiceItem` **or** `Product` with `item_type=SERVICE` |
| Duplicate invoice generators | `InvoiceSequence` in **both** `sales` and `invoices` | **Converge to one** sequence source of truth (see §10) |
| Swagger | `drf-spectacular` present | Extend schemas, examples, tags per domain |

### 1.6 Admin stock dump, UI reflection, and +/- adjustments (no barcode setup)

**Product requirement:** inventory correctness must not depend on barcode hardware, label printing, or a separate “barcode setup” phase.

- **Admin dump (export):** staff with **ADMIN** (or designated role) can **export** current catalog + per-warehouse **computed stock** (and optionally recent movements) as CSV/Excel—or “dump” a reconciliation sheet—for accountants, physical counts, or bulk review. Treat this as a **read-only** report from `get_product_stock` / selectors, not a second source of truth.
- **Admin-driven corrections:** when quantities need fixing after a count or data entry, **ADMIN** applies changes **only** via signed `InventoryMovement` rows (**+** receipt / opening / purchase-style increases, **−** damage / shrink / adjustment decreases), inside `transaction.atomic` + the existing movement creator—never by editing a cached `current_stock` column alone.
- **UI must reflect ledger truth:** after any admin action (dump is read-only; **adjustments** are writes), list/detail views and dashboards **re-fetch** stock from the API (or invalidate React Query / SWR keys) so on-hand numbers **immediately match** Σ(movements). POS search and low-stock widgets use the same read path so there is no drift between “admin screen” and “floor” stock.
- **No barcodes setup needed for this path:** SKU/name search and manual line entry remain valid; barcode wedge and `barcode_value` on `Product` can stay **optional** enhancements in Phase 2+. Do **not** block Phase 1 inventory or admin workflows on barcode generation, scanner pairing, or label templates.

---

## 2. Updated folder structure (suggested)

Backend (under each app):

```text
apps/api/
  core/                 # settings, urls, pagination, spectacular config
  users/
  inventory/
    models/
      __init__.py       # re-export models (optional incremental refactor)
      product.py
      movement.py
      service_item.py   # NEW
    services/
      movements.py      # split from services.py over time
      stock_queries.py
    selectors/
      products.py
    serializers.py
    views.py
    urls.py
  sales/
    models.py           # or split when large
    services/
      checkout.py       # extracted from monolithic services.py
      pricing.py
    selectors/
      sales.py
    serializers.py
    views.py
  invoices/
    models.py
    pdf/
      generator.py      # existing
      templates/        # HTML → PDF or ReportLab sections
    services/
      issue_invoice.py
  customers/            # NEW lightweight app OR nest under sales
    models.py
    serializers.py
    views.py
  reports/
    queries/
      dashboard.py
      ar_aging.py
  analytics/            # KPI caches / read aggregations
```

Frontend (`apps/web`):

```text
apps/web/
  app/(dashboard)/
    page.tsx                    # dashboard
    pos/                        # or keep app/pos — pick ONE route family
    inventory/
    customers/
    sales/
    reports/
    settings/
  features/
    pos/
      store/                    # Zustand cart + keyboard controller
      components/
      hooks/
    inventory/
    billing/
  components/
    ui/                         # existing primitives
    data-table/                 # reusable table
  services/                     # axios modules (already patterned)
  lib/api/
    client.ts
    types/                      # generated or hand-written from OpenAPI
```

**Rule:** `features/pos` owns cart + shortcuts; dashboard routes stay thin and compose hooks.

---

## 3. Backend model structure

### 3.1 Product (evolve existing `inventory.Product`)

You already have `sku`, `barcode_value`, `brand`, `category`, JSON `attributes`, pricing-related fields elsewhere (e.g. `ProductPricing` referenced in sales service). For tyre retail **without over-modeling**:

**Minimal additive columns (or JSON keys under `attributes`):**

- `tyre_size` – `CharField` **or** `attributes["tyre_size"]` (indexed via expression index if searched heavily)  
- `hsn_code` – align with GST invoice (may already exist on pricing—consolidate)  
- `gst_percent` – prefer **catalog default** on product or pricing table, snapshot on sale  
- `unit` – `PCS`, `SET`  
- `cost_price` / `purchase_price` – name per accountant preference; **never** use for tax; use for margin reports  
- `default_selling_price` – optional hint for POS autocomplete only  
- `minimum_stock_alert` – map to existing `low_stock_threshold` on store or add at product level for single-shop  
- `active` / `is_deleted` – already present in spirit  

**Indexes (PostgreSQL):**  
- `Trigram` / `GIN` on `(name, tyre_size, sku)` for POS search if dataset grows  
- btree on `(category, brand)` for reports  

### 3.2 InventoryMovement (extend existing)

You have: `product`, `warehouse`, optional `store`, `movement_type`, signed `quantity`, `reference_*`, `remarks`, `created_by`, `created_at`.

**Add for audit clarity (your spec):**

- `before_qty` / `after_qty` **per scope** (warehouse-level or store-level)—computed inside the same DB transaction **immediately before insert**  
- Optionally `unit_cost_snapshot` for PURCHASE (valuation)

**Movement types mapping:**

| Your name | Repo today |
|-----------|------------|
| OPENING_STOCK | `OPENING` |
| PURCHASE | `PURCHASE` |
| SALE | `SALE` |
| RETURN | `RETURN` / `RETURN_INWARD` (define one for customer return) |
| DAMAGE | `DAMAGE` |
| MANUAL_ADJUSTMENT | `ADJUSTMENT` |

Document enums in one `docs/inventory-ledger.md` so staff training matches code.

### 3.3 Customer (new)

- `id`, `name`, `mobile` (unique optional), `vehicle_number`, `gstin`, `address`, `created_at`  
- **Snapshot** on `Sale`: `customer_name`, `mobile`, `gstin`, … for immutability (you already snapshot several fields)

### 3.4 Sale / SaleItem / Payment (evolve existing)

**Sale** – extend toward your spec:

- `payment_status`: `PAID | PARTIAL | UNPAID` derived **or** stored (stored is faster for filtering; enforce consistency in service)  
- `paid_amount`, `due_amount` – store for reporting; update only via **service** when payments recorded  
- `discount`, `gst_total`, `grand_total` – align naming with frontend (`total` vs `grand_total`—pick one public name)  
- `sold_at` – use `created_at` or add explicit if you allow delayed posting  

**SaleItem** – align naming:

- `sold_price` ↔ existing `selling_price`  
- `purchase_price_snapshot` – new; copy from product cost at sale time  
- `is_service` + `service_item_id` nullable FK **or** service-only `product_id` pattern  

**Payment** ↔ `PaymentTransaction`:

- Keep `Payment`; add `notes` if missing  
- For **PARTIAL**: multiple `Payment` rows over time **or** one at sale + later `CreditPayment`—you already have credit payment tracking; **unify** semantics:  
  - At checkout: 0..N `Payment` lines that sum to `paid_amount`  
  - Later collections: `CreditPayment` **or** second table `SaleCollection`—pick one pattern and document  

### 3.5 ServiceItem (new)

- `service_name`, `default_price`, `gst_percent`, `hsn_code`, `active`  
- POS adds line: either creates ephemeral `SaleItem` with `service_item` FK, or maps to a dedicated `ServiceSaleItem`—**prefer single `SaleItem` table** with discriminant to keep reporting simple.

### 3.6 Invoice (existing `invoices.Invoice`)

Keep **1:1** `Sale` → `Invoice`. PDF reads only invoice snapshot fields.

---

## 4. API endpoint structure (`/api/v1/...`)

Group by resource; all list endpoints **paginated** (you have `core/pagination.py`).

| Area | Methods | Notes |
|------|---------|------|
| `/auth/` | existing | JWT/session as you have |
| `/inventory/products/` | CRUD | Staff read; Admin write (existing pattern) |
| `/inventory/movements/` | GET, POST | POST only for PURCHASE/OPENING/DAMAGE/ADJUSTMENT |
| `/inventory/stock/` | GET | Aggregations, low stock |
| `/sales/pos/search/` | GET | q, warehouse_id, limit |
| `/sales/checkout/` | POST | idempotency-key header/body |
| `/sales/{id}/` | GET | Detail + items + payments |
| `/sales/{id}/payments/` | POST | Partial collection (if allowed) |
| `/customers/` | CRUD | Mobile search |
| `/invoices/{id}/pdf/` | GET | File stream |
| `/reports/daily-sales/` | GET | date params |
| `/reports/pending-payments/` | GET | AR |
| `/analytics/dashboard/` | GET | KPIs |

**Spectacular:** tag by `inventory`, `sales`, `invoices`, `reports`; add examples for checkout payload.

---

## 5. Frontend page structure

| Route | Purpose |
|-------|---------|
| `(dashboard)/page.tsx` | KPIs, low stock, today sales, shortcuts (POS) |
| `(dashboard)/pos` **or** `app/pos` | Full-screen POS (pick one; redirect the other) |
| `(dashboard)/inventory` | List, filters, product drawer, stock entry |
| `(dashboard)/inventory/movements` | Ledger explorer |
| `(dashboard)/customers` | CRUD + search |
| `(dashboard)/sales` | Sales list, status, reprint |
| `(dashboard)/sales/[id]` | Immutable detail |
| `(dashboard)/reports/*` | Daily/monthly, AR, valuation |
| `(dashboard)/settings` | Business GSTIN, logo, invoice prefix, thermal toggle later |

**Desktop-first:** fixed min width on POS; responsive = usable tablet, not mobile-primary.

---

## 6. Zustand store structure (POS)

```text
features/pos/store/usePosStore.ts
  state:
    warehouseId: string | null
    searchQuery: string
    searchResults: ProductDTO[]
    cart: CartLine[]        // { lineId, productId, name, qty, unitPrice, gst%, discountLine? }
    customerDraft: { name?, mobile?, vehicle?, gstin? }
    billDiscount: { type: 'flat' | 'percent', value: number }
    payment: { mode, amount, split? }
    ui: { checkoutOpen, paymentStep }
  actions:
    addLine, updateQty, setUnitPrice, removeLine
    setCustomer, clearCart
    applyBillDiscount
    setPayment
    hydrateFromServer()   // rare
  getters (or selectors):
    taxableSubtotal, gstBreakup, grandTotal, paidDue
```

**Why Zustand over only React Context:** you already have `cart-context.tsx`; migrate for finer subscriptions and less re-render churn on every keystroke.

**Persistence:** optional `sessionStorage` for crash recovery; clear after successful sale.

---

## 7. POS workflow logic (step-by-step)

1. **Boot:** load `warehouseId`, business settings (GSTIN, logo URL), keyboard map.  
2. **Search:** debounced query → `/sales/pos/search/?q=`; support Enter to pick first result.  
3. **Add line:** default `unitPrice` = `default_selling_price` or last sold (optional, **never** forced); `gst%` from catalog.  
4. **Edit price:** any change only affects `cart[line].unitPrice`; recompute line GST per chosen tax model.  
5. **Bill discount:** apply after line totals aggregated (match backend order **exactly**).  
6. **Customer:** optional; autosuggest by mobile.  
7. **Payment:**  
   - CASH/UPI full → `paid = grandTotal`  
   - PARTIAL → `paid < grandTotal` → `payment_status=PARTIAL`  
   - CREDIT → `paid = 0` or small advance; remaining due  
8. **Submit:** `POST /sales/checkout/` with `idempotency_key` (uuid per attempt).  
9. **Success:** invalidate TanStack Query keys (`['sales']`, `['inventory-stock']`); open `/sales/[id]/print` or return `print_url`; trigger `window.open` for PDF.  
10. **Failure:** show server error; cart intact; same idempotency key if retrying same attempt.

**Keyboard map:**

- `Enter` – add / confirm quantity in search  
- `F2` – payment modal  
- `Ctrl+P` – print route (after sale)  
- `Esc` – clear search input (not entire cart—confirm destructive clears)

---

## 8. Invoice generation workflow

1. **Inside same atomic transaction** as sale completion **or** immediately after with a **“invoice pending” flag**—prefer **same transaction** for strict consistency.  
2. **Snapshot:** copy shop header from `BusinessSettings`; copy customer; copy lines with numbers already frozen.  
3. **Number:** single `select_for_update` sequence (year + counter).  
4. **PDF:** `Invoice` row persisted → call `invoices/pdf/generator.py` writing to `MEDIA` or inline buffer; store `pdf_path` or S3 key.  
5. **Response:** `{ sale_id, invoice_id, pdf_url, print_url }`.  
6. **Reprint:** idempotent GET of same PDF bytes (no regeneration unless template version bump).

**Amount in words:** pure function in backend (Indian numbering) for PDF + optional HTML print view.

---

## 9. DB relationship explanation

```text
Warehouse 1──* InventoryMovement *──1 Product
Product      1──* SaleItem *──1 Sale
Customer     1──* Sale (nullable FK)
Sale         1──* Payment
Sale         1──1 Invoice
ServiceItem  1──* SaleItem (optional FK)
```

**Immutability:** `Sale`, `SaleItem`, `Invoice`, `Payment` rows **append-only**; corrections = **return** movement + **credit note** sale (you have returns/credit notes paths—reuse for Phase 2 operational corrections).

---

## 10. Migration strategy

**Phases:**

1. **Additive migrations only:** new columns/tables; no destructive drops until backfill done.  
2. **Backfill:** `Customer` from distinct `(customer_mobile, customer_name)` on historical `Sale` if quality acceptable; else leave null.  
3. **Dual-write window (short):** if renaming fields, keep DB column stable and change DRF `source=`.  
4. **Invoice sequence unification:**  
   - Choose **either** `sales.InvoiceSequence` **or** `invoices.InvoiceSequence`  
   - Migrate counter max into one table; retire the other in code; DB migration to drop later  
5. **Tax fields:** add `cgst_amount`/`sgst_amount` on `SaleItem` with backfill from `gst_amount` for old rows (symmetric split disclaimer in migration notes).  
6. **Indexes:** `CREATE INDEX CONCURRENTLY` in production for large tables.

---

## 11. Transaction safety strategy

**Pattern for checkout (pseudocode level):**

```text
atomic():
  lock InvoiceSequence row
  validate stock again (sum movements) with FOR UPDATE on movement aggregate OR lock per-product rows via advisory lock keyed by product_id
  create Sale PENDING
  create SaleItems
  for each line: create_inventory_movement(SALE, -qty, reference=sale)
  create Payments
  update Sale status COMPLETED, payment fields
  create Invoice snapshot
  write PDF path
```

**Concurrency choices:**

- **Per-product advisory locks** (`pg_advisory_xact_lock`) for hot SKUs vs **warehouse batch lock**—for single shop, warehouse-level lock may be enough and simpler.  
- **Idempotency:** unique on `idempotency_key`; on conflict return existing sale (already modeled).

**DB constraints:**

- `CHECK (quantity > 0)` on sale items  
- `CHECK (paid_amount >= 0 AND due_amount >= 0)`  
- `UNIQUE (invoice_number)`  
- `EXCLUDE` or application rule: sum(payments) ≤ grand_total + tolerance for rounding—document rounding to paise  

**Negative stock:** already prevented in `create_inventory_movement` path—keep all deductions through it.

---

## 12. Suggested reusable components (frontend)

- **DataTable** – column defs, server pagination, empty/error states  
- **ConfirmDialog** – destructive actions  
- **MoneyInput** – INR formatting, integer paise internally  
- **GstBadge** – shows rate + split preview  
- **CustomerCombobox** – mobile search  
- **InvoicePreviewPanel** – HTML print layout separate from PDF  
- **KeyboardHelpDrawer** – F2/Ctrl+P hints  
- **ReportDateRange** – you have `DateRangePicker`—standardize  

---

## 13. Full development roadmap

**Phase 1a – Data model & money correctness**

- Unify invoice numbering  
- Add `Customer` + wire optional FK  
- Add `purchase_price_snapshot`, GST split fields, `payment_status` semantics  
- `ServiceItem` + POS line type  

**Phase 1b – Inventory UX**

- Stock entry screens calling movement API only  
- Low stock dashboard widgets (partially present)  
- **Admin:** stock/catalog **dump (export)** for reconciliation; **+ / −** adjustments only via movement API (typed `ADJUSTMENT` / `OPENING` / `DAMAGE` etc. as you standardize in §3.2)  
- **UI:** invalidate or refetch stock after admin adjustments so tables and POS-facing reads stay consistent with the ledger  
- **Explicitly out of scope for Phase 1b:** barcode printer setup, bulk barcode generation, or scanner-dependent workflows—optional later only  

**Phase 1c – POS**

- Zustand cart + keyboard layer  
- Checkout integration + auto print  

**Phase 1d – PDF / print**

- A4 template “Indian tyre invoice”  
- Print route  

**Phase 1e – Reports**

- Daily/monthly sales, pending payments, margin estimate = sold − cost snapshot  

**Phase 2** – optional barcode hardware / labels (not required for admin dump + manual +/-), WhatsApp, suppliers PO polish, thermal, multi-branch hardening.

---

## 14. Exact implementation order (ticket-sized)

1. Document tax policy (inclusive vs exclusive) in one ADR.  
2. Merge invoice sequence + remove duplicate usage.  
3. Migration: `Customer` + `Sale.customer` FK + snapshots.  
4. Migration: `ServiceItem`.  
5. Extend `SaleItem` snapshots + GST split.  
6. Align checkout service with new payment_status rules.  
7. POS Zustand store + search API.  
8. Checkout E2E test: stock insufficient → rollback.  
9. PDF template + amount in words.  
10. Reports endpoints reusing selectors.  
11. Frontend pages: customers, sales detail, print.  
12. Admin **stock dump** endpoint or report job + frontend download; **adjustment** UI wired to movement create; **cache invalidation** / refetch so UI reflects new balances after +/-.  
13. Spectacular examples + permission audit.

---

## 15. Production deployment checklist

- [ ] `DEBUG=False`, secure `SECRET_KEY`, `ALLOWED_HOSTS`  
- [ ] PostgreSQL backups + PITR  
- [ ] Migrations run with `CONCURRENTLY` indexes where needed  
- [ ] Media volume for PDFs (or object storage)  
- [ ] Nginx gzip only for JSON; PDF as `application/pdf`  
- [ ] CORS for Next.js origin only  
- [ ] Rate limit login / checkout  
- [ ] Structured logging (sale id, user id)  
- [ ] Sentry (optional)  
- [ ] Timezone `Asia/Kolkata` for `sold_at` and fiscal dates  
- [ ] **GSTIN** validation format (basic length/checksum)  
- [ ] Printer runbook: A4 PDF first; thermal later  

---

## 16. Risks and edge cases

| Risk | Mitigation |
|------|------------|
| **Dual stock systems** (variant ledger vs `InventoryMovement`) | Pick **product + warehouse** ledger as canonical for tyre POS; quarantine legacy paths |
| **Rounding** paise on split GST | Banker’s rounding policy; test 3 × ₹33.33 type lines |
| **Concurrent checkout same SKU** | Transactions + locks + idempotency |
| **Partial payment then void** | No void—use return/credit note workflow |
| **Customer GSTIN invalid** | Soft validate; allow blank B2C |
| **Duplicate mobile customers** | Merge tool later; for now `unique=False` + “pick existing” UX |
| **Large search result latency** | Index + limit 50 + server-side ranking |

---

## 17. Future scalability notes (no implementation now)

- **Branches:** `warehouse_id` / `store_id` already in movements—enforce in POS context  
- **WhatsApp:** post-commit task with PDF URL  
- **Barcode scanner (optional):** keyboard wedge works with existing search input when you add hardware; **not** a prerequisite for admin dump or manual +/- inventory  
- **Supplier PO:** already in repo—enable when inventory team ready  
- **Thermal:** second PDF template + smaller page size  
- **AI analytics:** read-only replica + nightly aggregates  

---

### Closing recommendation (architect → team)

Your repo **already matches the hardest part of the spec** (immutable sales + ledger movements + atomic services). The highest-value changes for the tyre-shop pivot are **(1)** tax/invoice clarity for Telangana PDFs, **(2)** a first-class **Customer** and **payment_status** UX, **(3)** **one invoice sequence**, **(4)** POS ergonomics (Zustand + keyboard), and **(5)** **admin export + ledger-only +/- corrections** with a **UI that always reflects** computed stock—**without** tying Phase 1 to barcode setup—without introducing new services or parallel stock mechanisms.

