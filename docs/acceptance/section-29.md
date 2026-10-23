# Section 29 acceptance traceability

This matrix expands every semicolon-separated or sentence-level claim in
Section 29 of the approved v5.1 analysis into an independently traceable item.
`Proven` means an automated check runs on PostgreSQL through
`backend/test/run-acceptance.mjs` unless the evidence explicitly names the
Flutter CI suite. Assertion text in quotation marks is the test's exact name.

The phase-10 wage and agent-netting requirements are excluded by the approved
[2026-10-17 decision](../decisions/2026-10-17.md). External-driver fare
settlement remains covered because it is not agent payroll.

## Access and interfaces

| ID | Individual claim | Status | Exact evidence |
|---|---|---|---|
| A01 | Work roles cannot use shopping routes. | Proven | `access-model.acceptance.mjs` — “admin bearer token refused on app routes” matrix. |
| A02 | Order-monitor edits are refused. | Proven | `access-model.acceptance.mjs` — monitor write matrix; `phase2-monitoring.acceptance.mjs` — “monitor writes are forbidden”. |
| A03 | An agent is limited to delivery work. | Proven | `access-model.acceptance.mjs` — agent app-route allow/deny matrix; `deliveries.acceptance.mjs` — other-agent delivery is 404. |
| A04 | The phone role is assigned by the server. | Proven | `access-model.acceptance.mjs` — OTP login ignores client role and returns the stored surface/role. |
| A05 | Permission changes take effect immediately. | Proven | `access-model.acceptance.mjs` — “revoked permission invalidates the old token immediately”. |
| A06 | Transitions without their permission are refused. | Proven | `admin-orders.acceptance.mjs`, `returns.acceptance.mjs`, `expenses.acceptance.mjs` — transition-specific 403 checks. |
| A07 | Notification read state is shared between phone and web. | Proven | `notifications.acceptance.mjs` — “reading through one session is visible to the other session” and unread-count checks. |
| A08 | Flutter pagination and chips remain functional. | Proven | Mobile CI: `monitoring_test.dart` — “pagination, filter reset, and session changes discard late results”; `orders_screen_test.dart` — “a status chip filters the list to matching orders”; catalog filter/pagination widget tests. |

## Orders and stock

| ID | Individual claim | Status | Exact evidence |
|---|---|---|---|
| O01 | With five available, two concurrent orders of three cannot both reserve. | Proven | `order.acceptance.mjs` — concurrent last-stock checkout; “one concurrent order succeeds” and “stock is never over-reserved”. |
| O02 | Resubmitting an order does not duplicate it. | Proven | `order.acceptance.mjs` — “idempotent order replay returns the original order”. |
| O03 | Reservation and release quantities are correct. | Proven | `order.acceptance.mjs` and `inventory-costing.acceptance.mjs` — reservation totals and cancellation release assertions. |
| O04 | Issue happens once. | Proven | `inventory-lifecycle.acceptance.mjs` — “delivery settles custody without deducting warehouse stock twice”. |
| O05 | FIFO and FEFO choose the correct lot. | Proven | `inventory-costing.acceptance.mjs` — “FIFO uses oldest received lot”; “FEFO breaks an expiry tie by oldest received lot and splits locations”. |
| O06 | A damaged reserved lot is replaced by a valid lot. | Proven | `inventory-costing.acceptance.mjs` — damaged-lot reallocation assertions and no phantom reservation. |
| O07 | Failed delivery and retry do not issue stock twice. | Proven | `inventory-lifecycle.acceptance.mjs` — failure/retry movement counts; `phase8-closing.acceptance.mjs` — “failed delivery is fully retrieved”. |
| O08 | Acceptance timeout respects business hours. | Proven | `phase2-monitoring.acceptance.mjs` — closed-hour deadline calculation and timeout worker assertions. |
| O09 | Manual acceptance racing auto-cancel has one outcome. | Proven | `admin-orders.acceptance.mjs` — acceptance/timeout concurrency scenario and version conflict. |
| O10 | Restoring a draft has no stock effect. | Proven | `purchasing.acceptance.mjs` — private draft restore and stock/subledger unchanged. |
| O11 | Negotiation is disabled in every API/interface. | Proven | `c5b-gaps.acceptance.mjs` — negotiation routes/fields are absent or refused; Web/Admin/Mobile contract drift suites. |
| O12 | Old negotiation reservations are released. | Proven | `c5b-gaps.acceptance.mjs` — legacy negotiation cleanup leaves no reservation. |

