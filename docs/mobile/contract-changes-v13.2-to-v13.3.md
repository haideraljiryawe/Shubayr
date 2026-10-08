# Mobile app: API contract changes from 13.2.0 to 13.3.0

For Ahmed's Flutter app on the protected `mobile` branch. This release adds
the phase-8d staff custody-exception workflow.

## Impact

There is no mobile runtime break and no mobile code change is required.

All new operations are on the admin surface:

- `GET /admin/custody-exceptions`
- `GET /admin/custody-exceptions/{id}`
- `POST /admin/custody-exceptions/goods-loss`
- `POST /admin/custody-exceptions/return-against-uncollected`
- `POST /admin/custody-exceptions/delivery-fee-refund`
- `POST /admin/custody-exceptions/{id}/reversal`

The additive exception fields on
`GET /admin/delivery-parties/{id}/collections`, exception activity in the
admin party statement, and adjusted admin custody totals are staff-only.
Customer order responses, `GET /deliveries/assigned`, and
`GET /deliveries/custody` retain their 13.2 request and response shapes. The
app should therefore continue using the 13.2 models unchanged.

Do not add a mobile custody-exception UI: recording and reversing these
documents requires admin permissions and separation of duties and is
intentionally unavailable to delivery-agent sessions.
