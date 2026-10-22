# Release 1 owner UAT — English

Build/tag: `________________`  Commit: `________________`  Date: `____ / ____ / ______`

Owner representative: `________________`  Environment: `________________`

Run this script against the real Web Admin and store using a release tag whose
automated evidence is green. Use test records, never a customer's real phone or
money. The launch module set is `catalog, stock, orders, settings, users,
purchasing, finance, deliveryParties, cashReceipts, returns, expenses, reports,
audit`.

For every scenario, tick exactly one result and record the person who ran it.

## UAT-01 — Owner/admin setup and access

Role: owner/admin.

Steps:

1. Sign in, review store/public settings, Baghdad business hours, governorates,
   delivery zones and discount tiers.
2. Create a temporary staff user for each role used below, assign the smallest
   preset, then remove one permission while that user is signed in.
3. Confirm the permission disappears immediately and that Audit records every
   setup change.

Expected: only permitted navigation/actions appear; direct forbidden URLs show
the 403 page; public settings contain no invented contact values.

Result: ☐ Pass ☐ Fail  Notes: `________________________________________`

Tester/signature: `________________`  Owner sign-off: `________________`

## UAT-02 — Catalog editor and storefront

Role: catalog editor; verify in the public store as a guest.

Steps:

1. Create a category, brand, product and two variants (for example 128GB and
   256GB), with Arabic/English names, different SKUs and prices.
2. Add an image, keep the product hidden, verify it is absent publicly, then
   publish it.
3. Search publicly by name/SKU and verify Arabic/English fallback and the
   per-product order limit.
4. Confirm the editor cannot see costs without `cost.view`.

Expected: variants remain distinct; publishing makes the product visible once;
stored Admin translations are not silently copied; public fallback is usable.

Result: ☐ Pass ☐ Fail  Notes: `________________________________________`

Tester/signature: `________________`  Owner sign-off: `________________`

## UAT-03 — Stock controller: opening, average cost and locations

Role: stock controller.

Steps:

1. Receive 10 units of one SKU at 10,000 IQD and another 10 at 12,000 IQD.
2. Confirm quantity 20, value 220,000 and moving average 11,000.
3. Issue/deliver 3 units through UAT-06. Confirm issue cost 33,000 and remaining
   quantity/value 17 / 187,000; original lot costs remain 10,000 and 12,000.
4. Create a five-row purchase with default A-01, override row 3 to B-02, change
   the default to A-03 before saving, and post.

Expected: four rows arrive at A-03, row 3 at B-02; no negative stock, pooled
variant cost or rewritten lot history.

Result: ☐ Pass ☐ Fail  Notes: `________________________________________`

Tester/signature: `________________`  Owner sign-off: `________________`

## UAT-04 — Restock owed and paid now

Role: purchasing/stock controller and, where SoD requires, a second approver.

Steps:

1. Restock one item as owed; verify stock increases, the supplier invoice is
   open and cash is unchanged.
2. Restock another item with **Pay full server total**; include a landed cost.
3. Repeat the same operation/idempotency request.
4. Save an unrelated draft, post another invoice, and reopen the draft.

Expected: paid-now invoice, payment and allocation are atomic and appear once;
the unrelated draft remains; owed/paid balances are visible to the operator but
unit costs remain permission-protected.

Result: ☐ Pass ☐ Fail  Notes: `________________________________________`

Tester/signature: `________________`  Owner sign-off: `________________`

## UAT-05 — Supplier allocation and FX worked examples

Role: purchasing plus cashier/accountant.

Steps:

1. Post IQD invoices for 100,000, 70,000 and 50,000.
2. Pay 150,000, allocating 100,000 + 50,000 + 0. Confirm remainders 0,
   20,000 and 50,000 (total 70,000).
3. Correct the second invoice down by 10,000. Confirm its remainder 10,000,
   total debt 60,000 and the real payment still 150,000.
4. Post 100 USD at rate 1,500. Pay 40 USD using 62,000 IQD at 1,550. Confirm
   FX loss 2,000 and remaining 60 USD / 90,000 IQD.
5. Repeat on a new invoice at 1,450 using 58,000 IQD; confirm FX gain 2,000.

Expected: statements, AP and journals match every figure; inventory cost stays
at the invoice rate.

Result: ☐ Pass ☐ Fail  Notes: `________________________________________`

Tester/signature: `________________`  Owner sign-off: `________________`

## UAT-06 — Customer checkout, phone confirmation and fee change

Roles: customer in the store; order handler in Admin.

Steps:

1. Select a served governorate; verify the cart fee and total match checkout.
2. Place the order twice using the same idempotency request; verify one order.
3. As staff, try to confirm without calling/contact evidence; expect refusal.
4. Phone the customer. Confirm with `customer_contacted`, a short note, and a
   permitted delivery-fee change/reason.
5. Verify the customer's inbox shows the new total.

Expected: zone fee is snapshotted, the fee changes only before dispatch, and
the adjusted total is the collection/receipt/revenue total.

Result: ☐ Pass ☐ Fail  Notes: `________________________________________`