## Purchasing and costing

| ID | Individual claim | Status | Exact evidence |
|---|---|---|---|
| P01 | Repeated purchases at different costs retain their costs. | Proven | `purchasing.acceptance.mjs` — “each receipt keeps its own historical lot cost”. |
| P02 | A purchase between two issues does not change the first issue cost. | Proven | `inventory-lifecycle.acceptance.mjs` — fixed custody/COGS issue-cost assertions. |
| P03 | Reserved stock remains in weighted-average book quantity. | Proven | `inventory-costing.acceptance.mjs` — reserve/release leaves average and book value unchanged. |
| P04 | Cartons convert to pieces at the correct unit cost. | Proven | `purchasing.acceptance.mjs` — “two packs of twelve receive 24 base units”; “pack cost is converted to a 5,000 per-base-unit cost”. |
| P05 | One SKU can be held across two locations. | Proven | `inventory-costing.acceptance.mjs` — FEFO split-location allocation and location-level balance checks. |
| P06 | Landed cost is allocated by the selected basis. | Proven | `purchasing.acceptance.mjs` — “landed cost allocates by line value”. |
| P07 | Landed-cost rounding sums exactly to the source amount. | Proven | `purchasing.acceptance.mjs` — “landed allocation has no rounding remainder”. |
| P08 | A new purchase after zero balance establishes a new average. | Proven | `inventory-costing.acceptance.mjs` — zero-balance/new-receipt scenario. |
| P09 | A partial customer return after an average change uses original issue cost. | Proven | `returns.acceptance.mjs` — return-in posting at stored issue cost; `inventory-lifecycle.acceptance.mjs` reconciliation. |
| P10 | Supplier return quantity and supplier value difference are separate. | Proven | `purchasing.acceptance.mjs` — exact-lot supplier return and separate supplier credit/value posting. |
| P11 | A cost correction after partial issue splits warehouse/custody/COGS. | Proven | `purchasing.acceptance.mjs` — “cost correction assigns six units to warehouse inventory”, “two units to custody”, “two sold units to COGS”. |
| P12 | An internal transfer preserves total quantity and value. | Proven | `inventory-costing.acceptance.mjs` — transfer source/destination and unchanged control totals. |
| P13 | Price changes do not rewrite an existing cart. | Proven | `order.acceptance.mjs` — explicit price-change acceptance token and preserved seen price. |
| P14 | Price changes do not rewrite an earlier order. | Proven | `order.acceptance.mjs` — snapshotted order line price remains immutable. |

## Currencies

| ID | Individual claim | Status | Exact evidence |
|---|---|---|---|
| C01 | An IQD purchase posts without conversion. | Proven | `purchasing.acceptance.mjs` — local moving-average invoices and IQD AP totals. |
| C02 | A foreign purchase fixes its transaction rate. | Proven | `purchasing.acceptance.mjs` — “USD purchase freezes its 1,500 invoice rate”. |
| C03 | Local landed cost on a foreign purchase is not converted twice. | Proven | `purchasing.acceptance.mjs` — mixed-currency landed-cost allocation and paid-now full-total assertions. |
| C04 | Central-rate updates do not change purchase history. | Proven | `purchasing.acceptance.mjs` and `catalog-v2.acceptance.mjs` — historical invoice/lot cost remains fixed. |
| C05 | Central-rate updates do not change past orders. | Proven | `catalog-v2.acceptance.mjs` — published-price versioning and order snapshot checks. |
| C06 | Saving only a rate does not publish linked prices. | Proven | `catalog-v2.acceptance.mjs` — rate-only preview/save scenario. |
| C07 | Publishing linked prices updates only linked products. | Proven | `catalog-v2.acceptance.mjs` — linked rows update and “unlinked product price is unchanged”. |
| C08 | Linked prices rise and fall with configured rounding. | Proven | `catalog-v2.acceptance.mjs` — exact 18,750 rise plus downward publish assertions. |
| C09 | A stale linked-price preview is refused. | Proven | `catalog-v2.acceptance.mjs` — stale preview conflict. |
| C10 | Missing exchange rates are refused. | Proven | `financial-core.acceptance.mjs` and `purchasing.acceptance.mjs` — missing applicable rate checks. |
| C11 | Zero and negative rates are refused. | Proven | `financial-core.acceptance.mjs` — “invalid zero rate” and “invalid negative rate”. |
| C12 | A wrongly directed/base rate is refused. | Proven | `financial-core.acceptance.mjs` — normalized basis and base-currency rate rules. |
| C13 | Returns after a rate change use stored paid shares. | Proven | `returns.acceptance.mjs` — “approval never recomputes current price”. |
| C14 | Currency codes are consistent on app, web and documents. | Proven | `financial-core.acceptance.mjs` — “cash-account money responses carry a currency code”; strict response validation plus Web/Mobile generated-contract CI. |
| C15 | Finance code resolves the configured base currency rather than assuming a conversion rate. | Proven | `financial-core.acceptance.mjs` — base-currency discovery and rate-one rules; `currency.service.spec.ts` — “uses one only for the configured base currency”. Release 1 configuration remains IQD by project definition. |

