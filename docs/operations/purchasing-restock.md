# Purchasing and restock operations

## Draft ownership

A posted purchase removes a saved purchase-invoice draft only when the request
includes that draft's `draft_id`, and only when the draft belongs to the caller.
Posting from another tab or from the Restock shortcut without `draft_id` leaves
the user's unfinished draft unchanged.

## Paid now

`POST /admin/purchase-invoices/paid-now` is the atomic **Save and add to stock,
paid now** operation. It requires both `purchases.create` and
`supplier_payments.record`, plus an `Idempotency-Key`. The invoice, stock lots,
movements, payable, cash payment, allocation and both journal entries commit in
one database transaction. Any validation or payment failure rolls everything
back. Repeating the same key and payload returns the original result; changing
the payload for a used key is refused.

Strict separation of duties does not allow the same person to create the
purchase and approve its payment, so the combined operation is refused and
rolled back in strict mode. Use the existing separate purchase and payment
workflow with different staff instead.

## Amount and cost visibility

Invoice-currency `total_cost`, `remaining_currency` and `settlement_status` are
operational settlement fields. Staff with `purchases.create` or
`supplier_payments.record` may read them so they can choose credit versus paid
now and allocate payments correctly. `cost.view` is still required for unit
costs, landed costs, exchange-rate/IQD valuation fields and correction costs.
A user with only `suppliers.view` receives neither operational totals nor cost
details.

The last-price endpoint is deliberately cost-gated:
`GET /admin/purchase-costs/variants/{id}/last` requires `cost.view` and returns
the latest posted base-unit cost, invoice currency/date, supplier and invoice.
The lot list can use `sort_by=entry_date&sort_direction=desc`; callers do not
need to infer the latest lot from the first page of an expiry-sorted list.

Supplier search is server-side across name and phone. `sort_by=recent_purchase`
orders suppliers by their most recently posted purchase, with never-used
suppliers last.

## Courier companies

Courier companies are accountless delivery parties with a company name, phone
and optional contact person. They use the existing assignment, handover,
delivery, custody and cash-receipt rules. They do not use external-driver trip
fare records, and this change does not add a delivery application.
