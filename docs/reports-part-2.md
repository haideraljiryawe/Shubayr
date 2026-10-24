# Reports part 2

These phase-12 reports follow the same accounting boundary as part 1: only
posted journal entries and their immutable operational dimensions count. Dates
are Asia/Baghdad business dates, IQD values are exact decimal strings, and each
response says whether its range touches an open period.

- Cash starts with each cash account's posted opening balance, classifies every
  period debit and credit by source, and proves opening + inflows - outflows =
  closing.
- Delivery custody shows goods and cash per internal delivery party or external
  driver. Goods cost is conditional on a cost-bearing permission; party phone
  numbers are never included.
- Liabilities reconciles supplier payable, accrued expense and refund payable
  documents to accounts 2000, 2040 and 2030 and includes other posted liability
  accounts in the ledger total. Unallocated cash-receipt remainders remain an
  explicitly non-ledger-valued operational queue under the phase-8 accounting
  decision; loyalty points likewise expose a count but no invented IQD value.
- Inventory valuation reconstructs physical location balances from immutable
  stock movements at original movement cost, grouped by SKU and warehouse with
  category and department dimensions. Its total is compared with inventory GL
  account 1000.
- The dashboard is permission-filtered rather than controlled by the
  `ADMIN_MODULES` presentation switch. Order, stock, cash and liability sections
  are omitted when the caller lacks their permission; gross profit is present
  only with `reports.profit.read`.

All part-2 detail sets are database-paginated. CSV/XLSX/PDF exports use the same
background queue and progress endpoints as reports part 1. Cost-bearing reads
are audited with actor and parameters.
