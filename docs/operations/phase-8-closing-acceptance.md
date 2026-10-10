# Phase 8 closing acceptance

Contract version: 14.0.0. Task C10 changes the API contract but adds no database
migration.

## Automated business-day pack

`backend/test/phase8-closing.acceptance.mjs` runs only against the
runner-owned loopback API and a dedicated disposable
`shubayr_<random>_verify` database. It performs no direct database reads or
writes. The pack covers one connected day containing:

- local-currency and USD purchase invoices received into stock;
- an IQD-account payment of a USD supplier invoice using an explicit rate;
- customer orders including accepted price changes and a 1.25 kg line;
- internal-agent dispatches and a customer-paid-fare external-driver trip;
- full, short, initially unconfirmed/full, and initially unconfirmed/short
  deliveries;
- failed delivery followed by retry and delivery, plus failed delivery followed
  by retrieval;
- party-borne lost goods, an uncollected return at the door, and a delivery-fee
  refund;
- a receipt split over several orders with its remainder allocated later, and a
  separate receipt reversed by a second user;
- trip settlement with an IQD 2,000 cash difference; and
- events immediately before and after midnight in `Asia/Baghdad`.

At closing, the pack asserts the balanced ledger and trial balance, warehouse
lot value against inventory account 1000, all-party goods and cash custody
against accounts 1010 and 1020, supplier balances against AP control 2000,
receipt-queue remainders against the overall and per-party receipt subledger
reconciliation, and gap-free document numbers per exercised series. It also
checks stable refusal codes, receipt sorting, independent cash-activity paging,
and actor display names. It then replays every posting request
with the same operation ID and proves that the original response, balances,
lots, custody, supplier balances, receipt remainders, and journal numbers do not
change.

The acceptance runner gives this pack its own clean database because the pack
creates the USD rate needed by its purchase and payment. The older financial
core pack intentionally tests the missing-rate state and therefore continues
to run in the legacy acceptance database.

## Small defect fixed

The existing `delivery_fee` store setting was validated and stored but cart and
checkout pricing always used a hard-coded zero. That made a genuine
delivery-fee refund impossible through the public and admin endpoints unless a
test bypassed the API. Cart calculation, cart reads, and checkout now use the
configured fee. Existing response fields and request shapes are unchanged.

## Original C9 finding

### Unallocated receipts have no separate GL account

The requested equality “unallocated receipts = their ledger account” cannot be
asserted under contract 13.4.0 because no such account or posting exists. A
cash receipt records the entire physical handover as a debit to the selected
cash account and a credit to cash-in-custody account 1020. Receipt allocations
settle collection subledger rows; allocating a remainder later creates no
additional journal entry.

Reproduction through the API:

1. Complete and confirm collections for two COD orders held by one delivery
   party.
2. `POST /admin/cash-receipts` with an amount larger than its initial
   allocations.
3. Observe the remainder in `GET /admin/cash-receipts/unallocated` and on the
   active voucher.
4. Read its journal entry through `GET /admin/ledger/entries`: the full voucher
   is already debit cash / credit 1020, with no unallocated-receipt line.
5. Allocate the remainder through
   `POST /admin/cash-receipts/{id}/allocations`; the subledger remainder changes
   but the ledger does not.

The closing pack therefore verifies the two balances the current model
actually defines: the unallocated queue equals active voucher remainders, and
physical party cash equals account 1020. Adding a distinct unallocated-receipt
control account would change the accounting model, posting maps, contract,
migration, historical treatment, and reconciliation reports, so it is recorded
as a finding rather than implemented as a closing-task workaround.

## C10 decision: reconcile the subledger, not another GL account

Contract 14.0.0 keeps the current accounting model. An unallocated amount is
allocation state on cash the store already received; it is not cash in another
place. Creating a separate GL account would double-classify the handover that
already debited store cash and credited cash-in-custody account 1020.

Authorized staff can now read
`GET /admin/cash-receipts/reconciliation`. For every delivery party and for all
parties together, it reports and proves:

`total receipts - active allocations - full reversed receipts = total unallocated`

The closing acceptance pack asserts this formula, matches its result to the
unallocated-voucher queue, and snapshots it across operation replays. Physical
party cash continues to reconcile to GL account 1020. No new account, posting
map, historical rewrite, or database migration is introduced.
