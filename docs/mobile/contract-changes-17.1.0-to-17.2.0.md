# Mobile contract changes: 17.1.0 to 17.2.0

Contract 17.2.0 is additive.

## Public store information

`GET /settings` now always includes these nullable fields:

- `store_legal_name_ar`, `store_legal_name_en`
- `store_address_ar`, `store_address_en`
- `support_phone`, `support_whatsapp`
- `support_email`, `privacy_email`
- `support_hours_ar`, `support_hours_en`
- `refund_days`, `policy_effective_date`
- `return_window_days`

Unset store-specific values are `null`; the app must not invent contact or
legal defaults. `refund_days` and `return_window_days` are integers when set.
The latter is the existing server return-window setting and remains the
authority for return eligibility.

## Account deletion refusal details

A `409 ACCOUNT_DELETION_BLOCKED` response from `DELETE /me/account` keeps its
existing message and `errors` entries and now also includes:

```json
{
  "details": {
    "open_orders": 1,
    "pending_returns": 0,
    "unsettled_amounts": 2
  }
}
```

All three counts are always present. Use `details` for client logic instead of
parsing the English message. The route declares `OPEN_ORDERS`,
`PENDING_RETURNS`, and `UNSETTLED_AMOUNTS` in addition to the top-level
`ACCOUNT_DELETION_BLOCKED` code.
