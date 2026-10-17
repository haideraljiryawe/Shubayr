# Returns v2 operations

Returns are immutable documents linked to delivered orders. They do not edit
the original sale, collection, inventory issue, cash handover, or loyalty
entries. Any accounting correction uses a linked phase-3 reversal/correction
document; posted entries are never updated or deleted.

## Lifecycle and duties

1. A customer requests a return within `return_window_days`, or staff creates
   one with `returns.create`.
2. Staff with `returns.approve` approves exact quantities or rejects the
   request. A creator cannot approve their own staff-created return.
3. Staff with `returns.receive` records physical receipt.
4. Staff with `returns.inspect` chooses a location and classifies every
   approved line as sellable, opened, damaged, or expired.
5. Staff with `returns.refund` pays the refund from an IQD cash account or from
   documented cash still in delivery custody.

Every transition has an operation id, uses the Baghdad business-date helper,
respects closed periods, is audited, and is protected by the configured
separation-of-duties level.

## Amounts, inventory, and points

The order stores coupon, automatic-tier, loyalty, other-adjustment, and net
paid allocations per line. Successive returns consume deterministic unit (or
0.001 base-unit) segments of those snapshots. Current prices and current
product visibility are irrelevant. Refunds are capped at what the customer
actually paid and has not already been refunded.

Sellable and non-sellable goods first post `return_in` at the original custody
issue cost (`restock_issue_cost`). Opened, damaged, or expired goods go to a
non-sellable location and are then written down. A partly unpaid order applies
the goods return to the collection shortfall first
(`return_against_uncollected`). Cash payment uses `refund_payment`; a delivery
fee uses its separate `delivery_fee_refund` posting. A custody payment reduces
the linked party balance only after proof is recorded.

Earned points attributable to returned units are reversed. Redeemed points are
restored from the order-time allocation. If reversing earned points takes the
balance below zero, the deficit remains in the loyalty ledger for recovery
from future rewards and never becomes a cash deduction.

## Delivery fee policy

The default delivery-fee refund is the order's snapshotted fee, including a
confirmation adjustment, only when all ordered units are returned for defect,
wrong-item, or store-error reasons. Partial and change-of-mind returns default
to zero. `returns.refund_delivery_fee` permits a recorded exception. Across all
returns the fee can never be refunded more than once or exceed what was
charged.
