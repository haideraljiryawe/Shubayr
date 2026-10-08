# Mobile contract coverage through 13.4.0

The protected mobile app is covered through the current OpenAPI contract,
13.4.0. The documentation chain is continuous:

| Contract interval | Mobile note                          |
| ----------------- | ------------------------------------ |
| 6.x to 9.x        | `contract-changes-v6-to-v9.md`       |
| 9.x to 10.x       | `contract-changes-v9-to-v10.md`      |
| 10.x to 11.x      | `contract-changes-v10-to-v11.md`     |
| 11.x to 12.0      | `contract-changes-v11-to-v12.md`     |
| 12.x to 13.0      | `contract-changes-v12-to-v13.md`     |
| 13.0 to 13.1      | `contract-changes-v13-to-v13.1.md`   |
| 13.1 to 13.2      | `contract-changes-v13.1-to-v13.2.md` |
| 13.2 to 13.3      | `contract-changes-v13.2-to-v13.3.md` |
| 13.3 to 13.4      | `contract-changes-v13.3-to-v13.4.md` |

The phase-8 closing pack adds no endpoint, schema, enum, error code, or mobile
workflow, so no contract-version bump or generated mobile model change is
needed. It does correct server behavior for the already-contracted
`delivery_fee`: when staff configure a nonzero fee, cart and order totals now
include it. Mobile clients must continue to render the server-provided
`delivery_fee` and `total` fields and must not recompute totals on the
assumption that delivery is free.

No file on the `mobile` branch or in the repository's `mobile/` snapshot was
changed.
