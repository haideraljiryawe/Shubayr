# Expenses (phase 11)

Introduced in API 17.1.0 and extended in 17.6.0. These routes are Web
Admin-only; no customer or mobile expense shape changed.

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

## Prepaid schedules

A paid-now expense can use `recognition_mode=prepaid` with a start date and
2-120 monthly periods. Posting debits prepaid-expense asset `1060` and credits
the selected cash account. The worker divides the exact IQD amount across the
periods, places any decimal remainder in the last period, and posts each due
portion from `1060` to the category expense account.

Installments use stable operation ids and row locks, so worker retries and
downtime catch-up cannot post a month twice. A due month in a closed period is
marked blocked and is never silently shifted. Cancelling a schedule creates a
correction that credits prepaid expense and restores the unrecognised balance
to the original cash account; already recognised months remain immutable.

## Owner money

Owner capital deposits and drawings use the same date, currency, audit,
idempotency and separation-of-duties rules as expenses. Deposits debit cash and
credit owner capital (`3000`); drawings debit owner drawings (`3010`) and credit
cash. Posted documents can only be reversed. Transfers between cash accounts
continue to use the existing phase-3 cash-transfer endpoints rather than a
second implementation.

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
