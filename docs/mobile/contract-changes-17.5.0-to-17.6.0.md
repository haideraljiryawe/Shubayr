# Mobile contract note: 17.5.0 to 17.6.0

The only mobile-facing contract clarification is the public settings field
`return_window_days`.

- `GET /settings` keeps `return_window_days` optional and nullable.
- The Admin save now accepts `null`, matching the public read: `null` means the
  owner has not published a return-window value.
- There is no new setting or endpoint migration. Mobile should keep handling
  the already-declared nullable field.

This is additive and does not change the shape of a valid mobile response. All
prepaid-expense, owner-money and report additions are authenticated Web Admin
APIs and require no mobile work.
