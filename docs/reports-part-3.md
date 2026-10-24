# Reports part 3

API 17.6.0 completes the phase-12 report list. These reads use posted documents
and journal entries only, apply Asia/Baghdad business dates, return exact IQD
decimal strings, mark open periods, paginate detail in the database and include
stable drill-down parameters.

- Purchases groups quantities, base cost, landed cost, supplier returns and net
  cost by period, supplier, SKU or category.
- Supplier statement shows opening balance, invoices, payments, credits, FX
  differences, supplier returns and closing balance, with an explicit accounts
  payable reconciliation.
- Stock movement reconstructs opening and closing quantity/value per SKU and
  warehouse and separates receipts, sales issues, returns, transfers, counts
  and write-downs. Closing value reconciles with inventory valuation.
- Expenses groups immediate expenses, prepaid amortisation and correction
  effects by category, payee or month and reconciles with the P&L expense
  accounts.

All four reports use the existing background export queue for CSV, XLSX and PDF.
CSV begins with a UTF-8 BOM, and every format supports Arabic headings. Report
rows carry document/resource identifiers and query parameters for drill-down.
Cost-bearing reads and exports are audited.

The earlier reports remain unchanged: C14 delivered sales, profitability, P&L,
trial balance and balance sheet; C14b delivered cash, delivery custody,
liabilities, inventory valuation and the owner dashboard. Phase-3 cash-account
transfers are reused. Agent wages remain outside Shubayr under the 2026-10-17
decision.
