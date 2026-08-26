# ADR 0002: Customer CRM identity — mobile OR email (mobile preferred)

## Status

Accepted

## Context

At a tyre counter, cashiers often type a mobile, sometimes an email, and names vary (“Kushal”, “K K Reddy”, vehicle-owner vs payer). Creating a new CRM row for every slightly different name on the **same phone** duplicates history and breaks loyalty / credit / WhatsApp outreach.

We need one durable person identity without forcing a hard DB `UNIQUE` constraint on blank phones (B2C walk-ins may lack contacts).

## Decision

1. **Logical uniqueness:** same **mobile** (canonical digit key, typically last 10) **OR** same **email** (case-insensitive) → **one** `Customer` row.

2. **Priority:** both keys matter; **mobile has priority** when they conflict:
   - Lookup / upsert finds by phone first, then email.
   - If phone matches customer A and email matches customer B → **merge B into A** (phone winner).
   - If email-only match already has a different phone → **keep the existing phone** (do not overwrite with a conflicting new number).

3. **Name is not a uniqueness key** when phone or email is present. Alternate billed names may be recorded as notes (“Also billed as: …”).

4. **Name-only buyers** (no phone, no email) may match among other contact-less rows by normalized name — weak identity; prefer capturing mobile at POS.

5. **POS UX:** on live lookup / Continue, if contact exists → cashier must **Use {name}** or **enter another** mobile/email. Outside click does not dismiss. Same contact cannot be treated as two people in the UI.

6. **Sale snapshots** remain immutable (`customer_name`, `customer_mobile`, …); CRM link uses `customer_id` / sync / `QuerySet.update` where needed.

## Consequences

- Implementation: `apps/api/customers/services.py` (`find_existing_customer`, `upsert_from_checkout`, `merge_duplicate_customers`).
- POS: `apps/web/components/pos/checkout-modal.tsx` match prompt.
- Sync: `sync_customers_from_sales` / CRM sync endpoints collapse duplicates by the same rules.
- DB may still allow duplicate digit strings until merge/sync; **application services** are the source of truth for identity.

## References

- [CUSTOMERS.md](../../CUSTOMERS.md) — business guide
- `customers/views.py` — `lookup`, `upsert`
- ADR 0001 — tax policy (orthogonal)
- ADR 0003 — organization tenancy (CRM identity is **per organization**)