## Suppliers and operations

| ID | Individual claim | Status | Exact evidence |
|---|---|---|---|
| S01 | Cash purchase. | Proven | `purchasing.acceptance.mjs` — atomic paid-now invoice has zero remainder. |
| S02 | Credit purchase. | Proven | `purchasing.acceptance.mjs` — open invoice/AP assertions. |
| S03 | Partial purchase payment. | Proven | `purchasing.acceptance.mjs` — “partial IQD payment leaves the USD invoice open”. |
| S04 | One supplier payment allocates to several invoices. | Proven | `purchasing.acceptance.mjs` — Section 13.4 exact 100,000 + 50,000 allocation. |
| S05 | Overpayment becomes explicit supplier credit. | Proven | `purchasing.acceptance.mjs` — “unallocated payment remainder becomes supplier credit”. |
| S06 | Foreign debt paid in IQD posts the exact realised FX difference. | Proven | `purchasing.acceptance.mjs` — Section 17.1 exact 2,000 loss and 2,000 gain. |
| S07 | Supplier return before payment adjusts debt without cash. | Proven | `purchasing.acceptance.mjs` — supplier-return credit-note scenario. |
| S08 | Supplier return after payment creates/uses supplier credit without inventing cash. | Proven | `purchasing.acceptance.mjs` — paid return/credit scenario. |
| S09 | Reversing a supplier payment does not change stock. | Proven | `phase8-closing.acceptance.mjs` — payment reversal and unchanged stock/book value. |
| S10 | Supplier statements reconcile. | Proven | `purchasing.acceptance.mjs` — “statement running balance equals the supplier balance”; final AP reconciliation. |
| S11 | A stock movement racing a count makes the stale count fail. | Proven | `inventory-costing.acceptance.mjs` — “Stale snapshot test”. |

## Custody and returns

| ID | Individual claim | Status | Exact evidence |
|---|---|---|---|
| R01 | The 150,000 / 120,000 / 30,000 custody example reconciles. | Proven | `cash-receipts.acceptance.mjs` — Section 14.2 exact named assertions. |
| R02 | One order can be settled by several receipts. | Proven | `cash-receipts.acceptance.mjs` — Section 14.2 order B receives 20,000 then 30,000. |
| R03 | One receipt can settle several orders. | Proven | `cash-receipts.acceptance.mjs` — Section 14.2 first receipt. |
| R04 | Unallocated receipt can be allocated later without second cash receipt. | Proven | `cash-receipts.acceptance.mjs` — unallocated-create and later-allocation assertions. |
| R05 | A voucher can be reversed partly. | Proven | `cash-receipts.acceptance.mjs` — partial voucher reversal. |
| R06 | An allocation can be corrected without new cash. | Proven | `cash-receipts.acceptance.mjs` — allocation-only reversal/correction journal checks. |
| R07 | Two staff cannot settle the same collection twice. | Proven | `cash-receipts.acceptance.mjs` — concurrent receipt conflict and one durable allocation. |
| R08 | A delivery party cannot approve receipt from its own custody. | Proven | `cash-receipts.acceptance.mjs` — `SELF_CUSTODY_CASH_ACTION_FORBIDDEN`. |
| R09 | Reassignment does not move already collected cash. | Proven | `delivery-parties.acceptance.mjs` — reassignment preserves prior party cash statement. |
| R10 | Pending bank transfer remains unsettled until confirmation. | Proven | `cash-receipts.acceptance.mjs` — pending/confirmed bank-transfer states. |
| R11 | Short collection after real delivery remains visible. | Proven | `delivery-collection.acceptance.mjs` — 95,000/10,000 shortfall posting. |
| R12 | Refund before custody settlement uses its explicit source. | Proven | `returns.acceptance.mjs` — uncollected offset and delivery-custody refund. |
| R13 | Refund after settlement uses store cash without reopening party debt. | Proven | `returns.acceptance.mjs` and `custody-exceptions.acceptance.mjs`. |
| R14 | Successive returns preserve exact rounding shares. | Proven | `returns.acceptance.mjs` — stored allocation cursor and over-return checks. |
| R15 | Returns reverse earned and restore redeemed points. | Proven | `returns.acceptance.mjs` — “points follow the returned paid share”. |
| R16 | Delivery-fee refunds are capped and paid once. | Proven | `returns.acceptance.mjs` — fee preview/approval and repeat-refusal assertions. |
| R17 | Concurrent refund attempts create one payment. | Proven | `returns.acceptance.mjs` — idempotent/concurrent entitlement lock checks. |

