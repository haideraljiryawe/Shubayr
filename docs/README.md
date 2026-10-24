# Shubayr documentation index

Start here for the maintained engineering, deployment, operating and owner
documentation. The approved v5.1 analysis remains the requirements baseline;
its Section 30 build-status narrative is historical. Use the repository
[CHANGELOG](../CHANGELOG.md) and green CI/release evidence for current status.

## Engineering

- [Approved software analysis v5.1](Shubayr_Software_Engineering_Analysis_v5.1.md)
- [Architecture and mandatory rules](ARCHITECTURE.md)
- [API standards](API_STANDARDS.md)
- [Staff and customer session policy](security/session-policy.md)
- [OpenAPI contract](../api/openapi.yaml)
- [Product decisions](decisions/2026-10-12.md) and
  [phase-10 exclusion](decisions/2026-10-17.md)
- [Contract changelog](../CHANGELOG.md)

## Deploy and operate

- [Production deployment](deploy/production.md)
- [Web/Admin deployment details](deploy/web-and-admin.md)
- [Daily operations and incident runbook](operations/runbook.md)
- [OTPIQ one-message live check (Arabic/English)](operations/otpiq-live-check.md)
- [Push-notification deployment](deploy/push-notifications.md)

## Store owner

- [Owner guide index](owner-guide/README.md)
- [Arabic owner guide](owner-guide/ar.md)
- [English owner guide](owner-guide/en.md)
- [Arabic first-day checklist](owner-guide/first-day-checklist.ar.md)
- [English first-day checklist](owner-guide/first-day-checklist.en.md)

## Acceptance and release evidence

- [Section 29 traceability matrix](acceptance/section-29.md)
- [Arabic owner UAT script (primary)](acceptance/uat-ar.md)
- [English owner UAT script](acceptance/uat-en.md)
- Tagged results: GitHub **Actions → Release images → Tagged acceptance
  evidence → Artifacts → `acceptance-results-<tag>`**. Reproduction steps and
  the JSON fields are documented in the matrix.

Release 1 is not approved merely because the backend suite is green. Section
25.3 also requires integrated interfaces, signed owner UAT, configured
production services, tested restore, monitoring and reconciled opening
balances.
