# Mobile contract note: 17.2.0 to 17.3.0

The only mobile-facing change is additive error handling for
`POST /auth/request-otp`:

- `SMS_NOT_CONFIGURED` (HTTP 503): production SMS is deliberately disabled;
- `OTP_DELIVERY_UNAVAILABLE` (HTTP 503): the configured provider returned a
  failure, could not be reached, or exceeded its request timeout.

Both responses use the existing `Error` envelope. Clients should keep the
phone number on screen, show a retry-later message, and must not treat either
response as an OTP being sent. The backend persists a new OTP only after the
gateway confirms delivery, so the failed code cannot be verified.

All report routes added in 17.3.0 are Web Admin-only and require an admin
surface token; they do not change mobile response shapes.
