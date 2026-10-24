# Reports part 1

The phase-12 reports are read-only views of posted journal entries and the
immutable posted documents that supply operational dimensions. Draft expenses
and unposted returns never count. Reversals remain visible through their
opposite journal lines, so statement totals always use the ledger's net effect.

- Sales recognizes an order on its delivery collection's accounting date. It
  reports gross line value, tier/coupon/other paid-price reductions, posted
  returns, net sales, original and charged delivery fees, fee adjustments and
  delivery-fee refunds. Cancelled and rejected orders are counts only.
- Profitability uses each custody holding's original issue cost. A posted
  return reverses the exact `ReturnItem.issue_cost_value`; damaged/expired
  write-downs remain a separate loss rather than being hidden in gross margin.
- Profit and loss is grouped from ledger accounts. Expense-category lines use
  posted C12 expense documents plus their correction entries, so two
  categories mapped to the same GL account are never double-counted.
- Trial balance and balance sheet aggregate journal lines in the database. The
  balance sheet shows current earnings separately because income and expense
  accounts are not closed into retained earnings during the covered phase.

All dates are Asia/Baghdad business dates. A missing accounting-period row is
treated as open; `touches_open_period` is true if any selected month is not
closed. IQD values are returned as exact decimal strings. Cost and margin data
is available only through `reports.profit.read`, and cost/profit reads are
audited with the actor and report parameters.

CSV exports begin with a UTF-8 BOM for Excel and support Arabic headings. All
CSV/XLSX/PDF exports run on the background worker and are polled through their
progress resource.

PDF exports use the maintained `@digicole/pdfmake-rtl` fork and its bundled
Cairo font. It was selected because it supports Arabic shaping, mixed
bidirectional text, repeated table headers, and server-side rendering without a
browser. The central report template includes the configured store legal name
and managed logo (the logo is omitted, rather than failing the export, if its
stored object is unavailable), report title, readable applied filters, the
exporting staff member, and the export instant formatted in the configured store
timezone. It also includes totals, the open-period warning, repeated headers,
and localized page X of Y footers. `orientation` selects portrait or landscape
and defaults to portrait. Wide reports are split into readable column groups
with the identifying column repeated; cell text wraps rather than being
stretched or clipped. Every PDF contains the complete filtered detail set, not
only the current API page.
