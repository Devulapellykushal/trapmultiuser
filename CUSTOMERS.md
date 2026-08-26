# Customers — Business Guide

How customer identity works in Quake / TRAP — written for owners, managers, and counter staff. No technical detail required.

**Scope:** Customer cards belong to **your business (organization)** only. Another shop’s customers never appear in your directory or POS match prompts.

---

## Why this exists

Every bill can capture a buyer. Over time you want:

- One place to see **who** bought, how often, and what they owe  
- Clean lists for **credit follow-up**, loyalty, and WhatsApp  
- No duplicate “Kushal / K K Reddy / Reddy” rows for the **same mobile**

The rule is simple: **one person, one card** — keyed mainly by mobile (and email when you have it).

---

## The golden rule

| Contact | Meaning |
|--------|---------|
| **Same mobile** | Same customer |
| **Same email** | Same customer |
| **Different name, same mobile** | Still the **same** customer |

**Mobile is slightly stronger than email.**  
If a number points to one person and an email points to another, the system keeps the **mobile** person’s card and folds the other into it.

**Name alone does not create a new person** when a mobile or email is already known. Alternate bill names can be noted (e.g. “Also billed as: …”) without splitting history.

Walk-ins with **no** mobile and **no** email are weak identities — prefer taking a mobile at the counter whenever you can.

---

## At the counter (POS)

When the cashier enters or scans a mobile (or email) that already exists:

1. A clear prompt appears, for example:  
   **“This mobile exists with Kushal.”**
2. The cashier must choose one:
   - **Use Kushal** — bill under that customer (history stays together)  
   - **Enter another mobile / email** — clear that field and type a different contact  
3. Tapping outside the prompt does **not** close it.  
4. **Continue to Payment** waits until they choose (or change the contact).

You **cannot** invent a second customer on the same number. That protects credit, returns, and outreach.

**Skip** is for sales where you deliberately don’t attach a customer — not a way around an existing mobile match.

---

## What owners see in the app

Under **Customers** you get three areas:

| Area | Purpose |
|------|---------|
| **Directory** | Search, open profiles, see purchase history, add or edit contacts |
| **Segments** | Ready-made groups (credit outstanding, repeat buyers, GSTIN / fleet, lapsed, new this month, etc.) |
| **Outreach** | Channel setup (including WhatsApp) for follow-ups and campaigns |

Past invoices that weren’t linked can be brought into the directory with **sync from sales**, so history catches up to the same mobile/email rules.

---

## Everyday examples

**Same phone, different spellings**  
Cashier types “Rahul” on Kushal’s number → system says the mobile belongs to Kushal → use Kushal or enter another number. One card, full history.

**New walk-in**  
New mobile, no match → continue; a customer card is created/updated from the bill details.

**Email-only match**  
Email already on file → same style of prompt (use that person, or enter another email). Mobile still preferred when both conflict.

**Fleet / GST buyers**  
GSTIN lives on the customer card; segments help you find those accounts quickly.

---

## What this is not

- Not a separate “guest vs member” program — contact is identity.  
- Not “two people share one phone as two CRM cards” — one phone, one card.  
- Not a promise that every old paper bill is perfect until you sync / link sales.

---

## One-line summary

**Same mobile or email = one customer. Mobile wins if they disagree. At the counter: use that person, or change the number — never split the same contact into two.**

---

*For engineering detail, see `docs/adr/0002-customer-identity-mobile-email.md` and organization tenancy in `docs/adr/0003-organization-tenancy-rbac.md`.*
