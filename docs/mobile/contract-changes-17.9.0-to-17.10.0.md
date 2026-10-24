# Mobile contract changes: 17.9.0 to 17.10.0

Contract 17.10.0 is additive and backward compatible. No existing field,
status, route, or error code changed meaning.

## Public settings

`GET /settings` now declares `timezone`. Its launch value is
`Asia/Baghdad`, which is the authoritative timezone for business-date labels
and calendar boundaries. Clients should use this value for display instead of
assuming the phone's local timezone.

## Current user

All `User` responses, including `GET /me`, add
`preferred_ui_language: "ar" | "en"`. Existing users default to `ar`.
`PATCH /me` accepts that field so staff can save their Web Admin preference.
The customer app may preserve or ignore the field; it does not change content
localization or authorization.

## Release identity

The new unauthenticated `GET /version` returns:

```json
{
  "release": "v1.0.0-rc3",
  "commit": "0123456789abcdef..."
}
```

Tagged production images contain the actual tag and commit. Local builds use
`development` and `unknown` unless the build variables are supplied.

## Staff-only changes

Localized permission metadata, normalized Admin catalog search, bulk-image
failure reporting, and product delete-or-archive are Admin-only and require no
mobile work.
