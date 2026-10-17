# Expenses (phase 11)

Contract: API 17.1.0. These routes are Web Admin-only; no customer or mobile
shape changed.

## Accounting model

An expense starts as a draft and stores its category, original-currency amount,
effective central exchange rate, IQD value, business date and payee snapshot.
Posting is immutable:

- paid now: debit the category's expense GL account and credit the selected
  same-currency cash/bank account;
- owed: debit the category's expense GL account and credit accrued expenses
  payable (`2040`);
- later payment: debit `2040` and credit the selected cash/bank account. Partial
  payments retain numbered payment documents and expose the remaining balance.

A correction never edits or deletes posted rows. It creates a numbered reversal
document and reversing journal for the original posting and every payment. The
ledger therefore retains the complete history needed by profitability reports.

All four document writes require `Idempotency-Key`. Reusing a key with the same
actor, route and payload returns the saved result; using it for a different
payload is refused. Business and accounting dates use the Asia/Baghdad helper,
the configured 90-day back-dating window and closed-period enforcement.

## Categories and permissions

The bootstrap migration seeds reference data only: the eleven common categories
and their expense GL accounts. It creates no expense transactions. A category
in use can be renamed or deactivated but cannot be deleted or remapped to a
different account.

Permissions are:

- `expenses.read`
- `expenses.create`
- `expenses.post`
- `expenses.pay`
- `expenses.reverse`
- `expense_categories.manage`

The owner/admin preset receives all permissions. Accountant receives only
create and read. Order, stock, catalog, cashier and operations presets receive
none. In strict separation-of-duties mode, the expense creator cannot post, pay
or reverse that expense; the actor always comes from the authenticated session.

## Receipts and privacy

`POST /admin/expense-receipts` accepts the same validated image formats and
size limit as product media, plus PDF. Expense receipts use a private object-key
prefix. The public `/media/{id}` route deliberately returns 404 for them; only
staff with `expenses.read` can download a receipt after it is linked to an
expense. Uploads and every expense/category write are audited.

## Reads and launch gating

The expense list is database-paginated and supports date, category, status,
cash account, payee, unpaid-only and text filters with stable sorting. Totals
are calculated in IQD for posted, non-reversed documents overall and by
category. Detail reads include the source journal, payments and corrections.

`expenses` is a valid Web Admin module key. It is intentionally omitted from
`.env.production.example` so it stays off at launch until the separate Admin UI
is delivered. The backend has no presentation-module gate; API permissions are
the enforcement boundary.
