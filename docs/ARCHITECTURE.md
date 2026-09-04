# Shubayr — Architecture & Design Rules

This document is the technical north star. The full analysis (with all UML
diagrams) is in `Shubayr_Software_Engineering_Analysis_v2.pdf`. The database
contract is `../infra/db/schema.sql`.

## System shape

```
Customer / Delivery / Admin  ─┐
   Flutter (iOS/Android/Web)  │
                              ├──► Node.js REST API (/api/v1)
Public storefront (Next.js) ─┘      NestJS + TypeScript + Prisma
                                      ├──► PostgreSQL
                                      ├──► Redis (cache/BullMQ)
                                      ├──► Meilisearch (search)
                                      └──► FCM (push) · SMS (OTP)
```

- **One backend** serves all clients. Business logic lives in the backend only.
- **White-label:** identity (name, logo, colors, currency) is data in `store_settings`, loaded at runtime by every client.
- Payments are **Cash on Delivery** now, behind a pluggable `PaymentMethod` interface for later gateways.

## The 18 design rules (from the team review)

1. **White-label / generic** — the store's name and identity can change with no code changes.
2. **Interfaces** — Flutter for mobile (customer + delivery + admin) and Flutter Web for admin; Next.js for the public web store.
3. **RBAC** — detailed roles **and** permissions from day one (see `seed_rbac.sql`), enforced on every endpoint — not just Admin/Manager.
4. **Purchasing** — goods enter stock only via **Purchase Invoices** linked to a Supplier; never by editing stock directly.
5. **Inventory batches** — each purchase batch of the same item stays independent: quantity, purchase cost, entry date, LOT, and expiry.
6. **Warehouses & locations** — a batch is distributed across Warehouse → Zone/Aisle/Shelf/Bin, with the quantity known per location.
7. **Stock movements** — every purchase, sale, transfer, return, reservation or adjustment is a recorded movement. No silent balance edits — only a controlled, permissioned adjustment.
8. **FEFO** — items with expiry are drawn nearest-expiry-first, preserving batch dates.
9. **Order reservation** — accepting an order **reserves** quantity first (to stop double-selling); stock is not deducted until dispatch.
10. **Picking** — the system tells the warehouse worker exactly: item + quantity + warehouse + shelf + batch to pick.
11. **Costing & pricing** — keep each batch's cost and compute average cost; the sale price is separate from purchase cost and never changes automatically.
12. **Returns** — modeled from the start; a return can be sellable, opened, or damaged — not every return re-enters stock. **Partial returns allowed** (return an item and keep the rest).
13. **Loyalty points** — a points ledger/balance from the start; points are granted after delivery completes.
14. **Points negotiation** — the data model supports Negotiable + Floor/Limit + Points Cost now; the UI can follow later.
15. **Product reviews** — stars + comment tied to a **real order item** to block fake reviews.
16. **Delivery rating** — an independent rating of the delivery/agent after completion, never mixed with the product review.
17. **Audit trail** — sensitive operations are logged: inventory, prices, costs, purchases, returns, orders, and permission changes.
18. **Partial returns for the customer** — a customer may return one item and keep the rest; item-level returns are first-class.

## Order & stock lifecycle (how the rules combine)

1. Purchasing receives a **Purchase Invoice** → creates **batches** → places quantities into **locations** (`batch_stock`) → writes `purchase` **movements**.
2. Customer places a **COD order** → items validated against available (unreserved) stock.
3. Staff **confirm** → **FEFO reservation** picks nearest-expiry batches → `stock_reservations` (reserved, not deducted) → a **pick list** is generated.
4. Warehouse **picks** by the guided list → **dispatch** converts reservations to **sale** movements (now stock is deducted).
5. **Delivered** (cash collected) → payment `paid` → **loyalty points** awarded → customer can **review** the product and **rate** the delivery.
6. A **return** (possibly partial) is inspected; only **sellable** items are restocked (`return_in` movement); everything sensitive hits the **audit log**.

See the diagrams in `diagrams/` (rendered) and the report PDF for the full UML set.