## Wages and agent netting

| ID | Individual claim | Status | Decision evidence |
|---|---|---|---|
| W01 | Salary-only payroll. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |
| W02 | Per-delivered-order-only payroll. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |
| W03 | Salary plus per-order payroll. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |
| W04 | Partial-month proration. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |
| W05 | Mid-month rate changes do not overlap. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |
| W06 | Payroll cannot be duplicated. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |
| W07 | Failure/retry/re-sent delivery updates create one wage accrual. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |
| W08 | Rate changes do not recalculate historical wages. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |
| W09 | Custody transfers do not duplicate success wages. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |
| W10 | A later customer return keeps a valid wage. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |
| W11 | Numeric wage/netting examples A–D. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md); each example also has its own numeric row below. |
| W12 | Wages can be paid in instalments. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |
| W13 | Salary and several wage items can net against several collections. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |
| W14 | Netting cannot exceed either side. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |
| W15 | Refund/netting, concurrent payment and lost-response races do not duplicate value. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |
| W16 | Netting reversal creates no phantom cash. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |
| W17 | Correcting an already-paid wage accrual preserves history. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |
| W18 | Permission and own-favour checks are enforced. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |
| W19 | Wage/netting documents respect period close. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |
| W20 | Wage statements reconcile to ledger, cash and expense reports. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |

## External drivers

| ID | Individual claim | Status | Exact evidence |
|---|---|---|---|
| D01 | Staff can complete a trip for a driver with no account. | Proven | `external-driver-trips.acceptance.mjs` — full create/add/handover/deliver/settle/close path. |
| D02 | Delivery can precede collection confirmation. | Proven | `external-driver-trips.acceptance.mjs` — unconfirmed delivery queue. |
| D03 | Later confirmation creates no phantom cash or second sale. | Proven | `external-driver-trips.acceptance.mjs` — later-confirm journal delta; `delivery-collection.acceptance.mjs`. |
| D04 | Short collection is explicit. | Proven | `external-driver-trips.acceptance.mjs` — short confirmation and open exception. |
| D05 | Excess collection is explicit and not revenue. | Proven | `external-driver-trips.acceptance.mjs` — excess/unallocated checks. |
| D06 | Re-sent actions are idempotent. | Proven | `external-driver-trips.acceptance.mjs` — stable operation replay results. |
| D07 | Examples 1–3 reconcile. | Proven | `external-driver-trips.acceptance.mjs` — store-paid, direct-fare and multi-order partial-settlement scenarios; exact figures are also listed below for UAT. |
| D08 | A prepaid fare is not deducted twice. | Proven | `external-driver-trips.acceptance.mjs` — prepaid fare handover/settlement checks. |
| D09 | A customer-paid fare stays outside store ledgers. | Proven | `external-driver-trips.acceptance.mjs` — direct-fare ledger absence. |
| D10 | One payment can cover several trips. | Proven | `external-driver-trips.acceptance.mjs` — multi-trip receipt allocation. |
| D11 | Mixed multi-order outcomes do not duplicate fare, issue or collection. | Proven | `external-driver-trips.acceptance.mjs` — delivered/failed/return-at-door trip. |
| D12 | Cancellation after dispatch supports partial and full physical return. | Proven | `external-driver-trips.acceptance.mjs` and `phase8-closing.acceptance.mjs`. |
| D13 | A settled order can later be returned. | Proven | `returns.acceptance.mjs` — settled cash refund path. |
| D14 | Refund source can be store cash or driver custody. | Proven | `returns.acceptance.mjs` — both refund methods. |
| D15 | Changing driver does not rename/move custody. | Proven | `external-driver-trips.acceptance.mjs` — transfer-voucher requirement. |
| D16 | Disabling a driver preserves debt/history. | Proven | `external-driver-trips.acceptance.mjs` — disabled-record statement checks. |
| D17 | Permissions, close and concurrency are enforced. | Proven | `external-driver-trips.acceptance.mjs` — forbidden transition, closed period and replay/concurrency checks. |
| D18 | Trip reports reconcile. | Proven | `external-driver-trips.acceptance.mjs` — trip settlement versus custody/ledger reconciliation. |

