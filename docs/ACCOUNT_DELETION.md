# Customer account deletion and retention

`DELETE /api/v1/me/account` is available only to an authenticated customer app
session. It is refused with `409 ACCOUNT_DELETION_BLOCKED` while any of these
conditions exists:

- an order is not in a terminal `rejected`, `cancelled`, `delivered`, or
  `returned` state;
- a return is `requested`, `approved`, or `partially_approved`;
- a COD collection is unconfirmed or short, or a return refund remains an
  obligation.

The refusal has one error entry for each applicable group: `OPEN_ORDERS`,
`PENDING_RETURNS`, and `UNSETTLED_AMOUNTS`.

## Removed or anonymized

Successful deletion is one serializable database transaction. It:

- clears the user's name, phone, email, username and password hash;
- marks the retained user stub inactive and records `anonymized_at`;
- increments the session and permission versions, invalidating access tokens;
- deletes every refresh-token row, device-token row and saved address;
- deletes outstanding OTP records for the released phone number; and
- records `customer.account_delete` in the audit log without copying the old
  personal values into that log.

The old phone is no longer attached to the retained user stub. A later OTP
verification therefore creates a new customer with a new user ID; it does not
restore or expose the deleted account's history.

## Retained records and reasons

The following rows keep their original internal user/order foreign keys:

- orders, order items and immutable checkout shipping/contact snapshots;
- deliveries, collections, payments and accounting journal links;
- returns, refund obligations and inventory movements;
- loyalty ledger entries, reviews, notifications and audit events; and
- the inactive, identity-free user stub referenced by those rows.

They are retained to keep financial, inventory, tax/audit and fraud-control
history internally consistent. Posted documents and ledgers are immutable and
cannot be rewritten as an account-deletion shortcut. These retained records do
not make the old account sign-in capable, and the customer phone is reusable.
The immutable shipping snapshot remains staff-visible where operational or
audit access already permits it; delivery-agent detail hides recipient identity
and address after the delivery reaches `delivered` or `returned`.
