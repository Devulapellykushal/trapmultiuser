# MASTER IMPLEMENTATION PROMPT — QUAKE INVENTORY → TYRE SHOP ERP/POS (INDIA – TELANGANA)

You are a senior full-stack architect and production engineer.

We already have an existing monorepo project named **TRAP / Quake Inventory**.

Current stack:

* Frontend: Next.js 14 + TypeScript + Tailwind
* Backend: Django + DRF + PostgreSQL
* Existing apps:

  * inventory
  * sales
  * invoices
  * analytics
  * reports
  * notifications
  * users

Current repo structure already exists and MUST be reused and upgraded.
DO NOT rebuild from scratch.

The target business is:

* Tyre shop
* Wheel care
* Car wash
* Small tier-2/tier-3 Indian city
* Telangana GST billing
* Manual pricing business
* Fast POS workflow
* Local printer billing
* No online payment integration needed
* Very simple for shop owner
* Low-tech user friendly

We need:

* Inventory management
* Tyre stock tracking
* POS billing
* Sales tracking
* Pending payment tracking
* GST invoice printing
* Ledger style stock movement
* Invoice PDFs
* Barcode support later
* Proper accounting-like sales history

The UI and workflow should feel similar to:

* Simple local Indian billing software
* Fast keyboard-first POS
* Minimal clicks
* Easy for non-technical shop owners

VERY IMPORTANT:
DO NOT over-engineer.
DO NOT make enterprise complexity.
DO NOT add unnecessary microservices.
DO NOT add unnecessary abstractions.

We need:

* Clean architecture
* Maintainable code
* Production-ready
* Fast local usage
* Excellent DB structure
* Simple deployment

---

# CORE BUSINESS REQUIREMENTS

---

The tyre shop has:

* Tyres
* Tubes
* Alloy wheels
* Wheel balancing
* Alignment services
* Car wash services
* Misc services

Pricing behavior:

* No fixed MRP selling
* Owner manually decides selling price during billing
* Same product can sell at different prices daily
* That exact sold price MUST be stored permanently

Examples:
Tyre cost price:
₹4300

Sold to Customer A:
₹5000

Sold to Customer B:
₹4700

Sold to Customer C:
₹5200

All these should be tracked separately.

Inventory MUST decrease correctly.

Sales reports MUST use actual sold prices.

---

# MOST IMPORTANT BUSINESS LOGIC

---

We need PERFECT inventory ledger tracking.

Inventory should NEVER directly update magically.

Instead:

* Every stock change must create movement entries.

Movement types:

* PURCHASE
* SALE
* RETURN
* DAMAGE
* MANUAL_ADJUSTMENT
* OPENING_STOCK

Stock should be computed from movements.

This is CRITICAL.

---

# DATABASE DESIGN REQUIREMENTS

---

Design proper PostgreSQL schema.

Need these models minimum:

## Product

Fields:

* id
* sku
* barcode
* product_name
* brand
* tyre_size
* category
* unit
* hsn_code
* gst_percent
* purchase_price
* default_selling_price (optional only)
* current_stock
* minimum_stock_alert
* active
* created_at
* updated_at

## InventoryMovement

Fields:

* id
* product
* movement_type
* quantity
* before_stock
* after_stock
* reference_type
* reference_id
* notes
* created_by
* created_at

## Customer

Fields:

* id
* name
* mobile
* vehicle_number
* gst_number
* address
* created_at

## Sale

Fields:

* id
* invoice_number
* customer
* subtotal
* discount
* gst_total
* grand_total
* payment_status
* payment_method
* paid_amount
* due_amount
* notes
* created_by
* sold_at

## SaleItem

Fields:

* id
* sale
* product
* quantity
* purchase_price_snapshot
* sold_price
* gst_percent
* gst_amount
* total_amount

IMPORTANT:
sold_price MUST be manually entered at POS.

## PaymentTransaction

Fields:

* id
* sale
* amount
* payment_mode
* notes
* created_at

## ServiceItem

For:

* wheel alignment
* balancing
* car wash
* nitrogen filling
  etc.

Fields:

* id
* service_name
* default_price
* gst_percent

---

# POS REQUIREMENTS

---

Build VERY FAST POS flow.

POS should support:

## Product Search

* Search by:

  * name
  * tyre size
  * barcode
  * SKU

## Cart Behavior

Owner can:

* add item
* increase qty
* reduce qty
* manually change selling price
* add discount
* remove item

## Important:

Selling price is editable ALWAYS.

## Billing Flow

1. Add products
2. Enter custom price
3. Add customer details optional
4. Select payment:

   * CASH
   * UPI
   * PARTIAL
   * CREDIT
5. Click COMPLETE SALE
6. Inventory reduces
7. Invoice generates
8. Printable invoice opens automatically

---

# PAYMENT STATUS LOGIC

---

Need statuses:

* PAID
* PARTIAL
* UNPAID

Examples:

Grand total:
₹10000

Customer pays:
₹6000

Then:

* status = PARTIAL
* due = ₹4000

Need:

* due tracking
* pending payment list
* collection history

---

# GST + INDIA REQUIREMENTS

---

System should support:

* CGST
* SGST
* Telangana GST invoices