Tester/signature: `________________`  Owner sign-off: `________________`

## UAT-07 — Courier-company handover, delivery and cash receipt

Roles: order handler and cashier. Use a `courier_company` party with company
name, phone and optional contact person; no courier login/app is involved.

Steps:

1. Prepare the order, hand it to the courier company and print/read the custody
   document.
2. Mark delivery and confirm the collected amount.
3. For orders A=100,000 and B=50,000, receive 120,000 allocated 100,000 to A
   and 20,000 to B. Confirm A settled and B/party remainder 30,000.
4. Receive the final 30,000 for B.

Expected: goods issue once; two vouchers remain visible; custody goes 150,000
→ 30,000 → 0; destination cash rises by exactly 150,000.

Result: ☐ Pass ☐ Fail  Notes: `________________________________________`

Tester/signature: `________________`  Owner sign-off: `________________`

## UAT-08 — Return, inspection and refund

Roles: customer/store; return reviewer; stock controller; cashier.

Steps:

1. Sell two units totalling 20,000 with a distributed discount of 2,000.
2. Request one unit within the return window; approve, receive and inspect it
   as sellable.
3. Refund from an eligible cash account.
4. Repeat with a 0.25 kg return from a delivered 1.5 kg weight line and inspect
   damaged stock into the non-sellable path.

Expected: first refund is exactly 9,000 and the kept unit remains 9,000;
original issue cost returns to inventory; points are reversed/restored; damaged
stock is written down; over-return/replay is refused or idempotent.

Result: ☐ Pass ☐ Fail  Notes: `________________________________________`

Tester/signature: `________________`  Owner sign-off: `________________`

## UAT-09 — Expense and prepaid expense

Roles: expense creator and separate poster/payer when strict SoD is enabled.

Steps:

1. Record 300,000 IQD rent as owed; post it and pay 100,000.
2. Confirm expense 300,000, paid 100,000, liability 200,000.
3. Pay 200,000 in the next open month; confirm no second expense.
4. Record a six-month prepaid rent and post its schedule; run/catch up a due
   installment, then cancel the remaining schedule by correction.

Expected: drafts have no ledger effect; posted records are immutable; expense,
prepaid asset, payable and cash reconcile after every step.

Result: ☐ Pass ☐ Fail  Notes: `________________________________________`

Tester/signature: `________________`  Owner sign-off: `________________`

## UAT-10 — Month close and corrections

Role: owner/accountant with period permission.

Steps:

1. Review the close checklist and reconciliation differences; close the test
   month.
2. Try to post an expense, dispatch and correction into that month.
3. Pay an old open invoice in the current period and compare the old as-of
   report.
4. Reopen with permission/reason, inspect the difference log, then re-close.

Expected: back-dated postings into the closed month are refused; current-period
settlement is allowed without rewriting history; next-period opening balances
and the re-close difference reconcile.

Result: ☐ Pass ☐ Fail  Notes: `________________________________________`

Tester/signature: `________________`  Owner sign-off: `________________`

## UAT-11 — Reports, dashboard and exports

Roles: owner/accountant; repeat profitability with a user lacking
`reports.profit.read`.

Steps:

1. Compare sales, profitability, P&L, trial balance, balance sheet, cash,
   custody, liabilities, inventory valuation, purchases, supplier statement,
   stock movement and expenses reports to their source documents.
2. Confirm trial-balance debit equals credit and dashboard tiles link to the
   filtered lists.
3. Download one Arabic CSV and one XLSX; open them in Excel.
4. Confirm the no-profit-permission user cannot see costs/margin.

Expected: totals reconcile, open-period notice is correct, drill-downs open the
right documents/journals, Arabic text is readable, and cost remains protected.

Result: ☐ Pass ☐ Fail  Notes: `________________________________________`

Tester/signature: `________________`  Owner sign-off: `________________`

## UAT-12 — Backup, restore and service health

Role: production operator/owner.

Steps:

1. Run a labelled backup and `backup-now.sh --list`; record target bytes.
2. Run `test-restore.sh` and confirm `RESTORE TEST PASSED`.
3. Check API, worker, store, Admin, database, Redis, object storage and backup
   health; review the backup heartbeat.
4. Review the rollback target and rehearse the documented no-database rollback
   decision without touching production data.

Expected: off-site backup and media restore match; no secret is logged; an
unhealthy service follows the operations runbook.

Result: ☐ Pass ☐ Fail  Notes: `________________________________________`

Tester/signature: `________________`  Owner sign-off: `________________`

## Explicit exclusions

- Delivery-agent mobile application and agent wages/netting: excluded by the
  2026-10-12 and 2026-10-17 decisions.
- External-driver trip and custody-exception Admin add-ons (`trips`, `custody`):
  automated backend rules remain proven, but these modules are off in the
  launch module set and are not owner launch UAT.

## Final Release 1 sign-off

All scenarios passed: ☐ Yes ☐ No

Open observations/accepted risks: `________________________________________`

Owner name/signature: `________________`  Date: `________________`

Technical witness/signature: `________________`  Date: `________________`
