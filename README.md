# Quake

**Quake** is a private inventory & billing product for retail shops (built first for tyre / auto parts).

Each shop gets its **own space** — stock, customers, sales, and staff stay separate. Shops do not see each other’s data.

---

## What you can do

| Area | In plain words |
|------|----------------|
| **POS** | Sell at the counter, take payment, print bills |
| **Inventory** | Products, stock, warehouses / shops |
| **Customers** | Customer list, segments, follow-ups |
| **Sales & invoices** | Past bills and receipts |
| **Reports & analytics** | How the business is doing |
| **Users** | Shop owner invites staff (Admin vs Staff) |
| **Platform console** | Product owner turns modules on/off per shop |

---

## How to open the app

- Shop app: your deployed Quake URL (or local `http://localhost:3000`)
- Shop sign-in: `/login`
- Platform owner console: `/superadmin/login`

Code and day-to-day development live on the **`dev`** branch.  
This **`main`** branch is the simple project overview only.

---

## Login details (private repo)

Password for all seed accounts below: **`Kushal@12`**

| Who | Email | Where to sign in | What it’s for |
|-----|--------|------------------|---------------|
| **Platform owner** | `superadmin@tracquake.com` | `/superadmin/login` | Manage all shops & which features each shop gets |
| **Thirumala shop admin** | `admin@thirumalawheels.com` | `/login` | Full access inside the Thirumala business |
| **Thirumala staff** | `staff@thirumalawheels.com` | `/login` | Day-to-day POS / shop work for Thirumala |

New shops can also **sign up** at `/signup` — that creates a **new empty business** with that person as Admin.

---

## Simple mental model

1. **You (platform)** → `/superadmin/login` → turn features on/off for each organization → sign out → back to that login.
2. **Shop users** → `/login` → use POS / admin → sign out → back to shop login.

Those two sessions do **not** mix.

---

## Tech (one line)

Next.js web app + Django API + PostgreSQL. Full source: branch **`dev`**.

---

*Private project — Quake / TRAP inventory.*