## Close and expenses

| ID | Individual claim | Status | Exact evidence |
|---|---|---|---|
| E01 | Paying 150,000 over several supplier lists allocates exactly. | Proven | `purchasing.acceptance.mjs` — Section 13.4 worked allocation. |
| E02 | Correcting one paid/partial list does not rewrite payment. | Proven | `purchasing.acceptance.mjs` — exact 150,000 immutability assertion. |
| E03 | Reducing a fully paid list creates supplier credit. | Proven | `phase8-closing.acceptance.mjs` — paid-invoice correction/credit scenario. |
| E04 | Allocation reversal creates no new payment. | Proven | `cash-receipts.acceptance.mjs` and `phase8-closing.acceptance.mjs`. |
| E05 | An accrued expense can be partially paid. | Proven | `expenses.acceptance.mjs` — Section 17 rent 100,000 payment. |
| E06 | The accrued expense can be settled next month without second expense. | Proven | `expenses.acceptance.mjs` — Section 17 rent 200,000 settlement and one accrual journal. |
| E07 | Prepaid expense spans several periods. | Proven | `phase11-12-completion.acceptance.mjs` — monthly schedule exact allocations. |
| E08 | Freight capitalisation is not duplicated as operating expense. | Proven | `purchasing.acceptance.mjs` plus `reports-part1.acceptance.mjs` P&L reconciliation. |
| E09 | Supplier payment is not duplicated as expense. | Proven | `purchasing.acceptance.mjs` and P&L ledger-source assertions. |
| E10 | Owner drawings are excluded from profit. | Proven | `phase11-12-completion.acceptance.mjs` — drawing journals and expenses/P&L checks. |
| E11 | Closed-period edits/postings are refused. | Proven | `phase8-closing.acceptance.mjs`, `expenses.acceptance.mjs`, `inventory-lifecycle.acceptance.mjs`. |
| E12 | Current payment/return for an old document leaves the old as-of report unchanged. | Proven | `phase8-closing.acceptance.mjs` — as-of before/after late settlement. |
| E13 | The next period opens from reconciled closing balances. | Proven | `phase8-closing.acceptance.mjs` — opening carry-forward assertions. |
| E14 | Reopening requires permission and records differences. | Proven | `phase8-closing.acceptance.mjs` — permission, reason, reference close and re-close delta. |
| E15 | Profitability, cash and liabilities reconcile with drill-down. | Proven | `reports-part1.acceptance.mjs`, `reports-part2.acceptance.mjs`, `phase11-12-completion.acceptance.mjs`. |

## SKUs and quantities

| ID | Individual claim | Status | Exact evidence |
|---|---|---|---|
| Q01 | Two variants retain separate averages. | Proven | `inventory-costing.acceptance.mjs` — independent variant cost records. |
| Q02 | Two variants retain separate reference costs. | Proven | `inventory-costing.acceptance.mjs` — variant cost-field assertions. |
| Q03 | Two variants retain separate prices. | Proven | `catalog-v2.acceptance.mjs` — per-variant price reads. |
| Q04 | Buying one variant never changes the other. | Proven | `inventory-costing.acceptance.mjs` — untouched-variant before/after checks. |
| Q05 | Out-of-stock variant is never substituted automatically. | Proven | `inventory-costing.acceptance.mjs` — same-product variant isolation. |
| Q06 | Weight flow 2.5 kg → sell 0.75 → return 0.25 reconciles. | Proven | `inventory-lifecycle.acceptance.mjs` — exact quantity/cost sequence. |
| Q07 | A 0.5 kg balance is low when threshold is 1 kg. | Proven | `inventory-lifecycle.acceptance.mjs` — fractional low-stock status. |
| Q08 | Piece SKUs refuse fractions. | Proven | `purchasing.acceptance.mjs`, `order.acceptance.mjs`, `returns.acceptance.mjs`. |

