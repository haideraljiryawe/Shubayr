# Mobile app: API contract changes from 13.1.0 to 13.2.0

For Ahmed's Flutter app on the protected `mobile` branch. This release adds
the phase-8c staff cash-receipt workflow.

## Impact

There is no mobile runtime break and no mobile code change is required.

All new operations are on the admin surface:

- `POST/GET /admin/cash-receipts`
- `GET /admin/cash-receipts/unallocated`
- `GET /admin/cash-receipts/allocation-suggestions`
- `GET /admin/cash-receipts/{id}`
- `POST /admin/cash-receipts/{id}/allocations`
- `POST /admin/cash-receipts/{id}/reversal`

The additive settlement fields on
`GET /admin/delivery-parties/{id}/collections` and `cash_activity` on the
admin party statement are also staff-only. Customer order responses,
`GET /deliveries/assigned`, and `GET /deliveries/custody` retain their 13.1
request and response shapes. The app should therefore continue using the
13.1 models unchanged.

Do not add a mobile cash-receipt UI: receiving, allocating, and reversing cash
requires admin permissions and separation of duties and is intentionally not
available to delivery-agent sessions.