Need:

* HSN code support
* GST percentage per product
* Tax breakup in invoice PDF

Invoice should look like:

* Local Indian tyre shop invoice
* Similar to attached image

Invoice needs:

* Shop logo
* Shop address
* GSTIN
* Customer info
* Item table
* Qty
* Rate
* GST
* Total
* Grand total
* Amount in words
* Payment status

---

# PDF + PRINTING REQUIREMENTS

---

When sale completes:

* Generate PDF invoice
* Open printable invoice page automatically

Need:

* Thermal printer support later
* A4 invoice support now

Backend:

* Generate PDFs server-side

Frontend:

* print button
* download PDF button

---

# INVENTORY FEATURES

---

Need pages:

## Inventory Dashboard

* total stock value
* low stock items
* recent movements
* top selling tyres

## Stock Entry

Owner can:

* add purchase stock
* opening stock
* damaged stock

This MUST create inventory movement records.

## Low Stock Alerts

If stock < minimum_stock_alert:
show warning.

---

# REPORTS REQUIRED

---

Need:

* Daily sales
* Monthly sales
* Profit estimation
* Best selling products
* Pending payments
* Inventory valuation
* Fast moving tyres
* Dead stock

---

# FRONTEND REQUIREMENTS

---

Use existing Next.js app.

Need:

* Modern UI
* Very fast
* Minimal clicks
* Desktop-first
* Mobile responsive basic

Pages needed:

* Dashboard
* POS
* Inventory
* Customers
* Sales
* Reports
* Settings

Use:

* TanStack Query
* Zustand for POS cart state
* Axios
* Tailwind

---

# POS UI REQUIREMENTS

---

POS must behave like real billing software.

Keyboard optimized:

* Enter → add product
* F2 → payment modal
* Ctrl+P → print
* Esc → clear search

Need:

* left side product search
* right side cart summary

Cart should update totals instantly.

---

# BACKEND API REQUIREMENTS

---

Need proper DRF APIs.

Use:

* serializers
* service layer
* transactions.atomic()

IMPORTANT:
Sale completion MUST be atomic.

Meaning:
If inventory fails:
sale should rollback.

Need endpoints for:

* products
* stock movements
* customers
* sales
* invoices
* reports
* dashboard

---

# CRITICAL BUSINESS SAFETY RULES

---

NEVER allow:

* negative stock
* duplicate invoice numbers
* partial DB updates

Need:

* DB constraints
* transactions
* validations

---

# AUTH REQUIREMENTS

---

Simple roles:

* ADMIN
* STAFF

Staff:

* can create sales
* cannot delete invoices

Admin:

* full access

---

# DEPLOYMENT REQUIREMENTS

---

Need:

* Docker support maintained
* PostgreSQL
* local development easy
* production-ready env structure

---

# CODE QUALITY REQUIREMENTS

---

Need:

* scalable folder structure
* clean architecture
* reusable components
* TypeScript strict mode
* proper API typing
* no spaghetti code

---

# UI/UX REQUIREMENTS

---

Theme:

* Clean
* Professional
* Indian retail software style
* Fast loading
* Minimal animations

Need:

* loading skeletons
* proper empty states
* toast notifications
* error boundaries

---

# FUTURE READY FEATURES

---

Architecture should allow future additions:

* WhatsApp invoice sending
* barcode scanning
* multiple branches
* supplier management
* purchase orders
* thermal printing
* analytics AI

But DO NOT implement now.
Only keep architecture extendable.

---

# WHAT TO BUILD NOW

---

PHASE 1:

* Inventory
* POS
* Billing
* Sales tracking
* GST invoice PDF
* Pending payment tracking
* Reports basic

PHASE 2 later:

* barcode
* whatsapp
* advanced analytics
* supplier management

---

# IMPORTANT IMPLEMENTATION INSTRUCTIONS

---

1. Reuse existing apps wherever possible.
2. Upgrade current models safely.
3. Create migrations carefully.
4. Do NOT break current architecture.
5. Maintain existing coding standards.
6. Keep APIs clean and documented.
7. Add Swagger docs.
8. Use PostgreSQL indexes properly.
9. Add pagination everywhere.
10. Add filtering/searching.

---

# FILE STRUCTURE EXPECTATIONS

---

Need suggestions for:

* backend service layer
* invoice PDF service
* POS Zustand store
* API client structure
* reusable table components
* reusable modal components
* report utilities

---

# FINAL OUTPUT REQUIRED FROM YOU

---

Now generate:

1. Complete implementation architecture
2. Updated folder structure
3. Backend model structure
4. API endpoint structure
5. Frontend page structure
6. Zustand store structure
7. POS workflow logic
8. Invoice generation workflow
9. DB relationship explanation
10. Migration strategy
11. Transaction safety strategy
12. Suggested reusable components
13. Full development roadmap
14. Exact implementation order
15. Production deployment checklist
16. Risks and edge cases
17. Future scalability notes

Give extremely detailed production-grade implementation guidance.

DO NOT skip details.
DO NOT give generic explanations.
DO NOT simplify architecture thinking.

Act like senior architect designing a real Indian tyre shop ERP/POS system.