## Postings and corrections

| ID | Individual claim | Status | Exact evidence |
|---|---|---|---|
| J01 | Full collection posting balances. | Proven | `delivery-collection.acceptance.mjs` — full 105,000 scenario. |
| J02 | Short collection posting balances. | Proven | `delivery-collection.acceptance.mjs` — 95,000 + 10,000 exception. |
| J03 | Unconfirmed collection posting balances. | Proven | `delivery-collection.acceptance.mjs` — awaiting-confirmation account. |
| J04 | Later confirmation moves only the receivable, with no second sale. | Proven | `delivery-collection.acceptance.mjs` — revenue line count unchanged. |
| J05 | Exception resolved by handover balances. | Proven | `custody-exceptions.acceptance.mjs` — missing-cash handover. |
| J06 | Exception resolved by approved loss balances. | Proven | `custody-exceptions.acceptance.mjs` — approved-loss posting. |
| J07 | Return first offsets uncollected amount. | Proven | `returns.acceptance.mjs` — “uncollected cash is offset first”. |
| J08 | Delivery-fee refund is a separate posting line. | Proven | `phase8-closing.acceptance.mjs` — delivery-fee-refund postings. |
| J09 | FX loss posts exactly. | Proven | `purchasing.acceptance.mjs` — Section 17.1 exact 2,000 loss. |
| J10 | FX gain posts exactly. | Proven | `purchasing.acceptance.mjs` — Section 17.1 exact 2,000 gain. |
| J11 | Cost correction splits warehouse/custody/sold quantities correctly. | Proven | `purchasing.acceptance.mjs` — 6/2/2 three-way correction. |
| J12 | Returned custody receives the correction once and undelivered goods never hit COGS. | Proven | `purchasing.acceptance.mjs` — correction plus later custody-return assertions. |
| J13 | The complete database remains balanced after all packs. | Proven | `section29-release.acceptance.mjs` — `S29-GLOBAL-LEDGER`; `inventory-costing.acceptance.mjs`, `purchasing.acceptance.mjs`, and the report packs reconcile their control accounts before later report-only fixtures are inserted. |

## Retrieval and delivery charges

| ID | Individual claim | Status | Exact evidence |
|---|---|---|---|
| T01 | Partial physical return after cancellation leaves open custody. | Proven | `phase8-closing.acceptance.mjs` — partial retrieval. |
| T02 | Full physical return closes custody. | Proven | `phase8-closing.acceptance.mjs` — “failed delivery is fully retrieved”. |
| T03 | Missing quantity remains an exception. | Proven | `phase8-closing.acceptance.mjs` — retrieval loss/exception. |
| T04 | No automatic party charge is created. | Proven | `custody-exceptions.acceptance.mjs` — exception remains under review until approved action. |
| T05 | Failed-delivery goods are re-reserved before retry. | Proven | `inventory-lifecycle.acceptance.mjs` — retrieval/re-reservation assertions. |
| T06 | Retry handover is a new issue, not reuse/double issue. | Proven | `inventory-lifecycle.acceptance.mjs` — movement count and custody lifecycle. |
| T07 | Customer-direct fare plus store delivery fee is refused at creation. | Proven | `external-driver-trips.acceptance.mjs` — double-charge creation refusal. |
| T08 | The same double charge is refused on method change. | Proven | `external-driver-trips.acceptance.mjs` — method-change refusal. |
| T09 | Existing-order agreement changes require documented customer acceptance before dispatch. | Proven | `external-driver-trips.acceptance.mjs` — missing/recorded acceptance checks. |

## Field protection

