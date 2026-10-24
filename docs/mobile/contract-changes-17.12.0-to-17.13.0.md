# Mobile contract changes: 17.12.0 → 17.13.0

This is an additive, backward-compatible customer sign-in change approved for
Ahmed's Flutter client. No `mobile/` source is changed by the backend PR.

## Requesting a code

`POST /auth/request-otp` success may now include:

```json
{ "otp_sent": true, "resend_after_seconds": 60 }
```

Start the resend countdown from the server value. A refused request returns
HTTP 429 with one of these stable codes, localized `message_ar` / `message_en`,
and `retry_after_seconds`:

- `OTP_RESEND_TOO_SOON`: keep resend disabled for the supplied duration;
- `OTP_PHONE_QUOTA_EXCEEDED`: explain that the phone limit was reached;
- `OTP_IP_QUOTA_EXCEEDED`: explain that the network limit was reached.

Do not infer a timer from provider text. OTPIQ's own 429 remains the safe HTTP
503 code `OTP_DELIVERY_UNAVAILABLE`, because it is an upstream delivery failure.

## Verifying a code

An incorrect code can include `attempts_remaining` on the HTTP 401 Error body.
Show the remaining count when present. On `OTP_ATTEMPTS_EXCEEDED`, show “request
a new code” and disable further verification of that code; the backend has
already invalidated it. Continue supporting a generic `UNAUTHORIZED` response
when there is no current unexpired challenge to count.

All new fields are optional so older servers and in-flight responses remain
valid. The server remains authoritative for every cooldown, quota and attempt.
