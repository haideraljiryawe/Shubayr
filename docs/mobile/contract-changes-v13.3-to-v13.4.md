# Mobile app: API contract changes from 13.3.0 to 13.4.0

For Ahmed's Flutter app on the protected `mobile` branch. This release adds
the phase-8e external-driver trip workflow.

## Impact

There is no mobile runtime break and no mobile code change is required.

All new trip operations are admin-only:

- `GET /admin/external-driver-trips`
- `POST /admin/external-driver-trips`
- `GET /admin/external-driver-trips/{id}`
- `POST /admin/external-driver-trips/{id}/orders`
- `POST /admin/external-driver-trips/{id}/start`
- `POST /admin/external-driver-trips/{id}/close`

The additive fare-netting fields on the staff-only per-party collection list,
trip history on the staff-only party statement, sorting on staff collection
queues, and delivery-party picker search are also admin-surface changes.

Customer order responses, `GET /deliveries/assigned`,
`GET /deliveries/custody`, and the delivery-agent mutation payload retain
their 13.3 shapes. The app should continue using the 13.3 models unchanged.

Do not add an external-driver trip UI to the mobile app: external drivers have
no accounts, and authorised staff intentionally record every trip event.