| ID | Individual claim | Status | Exact evidence |
|---|---|---|---|
| F01 | Below-reference sale is refused without exception. | Proven | `inventory-lifecycle.acceptance.mjs` — below-cost refusal. |
| F02 | Authorised below-reference exception can be used. | Proven | `inventory-lifecycle.acceptance.mjs` — stored override reason. |
| F03 | Discount + points + rounding cannot bypass loss protection. | Proven | `returns.acceptance.mjs` and `delivery-pricing-d1.acceptance.mjs` net-line checks. |
| F04 | A cost rise is applied to later orders only. | Proven | `inventory-lifecycle.acceptance.mjs` — old/new issue-cost snapshots. |
| F05 | Expired exception is refused. | Proven | `inventory-lifecycle.acceptance.mjs` — expiry check. |
| F06 | Concurrent quantity use cannot over-consume an exception. | Proven | `inventory-lifecycle.acceptance.mjs` — concurrent allowance lock. |
| F07 | Future invoice date is refused. | Proven | `purchasing.acceptance.mjs` — future-date 422. |
| F08 | Invoice outside the backdating window is refused. | Proven | `purchasing.acceptance.mjs` — 91-day refusal. |
| F09 | Date in a closed period is refused. | Proven | `expenses.acceptance.mjs` — `EXPENSE_PERIOD_CLOSED`; other posting packs. |
| F10 | Document before system start is refused. | Proven | `financial-core.acceptance.mjs` — system-start boundary. |
| F11 | Valid future due and expiry dates are accepted. | Proven | `purchasing.acceptance.mjs` and `inventory-costing.acceptance.mjs`. |
| F12 | Extra zero/negative/missing/huge values are refused. | Proven | `purchasing.acceptance.mjs`, `qa-fixes.acceptance.mjs`, DTO/strict validation suites. |
| F13 | Arabic/English digits and separators are parsed or rejected predictably. | Proven | `qa-fixes.acceptance.mjs` — localized numeric normalization/refusal matrix. |
| F14 | Pack price and piece price cannot be confused. | Proven | `purchasing.acceptance.mjs` — 2 × 12 and exact per-base cost. |
| F15 | Client-supplied totals are ignored/refused. | Proven | `order.acceptance.mjs`, `purchasing.acceptance.mjs`, `catalog-import-d2.acceptance.mjs`. |
| F16 | Client-supplied exception approval is refused. | Proven | `inventory-lifecycle.acceptance.mjs` — permissioned server-side exception. |
| F17 | Import cannot bypass validation. | Proven | `catalog-import-d2.acceptance.mjs` — mixed preview/commit and no partial writes. |
| F18 | Validation gives stable messages/codes and preserves atomicity. | Proven | `qa-fixes.acceptance.mjs`, strict response validation, and pack-specific rollback assertions. UI form-value preservation is covered by Admin live tests. |

## Numeric worked examples from Sections 12–17

Each example has its own row, including the excluded phase-10 examples.

