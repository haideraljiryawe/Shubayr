# Client migration: API 6.0

API 6.0 separates staff administration from phone-authenticated app use.

Mobile and web-store clients must continue using phone OTP, include
`client: mobile` or `client: web_store` in `POST /auth/verify-otp`, and stop
sending any role field. The returned role is authoritative. Handle
`delivery_agent` and `order_monitor` as work-only accounts; the API returns
`WORK_ACCOUNT_SHOPPING_FORBIDDEN` for purchase functions. Refresh with
`POST /auth/refresh` and revoke with `POST /auth/logout`; a refresh token can
only reproduce its original `app` surface.

The Web Admin must authenticate with `POST /admin/auth/login` using username
and password. When `user.must_change_password` is true, call
`POST /admin/auth/change-password` before any other protected admin route.
Admin clients must migrate from legacy roles/coarse permissions to:

- `/admin/staff` and `/admin/staff/{id}/access`
- `/admin/presets`
- `/admin/permissions`
- `/admin/work-phones`

Do not reuse app tokens for admin calls. Even when the same person owns both
identities, app tokens carry no staff permissions. Clients should recognize
`AUTH_SURFACE_FORBIDDEN`, `PERMISSION_DENIED`, `PASSWORD_CHANGE_REQUIRED`,
`ACCOUNT_LOCKED`, `WORK_ACCOUNT_SHOPPING_FORBIDDEN`, and
`CUSTOMER_PHONE_ALREADY_REGISTERED` in the unchanged unified error envelope.