| ID | Worked example | Status | Exact evidence |
|---|---|---|---|
| X12-1 | 128GB and 256GB variants have separate averages; no substitution. | Proven | `inventory-costing.acceptance.mjs` — variant-isolation scenario. |
| X12-2 | 10 × 10,000 + 10 × 12,000 = 20 / 220,000 / average 11,000; issue 3 = 33,000; remainder 17 / 187,000. | Proven | `purchasing.acceptance.mjs`, `inventory-lifecycle.acceptance.mjs`, and `section29-release.acceptance.mjs` — `S29-WORKED-12.5`. |
| X13-1 | Five purchase rows follow A/A-01 except row 3 at B/B-02; changing default to A-03 moves only following rows. | Proven | `purchasing.acceptance.mjs` — exact A-03/B-02 4/1 location counts; `inventory-costing.acceptance.mjs` location-level split/immutability; Admin purchasing live test “row override stays custom when defaults change”. |
| X13-2 | Lists 100,000 / 70,000 / 50,000; payment 150,000 allocated 100,000 + 50,000; remainders 0 / 20,000 / 50,000. | Proven | `purchasing.acceptance.mjs` — exact Section 13.4 named assertion. |
| X13-3 | Correct second list down 10,000; remainder 10,000; total debt 60,000; payment stays 150,000. | Proven | `purchasing.acceptance.mjs` — exact correction/payment immutability assertions. |
| X13-4 | 100 USD at 1,500; pay 40 USD using 62,000 at 1,550; 2,000 loss; 60 USD / 90,000 remains. | Proven | `purchasing.acceptance.mjs` — exact Section 13.4 loss assertion. |
| X13-5 | Same 40 USD paid with 58,000 at 1,450 gives 2,000 gain. | Proven | `purchasing.acceptance.mjs` — exact Section 17.1 gain assertion. |
| X13-6 | Buy 10 USD at 1,500 = 15,000; reference 12 USD = 18,000; at 1,550 round 18,600 up to 18,750; old cost stays 15,000. | Proven | `catalog-v2.acceptance.mjs` — exact 18,750 linked-price scenario and unchanged historical cost. |
| X14-1 | Collections 100,000 + 50,000; receive 120,000; 30,000 remains; final 30,000 closes. | Proven | `cash-receipts.acceptance.mjs` — exact Section 14.2 assertions. |
| X14-2 | Store fare: collect 105,000, receive 102,000 and settle 3,000 fare once. | Proven | `external-driver-trips.acceptance.mjs` — store-paid fare cash/netting postings. |
| X14-3 | Direct fare: customer pays 103,000; only 100,000 belongs to store; 3,000 never enters ledger. | Proven | `external-driver-trips.acceptance.mjs` — customer-direct fare scenario. |
| X14-4 | Multi-order 150,000, fare 10,000, cash 100,000, net 10,000, remainder 40,000. | Proven | `external-driver-trips.acceptance.mjs` — multi-order partial-settlement allocation/reconciliation. |
| X15-A | Collections 150,000, wages 10,000, cash 140,000, net 10,000. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |
| X15-B | Collections 150,000, wages 10,000, cash 100,000, net 10,000, remainder 40,000. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |
| X15-C | Collections 30,000, wages 50,000, net 30,000, wage remainder 20,000. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |
| X15-D | Orders 100,000 + 50,000; cash 140,000; net 10,000 against 6,000 salary + 4,000 wages. | Excluded | [Decision 2026-10-17](../decisions/2026-10-17.md). |
| X16-1 | Two units total 20,000 with 2,000 discount; returning one refunds 9,000 and leaves the kept unit at 9,000. | Proven | `returns.acceptance.mjs` and `section29-release.acceptance.mjs` — exact `S29-WORKED-16.3`. |
| X16-2 | Party owes 30,000; custody refund 10,000 leaves 20,000; store-cash refund leaves party at 30,000; settled party remains zero. | Proven | `returns.acceptance.mjs` — custody/store/settled refund-source scenarios. |
| X17-1 | Goods 100,000 + fee 5,000, issue cost 60,000: all full/short/unconfirmed/later-confirm/exception/return/fee/FX entries in §17.1. | Proven | `delivery-collection.acceptance.mjs`, `custody-exceptions.acceptance.mjs`, `returns.acceptance.mjs`, `purchasing.acceptance.mjs`; global balance in `section29-release.acceptance.mjs`. |
| X17-2 | Rent 300,000, pay 100,000, liability 200,000; pay remainder later without second expense. | Proven | `expenses.acceptance.mjs` and `section29-release.acceptance.mjs` — `S29-WORKED-17.2`. |
| X17-3 | Buying goods for 500,000 without sale/loss does not reduce profit. | Proven | `reports-part1.acceptance.mjs` — purchase-only inventory fixture excluded from P&L expense/COGS. |

## Summary

| Result | Count |
|---|---:|
| Proven individual Section 29 claims | 158 |
| Excluded wage/netting claims | 20 |
| Proven numeric worked examples | 17 |
| Excluded numeric wage examples | 4 |
| Remaining gaps | 0 |

The C18 audit found one genuine defect while adding X13-3: purchase-invoice
detail calculated `remaining_currency` from the original total without applying
linked cost corrections. The fix includes correction values at the invoice's
stored transaction rate; the original invoice and actual payment remain
immutable.

## Reproduce a tag

1. Push an annotated or lightweight `v*` tag that points at a green `main`
   commit, or manually run **Release images** and select an existing `v*` tag.
2. Open **Actions → Release images → Tagged acceptance evidence**.
3. Download `acceptance-results-<tag>`. It contains the full log and
   `acceptance-results.json` with schema version, result, pack/assertion counts,
   commit, tag, contract version, UTC timestamps, durations, and each pack's
   result.
4. To reproduce locally, check out the tag, start PostgreSQL/Redis/S3/search as
   described in `backend/README.md`, build the backend, and run:

   ```bash
   cd backend
   ACCEPTANCE_RELEASE_TAG=vX.Y.Z \
   ACCEPTANCE_COMMIT="$(git rev-parse HEAD)" \
   ACCEPTANCE_RESULTS_PATH=acceptance-results.json \
   npm run test:acceptance
   ```

The runner creates uniquely named `shubayr_*_verify` databases and drops them
afterward. Never point it at a shared or production database.
